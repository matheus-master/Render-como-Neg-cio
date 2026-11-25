import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ImagePlus, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/auth';
import { useFeatures } from '../lib/data';
import { postSSE, shrinkImage } from '../lib/harvey';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Markdown } from './Markdown';

interface Review { id: string; status: 'rascunho' | 'liberada'; content: string; prints: string[]; note: string; created_at: string; released_at: string | null; seen_at: string | null }

const fmt = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

/** Prints do perfil guardados na pasta do aluno (antes/acompanhamento e os subidos para análise). */
function usePrints(sid: string) {
  return useQuery({
    queryKey: ['ig-prints', sid],
    queryFn: async () => {
      const { data } = await supabase.storage.from('files').list(`${sid}/instagram`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
      const paths = (data || []).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f.name)).map((f) => `${sid}/instagram/${f.name}`);
      if (!paths.length) return [] as { path: string; url: string; kind: string }[];
      const signed = await supabase.storage.from('files').createSignedUrls(paths, 3600);
      return (signed.data || []).filter((s) => s.signedUrl).map((s) => {
        const name = s.path!.split('/').pop()!;
        return { path: s.path!, url: s.signedUrl as string, kind: name.startsWith('antes_') ? 'Antes' : name.startsWith('depois_') ? 'Acompanhamento' : 'Para análise' };
      });
    },
    staleTime: 30 * 60_000,
  });
}

function useReviews(sid: string) {
  return useQuery({
    queryKey: ['ig-reviews', sid],
    queryFn: async () => {
      const r = await supabase.from('instagram_reviews').select('id, status, content, prints, note, created_at, released_at, seen_at').eq('student_id', sid).order('created_at', { ascending: false });
      if (r.error) throw new Error(r.error.message);
      return r.data as Review[];
    },
  });
}

