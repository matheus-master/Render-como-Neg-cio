import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUp, BarChart3, Check, Clock, Copy, ImagePlus, Lock, MessageCircle, MessageSquarePlus, PanelLeft, Target, Trash2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../lib/auth';
import { useFeatures } from '../lib/data';
import { sendHarvey, signedImages, uploadPrint, useMessages, useThreads, type HMessage } from '../lib/harvey';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { useIsMobile } from '../lib/useIsMobile';

const MODES = [
  { k: '', label: 'Automático', Icon: Wand2, desc: 'o Harvey escolhe sozinho o nível certo para a sua pergunta.' },
  { k: '/consultor', label: 'Consultor', Icon: MessageCircle, desc: 'resposta rápida, com a análise da conversa e uma mensagem pronta para enviar ao cliente.' },
  { k: '/estrategista', label: 'Estrategista', Icon: Target, desc: 'plano completo da negociação: perfil do cliente, objeções, riscos e o caminho até o fechamento.' },
  { k: '/diretor', label: 'Diretor', Icon: BarChart3, desc: 'olha o seu negócio como um todo: funil, conversão e metas, com os números dos seus relatórios.' },
] as const;

const STARTERS: { title: string; sub: string; text: string; print?: boolean; send?: boolean }[] = [
  { title: 'Analisar conversa com cliente', sub: 'Mande o print do WhatsApp', text: '/analisar Analise essa conversa e me diga o que responder.', print: true },
  { title: 'Responder uma objeção', sub: '"Está caro", "vou pensar"…', text: '/objecao O cliente disse: ' },
  { title: 'Follow-up de proposta', sub: 'Cliente sumiu depois do orçamento', text: '/followup Enviei a proposta para [cliente] há [X] dias, no valor de R$ [valor], e ele não respondeu. ' },
  { title: 'Plano de fechamento', sub: 'Conduzir até o sim', text: '/fechamento Estou negociando com [cliente/empresa]: ' },
  { title: 'Analisar meus números', sub: 'Usa os seus relatórios do portal', text: '/diretor Analise meus números dos relatórios e me diga onde está o gargalo do meu funil.', send: true },
  { title: 'Plano comercial do mês', sub: 'Meta, propostas e prospecção', text: '/plano-comercial Minha meta de faturamento é R$ [valor] por mês. ' },
  { title: 'Organizar leads em CRM', sub: 'Fichas e tabela de status', text: '/crm Organize esses leads: ' },
  { title: 'Avaliar minha condução', sub: 'Notas de 0 a 10 e melhorias', text: 'Avalie como eu conduzi essa negociação, com notas de 0 a 10: ', print: true },
];

/** Bloco de citação = mensagem pronta para o cliente, com botão de copiar. */
function Quote({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLQuoteElement>(null);
  const [ok, setOk] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(ref.current?.innerText.trim() || '');
    setOk(true);
    setTimeout(() => setOk(false), 1600);
  };
  return (
    <div className="hv-quote">
      <div className="hv-quote-top">
        <span>Mensagem pronta</span>
        <button onClick={copy}>{ok ? <><Check size={13} /> Copiada</> : <><Copy size={13} /> Copiar</>}</button>
      </div>
      <blockquote ref={ref}>{children}</blockquote>
    </div>
  );
}

function Answer({ text }: { text: string }) {
  return (
    <div className="hv-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ blockquote: Quote, a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function CopyAll({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="hv-copyall" onClick={async () => { await navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1600); }}>
      {ok ? <Check size={13} /> : <Copy size={13} />} {ok ? 'Copiado' : 'Copiar resposta'}
    </button>
  );
}

