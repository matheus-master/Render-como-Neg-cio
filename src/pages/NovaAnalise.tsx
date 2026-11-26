import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { isSlot, MAX_UPLOAD_BYTES, MIN_TEXT_CHARS, SLOT_ORDER, SLOTS } from '../../shared/domain';
import { BackLink, ErrorState, extOf, FileIcon, PageSkeleton, Mark } from '../components/ui';
import { FileStack, FileText, FileUp, Link2, Send, Type } from 'lucide-react';
import { BigButton, DetailCard, Pill, Row, Screen, ScreenHead } from '../components/kit';
import { accessOf, useAuth, useProfile } from '../lib/auth';
import { useDocs } from '../lib/data';
import { fmtMB } from '../lib/format';
import { apiPost, supabase } from '../lib/supabase';
import { safeName, uploadWithProgress, type UploadHandle } from '../lib/upload';

type Mode = 'file' | 'link' | 'text';
type FileState =
  | { st: 'none' }
  | { st: 'uploading'; name: string; size: number; pct: number }
  | { st: 'ready'; name: string; size: number; path: string }
  | { st: 'invalid'; name: string; reason: string };

const ACCEPT = '.pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation';

export default function NovaAnalise() {
  const [params, setParams] = useSearchParams();
  const slotParam = params.get('slot') ?? undefined;
  const slot = isSlot(slotParam) ? slotParam : null;
  const { session } = useAuth();
  const profile = useProfile();
  const docsQ = useDocs();
  const qc = useQueryClient();
  const nav = useNavigate();

  const [mode, setMode] = useState<Mode>('file');
  const [file, setFile] = useState<FileState>({ st: 'none' });
  const [link, setLink] = useState('');
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(false);
  const upload = useRef<UploadHandle | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => upload.current?.cancel(), []);

  if (accessOf(profile).ended)
    return (
      <div className="page">
        <div className="flow" style={{ gap: 16 }}>
          <BackLink to="/documentos">Meus documentos</BackLink>
          <div className="card stack" style={{ gap: 8 }}>
            <div className="h-card">Sua mentoria terminou</div>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>
              Você continua vendo seus documentos e devolutivas, mas o envio de material novo fica fechado. Para renovar, fale com a equipe RCN.
            </div>
          </div>
        </div>
      </div>
    );
  if (docsQ.isLoading) return <div className="page"><PageSkeleton hero={false} /></div>;
  if (docsQ.isError) return <div className="page"><ErrorState onRetry={docsQ.refetch} /></div>;
  const d = slot ? docsQ.docs[slot] : null;
  // Já existe uma versão em andamento: mostra o status em vez de deixar enviar outra.
  if (d && (d.status === 'analise' || d.status === 'revisao')) return <Navigate to={`/documentos/${slot}/status`} replace />;

  const pickFile = (f: File) => {
    upload.current?.cancel();
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf' && ext !== 'docx' && ext !== 'pptx') {
      return setFile({ st: 'invalid', name: f.name, reason: `"${f.name}" não é PDF, Word nem PowerPoint. Exporte como PDF e envie de novo, ou mande um link.` });
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      return setFile({ st: 'invalid', name: f.name, reason: `"${f.name}" tem ${fmtMB(f.size)}. O limite é 50 MB. Comprima o PDF ou mande um link.` });
    }
    setSendErr(false);
    setFile({ st: 'uploading', name: f.name, size: f.size, pct: 0 });
    const path = `${session!.user.id}/${slot}/${Date.now()}_${safeName(f.name)}`;
    const h = uploadWithProgress('submissions', path, f, (pct) => setFile((s) => (s.st === 'uploading' ? { ...s, pct } : s)));
    upload.current = h;
    h.promise.then(
      () => setFile({ st: 'ready', name: f.name, size: f.size, path }),
      (e: Error) => {
        if (e.name === 'AbortError') return;
        setFile({ st: 'none' });
        setSendErr(true);
      },
    );
  };
  const clearFile = () => {
    upload.current?.cancel();
    setFile({ st: 'none' });
  };

  const canSend =
    mode === 'file' ? file.st === 'ready' : mode === 'link' ? /\S+\.\S+/.test(link) && link.trim().length > 8 && !linkErr : text.trim().length >= MIN_TEXT_CHARS;

  const send = async () => {
    if (!canSend || sending || !slot) return;
    setSending(true);
    setSendErr(false);
    try {
      if (mode === 'link') {
        const r = await apiPost<{ ok: boolean; private?: boolean; reason?: string }>('/api/check-link', { url: link.trim() });
        if (!r.ok) {
          setLinkErr(r.reason || 'Não conseguimos abrir esse link.');
          setSending(false);
          return;
        }
      }
      const row = {
        student_id: session!.user.id,
        slot,
        source_kind: mode,
        note: note.trim() || null,
        ...(mode === 'file' && file.st === 'ready' ? { file_path: file.path, file_name: file.name, file_size: file.size } : {}),
        ...(mode === 'link' ? { link_url: link.trim() } : {}),
        ...(mode === 'text' ? { pasted_text: text.trim() } : {}),
      };
      const { data, error } = await supabase.from('submissions').insert(row).select('id').single();
      if (error) throw error;
      // Pede a análise. Se falhar, a tarefa agendada do Worker pega o envio em até 5 minutos.
      apiPost(`/api/submissions/${data.id}/analyze`).catch(() => undefined);
      await qc.invalidateQueries({ queryKey: ['submissions'] });
      nav(`/documentos/${slot}/status`, { replace: true, state: { justSent: true } });
    } catch {
      setSendErr(true);
      setSending(false);
    }
  };

  const nextVersion = d && d.versions.length ? d.versions.length + 1 : null;
  const uploading = mode === 'file' && file.st === 'uploading';
  const sendLabel = uploading ? `Enviando arquivo… ${file.pct}%` : sending ? 'Enviando…' : sendErr ? 'Tentar enviar de novo' : 'Enviar para análise';

  return (
    <Screen>
        <ScreenHead back="/documentos" title={slot ? 'Enviar material' : 'O que você quer enviar?'} sub={slot ? undefined : 'Escolha o material. A equipe lê e devolve a devolutiva em até 48h.'} />

        {!slot ? (
          <div className="k-sec-list">
            {SLOT_ORDER.map((s) => (
              <Row key={s} Icon={FileText} tone={docsQ.docs[s].versions.length ? 'blue' : 'gray'} title={SLOTS[s].title} sub={SLOTS[s].desc} onClick={() => setParams({ slot: s }, { replace: true })} right={docsQ.docs[s].versions.length ? <Pill tone="gray">Versão {docsQ.docs[s].versions.length + 1}</Pill> : undefined} />
            ))}
            <Row Icon={FileStack} title="Vários de uma vez" sub="Escolha todos os arquivos juntos e diga o que é cada um" to="/documentos/lote" />
          </div>
        ) : (
          <>
            <DetailCard Icon={FileText} eyebrow={nextVersion ? `${SLOTS[slot].tipo} · versão ${nextVersion}` : SLOTS[slot].tipo} title={SLOTS[slot].title} sub={undefined}>
              <div className="between" style={{ alignItems: 'center', gap: 12 }}>
                <span className="k-row-sub" style={{ marginTop: 0 }}>{nextVersion ? 'A versão anterior continua no histórico.' : SLOTS[slot].desc}</span>
                <button className="btn btn-soft btn-sm" onClick={() => { clearFile(); setParams({}, { replace: true }); }}>Trocar</button>
              </div>
            </DetailCard>

            <div className="k-sec">
              <div className="k-sec-head"><h2>Como você quer mandar?</h2></div>
              <div className="k-choose" role="tablist">
                {([['file', 'Arquivo', FileUp], ['link', 'Link', Link2], ['text', 'Colar texto', Type]] as const).map(([k, label, Icon]) => (
                  <button key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
                    <Icon size={24} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
              <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickFile(f); }} />

              {mode === 'file' && file.st === 'none' && (
                <button onClick={() => input.current?.click()} className="upload-zone" style={{ borderRadius: 10, background: '#fff', padding: '26px 16px', gap: 4, alignItems: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--ac-soft)', color: 'var(--ac)', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 600, marginBottom: 6 }}><Mark m="↑" size={20} /></div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>Toque para escolher o arquivo</div>
                  <div style={{ fontSize: 14, color: 'var(--t3)' }}>PDF, Word (.docx) ou PowerPoint (.pptx), até 50 MB</div>
                </button>
              )}
              {mode === 'file' && file.st === 'uploading' && (
                <>
                  <div className="card tight stack" style={{ gap: 12 }}>
                    <div className="row">
                      <FileIcon ext={extOf(file.name)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                        <div style={{ fontSize: 14, color: 'var(--t3)' }}>Enviando… {file.pct}%</div>
                      </div>
                      <button onClick={clearFile} aria-label="Cancelar envio" style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', fontSize: 20, color: 'var(--t3)' }}><Mark m="×" size={18} /></button>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--alt3)', overflow: 'hidden' }}>
                      <div style={{ width: file.pct + '%', height: '100%', borderRadius: 4, background: 'var(--ac)', transition: 'width .13s linear' }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--t3)' }}>Pode escrever a observação enquanto o arquivo sobe.</div>
                </>
              )}
              {mode === 'file' && file.st === 'ready' && (
                <div className="card tight row">
                  <FileIcon ext={extOf(file.name)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                    <div style={{ fontSize: 14, color: 'var(--ok)' }}><Mark m="✓" size={13} /> Arquivo pronto · {fmtMB(file.size)}</div>
                  </div>
                  <button onClick={clearFile} aria-label="Remover arquivo" style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', fontSize: 20, color: 'var(--t3)' }}><Mark m="×" size={18} /></button>
                </div>
              )}
              {mode === 'file' && file.st === 'invalid' && (
                <div style={{ border: '1.5px solid var(--err)', borderRadius: 10, background: '#fff', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--err-bg)', color: 'var(--err)', display: 'grid', placeItems: 'center', fontWeight: 600, flex: 'none' }}><Mark m="!" size={12} /></div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--err-t)' }}>Não conseguimos abrir este arquivo</div>
                      <div style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--t2)', marginTop: 2 }}>{file.reason}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button className="btn btn-primary" onClick={() => input.current?.click()}>Escolher outro</button>
                    <button className="btn btn-secondary" onClick={() => setMode('link')}>Enviar link</button>
                  </div>
                </div>
              )}

              {mode === 'link' && (
                <>
                  <input
                    className={'input' + (linkErr ? ' bad' : '')}
                    inputMode="url"
                    placeholder="Cole o link do Drive, Dropbox ou Behance"
                    value={link}
                    onChange={(e) => { setLink(e.target.value); setLinkErr(null); }}
                  />
                  {linkErr ? (
                    <div className="err-text">! {linkErr}</div>
                  ) : (
                    <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--t3)' }}>Confira se o link está aberto para "qualquer pessoa com o link".</div>
                  )}
                </>
              )}

              {mode === 'text' && (
                <>
                  <textarea className="textarea" style={{ minHeight: 160 }} placeholder="Cole aqui o texto da proposta ou do contrato." value={text} onChange={(e) => setText(e.target.value)} />
                  <div style={{ fontSize: 14, color: 'var(--t3)' }}>
                    {text.trim().length} caracteres{text.trim().length < MIN_TEXT_CHARS ? ` · mínimo ${MIN_TEXT_CHARS}` : ''}
                  </div>
                </>
              )}
            </div>

            <div className="k-sec">
              <div className="k-sec-head"><h2>Observação <span style={{ fontWeight: 400, fontSize: 17, color: 'var(--t3)' }}>(opcional)</span></h2></div>
              <textarea className="textarea" placeholder="Ex.: é para uma construtora nova, primeiro contato." value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <div className="k-sticky">
              {sendErr && (
                <div className="alert-err">
                  <div className="ico-circle ico-err"><Mark m="!" size={12} /></div>
                  <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--t2)' }}>
                    <span style={{ fontWeight: 600, color: 'var(--err-t)' }}>O envio não foi concluído.</span> A conexão caiu. Seu material e sua observação continuam aqui.
                  </div>
                </div>
              )}
              <BigButton a={{ label: sendLabel, Icon: Send, onClick: send, disabled: !canSend || sending }} />
              <div style={{ fontSize: 13, color: 'var(--t3)', textAlign: 'center' }}>{canSend ? 'Devolutiva em até 48h.' : 'Adicione o material para enviar. Devolutiva em até 48h.'}</div>
            </div>
          </>
        )}
    </Screen>
  );
}