/** Equipe: gera a devolutiva do Instagram com IA a partir dos prints, revisa e libera para o aluno. */
export function InstagramIA({ studentId, name }: { studentId: string; name: string }) {
  const first = name.split(' ')[0];
  const { session } = useAuth();
  const on = useFeatures().data?.harvey ?? false;
  const toast = useToast();
  const qc = useQueryClient();
  const prints = usePrints(studentId);
  const reviews = useReviews(studentId);
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [note, setNote] = useState('');
  const [live, setLive] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [copied, setCopied] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);

  const list = prints.data || [];
  const chosen = sel ?? new Set(list.slice(0, 12).map((p) => p.path));
  const open = (reviews.data || []).find((r) => r.id === openId) || null;
  useEffect(() => { if (open) setDraft(open.content); }, [open?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (p: string) => {
    const n = new Set(chosen);
    if (n.has(p)) n.delete(p);
    else if (n.size < 12) n.add(p);
    else toast('No máximo 12 prints por análise.');
    setSel(n);
  };
  const upload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    setUploading(imgs.length);
    const added: string[] = [];
    for (const f of imgs) {
      const blob = await shrinkImage(f);
      const path = `${studentId}/instagram/analise_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
      const { error } = await supabase.storage.from('files').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) toast('Um print não foi enviado.');
      else added.push(path);
      setUploading((n) => n - 1);
    }
    await qc.invalidateQueries({ queryKey: ['ig-prints', studentId] });
    setSel(new Set([...chosen, ...added].slice(0, 12)));
  };
  const removePrint = async (path: string) => {
    if (!confirm('Apagar este print?')) return;
    await supabase.storage.from('files').remove([path]);
    qc.invalidateQueries({ queryKey: ['ig-prints', studentId] });
  };

  const generate = async () => {
    if (busy || !chosen.size) return;
    setBusy(true);
    setLive('');
    setOpenId(null);
    let newId: string | null = null;
    const r = await postSSE('/api/agents/instagram', { studentId, prints: [...chosen], note }, (ev, d) => {
      if (ev === 'delta') setLive((x) => (x ?? '') + String(d.t || ''));
      if (ev === 'done') newId = (d.reviewId as string) || null;
    });
    if (r.error) toast(r.error);
    await qc.invalidateQueries({ queryKey: ['ig-reviews', studentId] });
    setLive(null);
    setBusy(false);
    if (newId) { setOpenId(newId); setPreview(true); }
  };

  const save = async (patch: Record<string, unknown> = {}) => {
    if (!open) return;
    const { error } = await supabase.from('instagram_reviews').update({ content: draft, updated_at: new Date().toISOString(), ...patch }).eq('id', open.id);
    if (error) return toast('Não deu para salvar.');
    await qc.invalidateQueries({ queryKey: ['ig-reviews', studentId] });
    return true;
  };
  const release = async () => {
    if (!confirm(`Liberar esta devolutiva para ${first}? Ela aparece no Perfil dele.`)) return;
    if (await save({ status: 'liberada', released_at: new Date().toISOString(), released_by: session!.user.id, seen_at: null })) toast(`Liberada. ${first} já vê no Perfil.`);
  };
  const unrelease = async () => { if (await save({ status: 'rascunho' })) toast('Voltou para rascunho. O aluno deixou de ver.'); };
  const remove = async () => {
    if (!open || !confirm('Apagar esta análise?')) return;
    await supabase.from('instagram_reviews').delete().eq('id', open.id);
    setOpenId(null);
    qc.invalidateQueries({ queryKey: ['ig-reviews', studentId] });
  };

  return (
    <div className="card stack" style={{ gap: 16 }}>
      <div>
        <div className="row" style={{ gap: 8 }}>
          <Sparkles size={17} aria-hidden style={{ color: 'var(--gold)' }} />
          <div className="h-card">Análise do Instagram com IA</div>
        </div>
        <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4, lineHeight: 1.5 }}>
          Suba prints do perfil (topo com bio e destaques, grade, stories, um Reels com legenda). A IA escreve a devolutiva no padrão da Taty; você revisa e libera para {first}.
        </div>
      </div>
      {!on && <div className="hv-off" style={{ margin: 0 }}>A análise com IA ainda não foi ligada: falta a chave de IA do portal. Os prints já podem ser organizados aqui.</div>}

      <div>
        <div className="between" style={{ alignItems: 'center', marginBottom: 8 }}>
          <span className="label">Prints · {chosen.size} de {list.length} escolhidos (máx. 12)</span>
          <input ref={fileIn} type="file" accept="image/*" multiple hidden onChange={(e) => { upload([...(e.target.files || [])]); e.target.value = ''; }} />
          <button className="btn btn-secondary btn-sm" onClick={() => fileIn.current?.click()}><ImagePlus size={14} aria-hidden /> Subir prints</button>
        </div>
        {list.length === 0 && !uploading ? (
          <div className="dashed" style={{ padding: 18, fontSize: 14 }}>Nenhum print do Instagram de {first} ainda. Suba os prints do perfil para analisar.</div>
        ) : (
          <div className="igia-grid">
            {list.map((p) => (
              <div key={p.path} className={'igia-print' + (chosen.has(p.path) ? ' on' : '')}>
                <button className="igia-pick" onClick={() => toggle(p.path)} aria-pressed={chosen.has(p.path)}>
                  <img src={p.url} alt={`Print ${p.kind}`} loading="lazy" />
                  <span className="igia-check">{chosen.has(p.path) && <Check size={12} />}</span>
                  <span className="igia-kind">{p.kind}</span>
                </button>
                {p.kind === 'Para análise' && <button className="igia-del" aria-label="Apagar print" onClick={() => removePrint(p.path)}><Trash2 size={12} /></button>}
              </div>
            ))}
            {Array.from({ length: uploading }).map((_, i) => <div key={i} className="igia-print loading" />)}
          </div>
        )}
      </div>
      <label className="field">
        <span>Observação para a IA <small style={{ fontWeight: 400, color: 'var(--t3)' }}>(opcional)</small></span>
        <input className="input md" placeholder="Ex.: quer atender construtoras; perfil pessoal e profissional juntos" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button className="btn btn-primary btn-md" style={{ alignSelf: 'flex-start' }} disabled={!on || busy || !chosen.size} onClick={generate}>
        <Sparkles size={15} aria-hidden /> {busy ? 'Analisando…' : 'Gerar análise'}
      </button>

      {live !== null && (
        <div className="igia-doc">
          {live ? <Markdown text={live} /> : <div className="hv-typing"><i /><i /><i /> <span>Lendo os prints e escrevendo a devolutiva…</span></div>}
        </div>
      )}

      {(reviews.data || []).length > 0 && (
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Análises</div>
          {(reviews.data || []).map((r) => (
            <button key={r.id} className={'igia-row' + (r.id === openId ? ' on' : '')} onClick={() => { setOpenId(r.id === openId ? null : r.id); setPreview(true); }}>
              <span style={{ flex: 1, textAlign: 'left' }}>{fmt(r.created_at)} · {r.prints.length} prints</span>
              {r.status === 'liberada'
                ? <span className="chip" style={{ background: 'var(--ok-bg)', color: 'var(--ok-t)' }}>{r.seen_at ? 'Liberada · vista' : 'Liberada'}</span>
                : <span className="chip chip-soft">Rascunho</span>}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <div className="seg sm" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button className={preview ? 'on' : ''} onClick={() => setPreview(true)}>Como o aluno vê</button>
              <button className={!preview ? 'on' : ''} onClick={() => setPreview(false)}>Editar</button>
            </div>
            <span style={{ flex: 1 }} />
            <button className="btn btn-secondary btn-sm" onClick={async () => { await navigator.clipboard?.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? <Check size={14} /> : <Copy size={14} />} Copiar
            </button>
            <button className="btn btn-secondary btn-sm" style={{ color: 'var(--err-t)' }} onClick={remove}><Trash2 size={14} /> Apagar</button>
          </div>
          {preview ? <div className="igia-doc"><Markdown text={draft} /></div> : <textarea className="textarea igia-edit" value={draft} onChange={(e) => setDraft(e.target.value)} />}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-md" disabled={draft === open.content} onClick={async () => { if (await save()) toast('Rascunho salvo.'); }}>Salvar edição</button>
            {open.status === 'rascunho' ? (
              <button className="btn btn-primary btn-md" onClick={release}>Liberar para {first}</button>
            ) : (
              <button className="btn btn-secondary btn-md" onClick={unrelease}>Voltar para rascunho</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Aluno: a devolutiva de Instagram liberada mais recente. */
export function StudentInstagramReview() {
  const uid = useAuth().session?.user.id;
  const q = useQuery({
    queryKey: ['ig-review-mine', uid],
    enabled: !!uid,
    queryFn: async () => (await supabase.from('instagram_reviews').select('id, content, released_at, seen_at').eq('student_id', uid!).eq('status', 'liberada').order('released_at', { ascending: false }).limit(1).maybeSingle()).data as { id: string; content: string; released_at: string; seen_at: string | null } | null,
  });
  const r = q.data;
  useEffect(() => {
    if (r && !r.seen_at) supabase.from('instagram_reviews').update({ seen_at: new Date().toISOString() }).eq('id', r.id).then(() => undefined);
  }, [r?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!r) return null;
  return (
    <div className="card stack" style={{ gap: 12 }}>
      <div className="between" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <Sparkles size={17} aria-hidden style={{ color: 'var(--gold)' }} />
          <div className="h-card">Devolutiva do seu Instagram</div>
          {!r.seen_at && <span className="chip" style={{ background: 'var(--gold)', color: 'var(--ink)' }}>Nova</span>}
        </div>
        <span style={{ fontSize: 13, color: 'var(--t3)' }}>Equipe RCN · {fmt(r.released_at)}</span>
      </div>
      <div className="igia-doc"><Markdown text={r.content} /></div>
    </div>
  );
}
