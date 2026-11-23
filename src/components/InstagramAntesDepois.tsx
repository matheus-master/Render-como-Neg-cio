import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { safeName } from '../lib/upload';
import { Mark } from './ui';

/** "@studio", "studio" ou qualquer link do Instagram → { handle, url }. */
export function instagramOf(raw: string | null | undefined): { handle: string; url: string } | null {
  const v = (raw || '').trim();
  if (!v) return null;
  const m = v.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const handle = (m ? m[1]! : v.replace(/^@/, '').split(/[/?\s]/)[0]!).trim();
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return null;
  return { handle, url: `https://instagram.com/${handle}` };
}

export function InstagramLink({ value, empty = 'Não informado' }: { value: string | null | undefined; empty?: string }) {
  const ig = instagramOf(value);
  if (!ig) return <>{value || empty}</>;
  return (
    <a href={ig.url} target="_blank" rel="noreferrer" className="link" style={{ fontWeight: 500 }}>
      @{ig.handle} ↗
    </a>
  );
}

type Shot = { id: string; kind: 'antes' | 'depois'; file_path: string; taken_on: string; created_at: string; url: string | null };

function useShots(studentId: string) {
  return useQuery({
    queryKey: ['instagram_shots', studentId],
    queryFn: async (): Promise<Shot[]> => {
      const r = await supabase.from('instagram_shots').select('id, kind, file_path, taken_on, created_at').eq('student_id', studentId).order('taken_on', { ascending: false }).order('created_at', { ascending: false });
      if (r.error) throw new Error(r.error.message);
      const rows = r.data as Omit<Shot, 'url'>[];
      if (!rows.length) return [];
      const signed = await supabase.storage.from('files').createSignedUrls(rows.map((x) => x.file_path), 3600);
      const byPath = new Map((signed.data || []).map((s) => [s.path, s.signedUrl]));
      return rows.map((x) => ({ ...x, url: byPath.get(x.file_path) ?? null }));
    },
    staleTime: 30 * 60_000,
  });
}

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const fmt = (d: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);