export default function Harvey() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const mobile = useIsMobile();
  const toast = useToast();
  const qc = useQueryClient();
  const on = useFeatures().data?.harvey ?? false;
  const threads = useThreads();
  const [threadId, setThreadId] = useState<string | null>(null);
  const msgs = useMessages(threadId);
  const [mode, setMode] = useState('');
  const [text, setText] = useState('');
  const [prints, setPrints] = useState<{ path: string; url: string }[]>([]);
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<{ user: HMessage; answer: string } | null>(null);
  const [showList, setShowList] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);

  const list = msgs.data || [];
  const allImages = useMemo(() => [...new Set(list.flatMap((m) => m.images))], [list]);
  const urls = useQuery({ queryKey: ['harvey-img', allImages.join(',')], enabled: allImages.length > 0, staleTime: 50 * 60_000, queryFn: () => signedImages(allImages) });

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [list.length, live?.answer]);
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 220) + 'px';
  }, [text]);

  const addFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/')).slice(0, 4 - prints.length);
    if (!imgs.length) return files.length ? toast('Envie imagens (prints da conversa).') : undefined;
    setUploading((n) => n + imgs.length);
    for (const f of imgs) {
      try {
        const path = await uploadPrint(uid, f);
        const url = URL.createObjectURL(f);
        setPrints((p) => [...p, { path, url }]);
        setLocalUrls((m) => ({ ...m, [path]: url }));
      } catch (e) {
        toast((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const send = async (override?: string) => {
    const body = (override ?? text).trim();
    if ((!body && !prints.length) || busy || uploading || !on) return;
    const full = mode && !body.startsWith('/') ? `${mode} ${body}` : body;
    const images = prints.map((p) => p.path);
    setBusy(true);
    setText('');
    setPrints([]);
    setLive({ user: { id: 'tmp', role: 'user', content: full, images, created_at: new Date().toISOString() }, answer: '' });
    const r = await sendHarvey(
      { threadId, text: full, images },
      { thread: (id) => setThreadId(id), delta: (t) => setLive((l) => (l ? { ...l, answer: l.answer + t } : l)) },
    );
    if (r.error) toast(r.error);
    await Promise.all([qc.invalidateQueries({ queryKey: ['harvey-messages', r.threadId] }), qc.invalidateQueries({ queryKey: ['harvey-threads'] })]);
    setLive(null);
    setBusy(false);
    area.current?.focus();
  };

  const starter = (s: (typeof STARTERS)[number]) => {
    if (s.send) return send(s.text);
    setText(s.text);
    setTimeout(() => { area.current?.focus(); area.current?.setSelectionRange(s.text.length, s.text.length); }, 0);
    if (s.print) fileIn.current?.click();
  };
  const newChat = () => { setThreadId(null); setShowList(false); setText(''); setPrints([]); };
  const remove = async (id: string) => {
    if (!confirm('Apagar esta conversa com o Harvey?')) return;
    await supabase.from('agent_threads').delete().eq('id', id);
    if (id === threadId) setThreadId(null);
    qc.invalidateQueries({ queryKey: ['harvey-threads'] });
  };

  const shown: HMessage[] = live ? [...list, live.user] : list;
  const empty = !threadId && !live;

  const sidebar = (
    <aside className={'hv-side' + (mobile ? ' sheet-like' : '')}>
      <button className="btn btn-primary btn-md" style={{ width: '100%' }} onClick={newChat}><MessageSquarePlus size={16} aria-hidden /> Nova conversa</button>
      <div className="label" style={{ margin: '14px 4px 6px' }}>Conversas</div>
      {(threads.data || []).length === 0 && <div style={{ fontSize: 13, color: 'var(--t3)', padding: '4px' }}>As conversas com o Harvey ficam salvas aqui.</div>}
      {(threads.data || []).map((t) => (
        <div key={t.id} className={'hv-thread' + (t.id === threadId ? ' on' : '')}>
          <button onClick={() => { setThreadId(t.id); setShowList(false); }}>
            <span className="hv-thread-t">{t.title.replace(/^\/[a-z-]+\s*/, '') || 'Conversa'}</span>
            <span className="hv-thread-d">{new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(t.updated_at))}</span>
          </button>
          <button className="rv-x" aria-label="Apagar conversa" onClick={() => remove(t.id)}><Trash2 size={14} aria-hidden /></button>
        </div>
      ))}
    </aside>
  );

  return (
    <div className="hv">
      {!mobile && sidebar}
      {mobile && showList && (
        <div className="modal-backdrop" onClick={() => setShowList(false)}>
          <div className="hv-sheet" onClick={(e) => e.stopPropagation()}>{sidebar}</div>
        </div>
      )}
      <section className="hv-main">
        <header className="hv-head">
          {mobile && <button className="rv-x" aria-label="Conversas" onClick={() => setShowList(true)}><PanelLeft size={18} aria-hidden /></button>}
          <div className="hv-badge" aria-hidden>H</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 17 }}>Harvey</div>
            <div style={{ fontSize: 13, color: 'var(--t3)' }}>
              <span className="hv-head-sub">Consultor, estrategista e diretor comercial</span>
              {mobile && 'Seu diretor comercial'}
            </div>
          </div>
          {!empty && mobile && <button className="rv-x" aria-label="Nova conversa" onClick={newChat}><MessageSquarePlus size={18} aria-hidden /></button>}
        </header>


        <div className="hv-scroll">
          {empty ? (
            <div className="hv-empty">
              <div className="hv-hello">
                <div className="hv-badge big" aria-hidden>H</div>
                <h1>Em que venda a gente trabalha hoje?</h1>
                <p>Mande o print da conversa com o cliente, conte a situação ou peça uma análise dos seus números. O Harvey usa os seus relatórios do portal quando precisa de dados.</p>
              </div>
              <div className="hv-starters">
                {STARTERS.map((s) => (
                  <button key={s.title} disabled={!on} onClick={() => starter(s)}>
                    <b>{s.title}</b>
                    <span>{s.sub}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="hv-thread-msgs">
              {msgs.isLoading && <div className="skel-card" style={{ height: 120 }} />}
              {shown.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="hv-user">
                    {m.images.length > 0 && (
                      <div className="hv-imgs">
                        {m.images.map((p) => {
                          const u = urls.data?.[p] || localUrls[p];
                          return u ? <a key={p} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Print enviado" /></a> : <span key={p} className="hv-img-ph">print</span>;
                        })}
                      </div>
                    )}
                    {m.content && (() => {
                      const cmd = /^\/([a-z-]+)\s*/.exec(m.content);
                      return (
                        <div className="hv-bubble">
                          {cmd && <span className="hv-cmd">{cmd[1].replace('-', ' ')}</span>}
                          {cmd ? m.content.slice(cmd[0].length) : m.content}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div key={m.id} className="hv-bot">
                    <div className="hv-badge sm" aria-hidden>H</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Answer text={m.content} />
                      <CopyAll text={m.content} />
                    </div>
                  </div>
                ),
              )}
              {live && (
                <div className="hv-bot">
                  <div className="hv-badge sm" aria-hidden>H</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {live.answer ? <Answer text={live.answer} /> : <div className="hv-typing"><i /><i /><i /> <span>Harvey está analisando…</span></div>}
                  </div>
                </div>
              )}
              <div ref={end} />
            </div>
          )}
        </div>

        {on ? (
          <div className="hv-composer">
            <div className="hv-mode">
              <div className="hv-mode-row">
                <span className="hv-mode-q">Como o Harvey responde</span>
                <div className="hv-modes" role="radiogroup" aria-label="Como o Harvey responde">
                  {MODES.map((m) => (
                    <button key={m.label} role="radio" aria-checked={mode === m.k} className={mode === m.k ? 'on' : ''} onClick={() => setMode(m.k)}>
                      <m.Icon size={14} aria-hidden /> {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="hv-mode-desc">
                <b>{MODES.find((m) => m.k === mode)!.label}:</b> {MODES.find((m) => m.k === mode)!.desc}
              </div>
            </div>
            {(prints.length > 0 || uploading > 0) && (
              <div className="hv-prints">
                {prints.map((p) => (
                  <div key={p.path} className="hv-print">
                    <img src={p.url} alt="Print anexado" />
                    <button aria-label="Tirar print" onClick={() => setPrints((x) => x.filter((y) => y.path !== p.path))}><X size={12} /></button>
                  </div>
                ))}
                {Array.from({ length: uploading }).map((_, i) => <div key={i} className="hv-print loading" />)}
              </div>
            )}
            <div className="hv-box">
              <input ref={fileIn} type="file" accept="image/*" multiple hidden onChange={(e) => { addFiles([...(e.target.files || [])]); e.target.value = ''; }} />
              <textarea
                ref={area}
                rows={2}
                value={text}
                aria-label="Mensagem para o Harvey"
                placeholder={mobile ? 'Conte a situação do cliente…' : 'Conte a situação do cliente ou cole aqui o print da conversa (Ctrl+V)…'}
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); addFiles(f); } }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !mobile) { e.preventDefault(); send(); } }}
              />
              <div className="hv-box-bar">
                <button className="hv-attach" title="Anexar prints da conversa (até 4)" disabled={busy || prints.length >= 4} onClick={() => fileIn.current?.click()}>
                  <ImagePlus size={17} aria-hidden /> Anexar print{prints.length > 0 && <span className="hv-count">{prints.length}/4</span>}
                </button>
                <span style={{ flex: 1 }} />
                {!mobile && <span className="hv-kbd"><kbd>Enter</kbd> envia · <kbd>Shift</kbd>+<kbd>Enter</kbd> quebra linha</span>}
                <button className="hv-send" disabled={busy || uploading > 0 || (!text.trim() && !prints.length)} onClick={() => send()}>
                  {busy ? 'Pensando…' : 'Enviar'} <ArrowUp size={16} aria-hidden />
                </button>
              </div>
            </div>
            <div className="hv-note"><Lock size={12} aria-hidden /> A equipe RCN pode ver suas conversas com o Harvey para te acompanhar. Não envie senhas nem dados bancários.</div>
          </div>
        ) : (
          <div className="hv-composer">
            <div className="hv-soon">
              <div className="hv-soon-ico"><Clock size={18} aria-hidden /></div>
              <div>
                <b>O Harvey está quase pronto</b>
                <span>A equipe RCN está finalizando a ativação. Quando ele estiver ligado, é só voltar aqui: dá para mandar o print da conversa com o cliente ou contar a situação, e ele responde na hora.</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