/** Prints do perfil do Instagram: antes (quando entrou) e depois (evolução), lado a lado. Usado no perfil do aluno e na ficha da equipe. */
export function InstagramAntesDepois({ studentId, instagram, team }: { studentId: string; instagram?: string | null; team?: boolean }) {
  const q = useShots(studentId);
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ kind: 'antes' | 'depois'; file: File; preview: string; date: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Shot | null>(null);
  const target = useRef<'antes' | 'depois'>('antes');

  const shots = q.data || [];
  const antes = shots.find((s) => s.kind === 'antes') || null;
  const depoisAll = shots.filter((s) => s.kind === 'depois');
  const depois = depoisAll.find((s) => s.id === pick) || depoisAll[0] || null;
  const ig = instagramOf(instagram);

  const choose = (kind: 'antes' | 'depois') => {
    target.current = kind;
    input.current?.click();
  };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Envie uma imagem (print da tela).');
    if (f.size > 15 * 1024 * 1024) return toast('Imagem muito grande. O limite é 15 MB.');
    setPending({ kind: target.current, file: f, preview: URL.createObjectURL(f), date: today() });
  };
  const save = async () => {
    if (!pending || busy) return;
    setBusy(true);
    const path = `${studentId}/instagram/${pending.kind}_${Date.now()}_${safeName(pending.file.name)}`;
    const up = await supabase.storage.from('files').upload(path, pending.file, { contentType: pending.file.type, upsert: false });
    if (up.error) {
      setBusy(false);
      return toast('Não deu para enviar a imagem. Tente de novo.');
    }
    // "Antes" é um só: o novo substitui o anterior. "Depois" acumula, para ver a evolução.
    if (pending.kind === 'antes' && antes) {
      await supabase.from('instagram_shots').delete().eq('id', antes.id);
      await supabase.storage.from('files').remove([antes.file_path]);
    }
    const ins = await supabase.from('instagram_shots').insert({ student_id: studentId, kind: pending.kind, file_path: path, taken_on: pending.date });
    setBusy(false);
    if (ins.error) return toast('Não deu para salvar. Tente de novo.');
    URL.revokeObjectURL(pending.preview);
    setPending(null);
    setPick(null);
    await qc.invalidateQueries({ queryKey: ['instagram_shots', studentId] });
    toast(pending.kind === 'antes' ? 'Print do antes salvo.' : 'Print do depois salvo.');
  };
  const remove = async (s: Shot) => {
    if (!confirm('Apagar este print?')) return;
    await supabase.from('instagram_shots').delete().eq('id', s.id);
    await supabase.storage.from('files').remove([s.file_path]);
    setPick(null);
    qc.invalidateQueries({ queryKey: ['instagram_shots', studentId] });
  };

  const Frame = ({ s, kind }: { s: Shot | null; kind: 'antes' | 'depois' }) => (
    <div className="ig-col">
      <div className="between" style={{ alignItems: 'baseline' }}>
        <span className={'ig-tag' + (kind === 'depois' ? ' after' : '')}>{kind === 'antes' ? 'Antes' : 'Depois'}</span>
        {s && <span className="mono" style={{ fontSize: 12, color: 'var(--t3)' }}>{fmt(s.taken_on)}</span>}
      </div>
      {s?.url ? (
        <button className="ig-frame" onClick={() => setZoom(s)} aria-label={`Ampliar print ${kind}`}>
          <img src={s.url} alt={`Instagram ${kind}, ${fmt(s.taken_on)}`} loading="lazy" />
        </button>
      ) : (
        <button className="ig-frame empty" onClick={() => choose(kind)}>
          <Mark m="+" size={22} />
          <b>{kind === 'antes' ? 'Print de quando entrou' : 'Print de agora'}</b>
          <small>{kind === 'antes' ? 'Como o perfil estava antes da mentoria' : 'Como o perfil está hoje'}</small>
        </button>
      )}
      {s && (
        <div className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => choose(kind)}>
            {kind === 'antes' ? 'Trocar print' : <><Mark m="+" size={12} /> Novo print</>}
          </button>
          <button className="rv-x" aria-label="Apagar print" title="Apagar print" onClick={() => remove(s)}><Mark m="×" size={15} /></button>
        </div>
      )}
    </div>
  );

  return (
    <div className="card stack" style={{ gap: 16 }}>
      <div className="between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="h-card">Instagram: antes e depois</div>
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 2, lineHeight: 1.45 }}>
            {team ? 'Prints do perfil do aluno. A equipe também pode subir os prints.' : 'Suba um print do seu perfil de quando entrou e outro de agora. Vá adicionando novos prints para ver sua evolução.'}
          </div>
        </div>
        {ig ? (
          <a href={ig.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">@{ig.handle} ↗</a>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--t4)' }}>{team ? 'Instagram não informado' : 'Coloque seu Instagram em Dados'}</span>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />

      {q.isLoading ? (
        <div className="skel-card" style={{ height: 320 }} />
      ) : q.isError ? (
        <div style={{ fontSize: 14, color: 'var(--err-t)' }}>Não deu para carregar os prints. <button className="link" onClick={() => q.refetch()}>Tentar de novo</button></div>
      ) : (
        <>
          <div className="ig-pair">
            <Frame s={antes} kind="antes" />
            <div className="ig-arrow" aria-hidden>
              <Mark m="→" size={18} />
              {antes && depois && <span className="mono">{daysBetween(antes.taken_on, depois.taken_on)} dias</span>}
            </div>
            <Frame s={depois} kind="depois" />
          </div>
          {depoisAll.length > 1 && (
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Evolução · escolha qual "depois" comparar</div>
              <div className="ig-strip">
                {[...depoisAll].reverse().map((s) => (
                  <button key={s.id} className={'ig-thumb' + (s.id === depois?.id ? ' on' : '')} onClick={() => setPick(s.id)}>
                    {s.url && <img src={s.url} alt="" loading="lazy" />}
                    <span>{fmt(s.taken_on)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {pending && (
        <div className="modal-backdrop" onClick={() => !busy && setPending(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Salvar print" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="h-card">Print do {pending.kind}</div>
            <div className="ig-frame" style={{ maxHeight: 360 }}><img src={pending.preview} alt="Prévia do print" /></div>
            <label className="field">
              <span>Data do print</span>
              <input className="input md" type="date" max={today()} value={pending.date} onChange={(e) => setPending({ ...pending, date: e.target.value || today() })} />
            </label>
            {pending.kind === 'antes' && antes && <div style={{ fontSize: 13, color: 'var(--t3)' }}>Substitui o print do antes que já estava salvo.</div>}
            <div className="row" style={{ gap: 10 }}>
              <button className="btn btn-secondary btn-md" disabled={busy} onClick={() => setPending(null)}>Cancelar</button>
              <button className="btn btn-primary btn-md" style={{ flex: 1 }} disabled={busy} onClick={save}>{busy ? 'Enviando…' : 'Salvar print'}</button>
            </div>
          </div>
        </div>
      )}
      {zoom?.url && (
        <div className="modal-backdrop" onClick={() => setZoom(null)}>
          <div className="ig-zoom" role="dialog" aria-modal="true" aria-label="Print ampliado">
            <img src={zoom.url} alt={`Instagram ${zoom.kind}, ${fmt(zoom.taken_on)}`} />
            <div className="mono">{zoom.kind === 'antes' ? 'Antes' : 'Depois'} · {fmt(zoom.taken_on)} · toque para fechar</div>
          </div>
        </div>
      )}
    </div>
  );
}
