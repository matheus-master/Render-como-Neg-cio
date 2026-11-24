import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MAX_UPLOAD_BYTES, SLOT_ORDER, SLOTS, type Slot } from '../../shared/domain';
import { BackLink, ErrorState, extOf, FileIcon, Mark, PageSkeleton } from '../components/ui';
import { accessOf, useAuth, useProfile } from '../lib/auth';
import { useDocs } from '../lib/data';
import { fmtMB } from '../lib/format';
import { apiPost, supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { safeName, uploadWithProgress, type UploadHandle } from '../lib/upload';

type Item =
  | { st: 'ready'; file: File }
  | { st: 'sending'; file: File; pct: number }
  | { st: 'sent'; file: File }
  | { st: 'error'; file: File; reason: string };

const ACCEPT = '.pdf,.docx,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Adivinha o tipo pelo nome do arquivo ("PROPOSTA_CONSTRUTORA.pdf" → proposta para construtoras). */
function guess(name: string): Slot | null {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/contrat/.test(n)) return 'contrato';
  if (/portf|book/.test(n)) return 'portfolio';
  if (/constru|incorpor/.test(n)) return 'proposta_construtoras';
  if (/apresenta|pitch|institucional|\.pptx$/.test(n)) return 'apresentacao';
  if (/arquitet|escritori/.test(n)) return 'proposta_arquitetos';
  return null;
}

const problem = (f: File) => {
  const ext = f.name.split('.').pop()?.toLowerCase();
  if (ext !== 'pdf' && ext !== 'docx' && ext !== 'pptx') return 'Não é PDF, Word nem PowerPoint.';
  if (f.size > MAX_UPLOAD_BYTES) return `Tem ${fmtMB(f.size)}; o limite é 50 MB.`;
  return null;
};

export default function Lote() {
  const q = useDocs();
  const { session } = useAuth();
  const profile = useProfile();
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState<Partial<Record<Slot, Item>>>({});
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const many = useRef<HTMLInputElement>(null);
  const one = useRef<HTMLInputElement>(null);
  const target = useRef<Slot | null>(null);
  const uploads = useRef<UploadHandle[]>([]);
  useEffect(() => () => uploads.current.forEach((u) => u.cancel()), []);

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
  if (q.isLoading) return <div className="page"><PageSkeleton hero={false} /></div>;
  if (q.isError) return <div className="page"><ErrorState onRetry={q.refetch} /></div>;

  // Só dá para mandar o que não está em análise ou revisão.
  const open = SLOT_ORDER.filter((s) => q.docs[s].status === 'none' || q.docs[s].status === 'pronta');
  const blocked = SLOT_ORDER.filter((s) => !open.includes(s));
  const put = (s: Slot, it: Item | undefined) => setItems((old) => ({ ...old, [s]: it }));

  const addMany = (files: File[]) => {
    const next = { ...items };
    const left: string[] = [];
    for (const f of files) {
      const g = guess(f.name);
      const slot = g && open.includes(g) && !next[g] ? g : open.find((s) => !next[s]);
      if (!slot) {
        left.push(f.name);
        continue;
      }
      const p = problem(f);
      next[slot] = p ? { st: 'error', file: f, reason: p } : { st: 'ready', file: f };
    }
    setItems(next);
    setWarn(left.length ? `Sobrou ${left.length === 1 ? 'um arquivo' : left.length + ' arquivos'} (${left.join(', ')}): cada tipo de documento recebe um arquivo por vez.` : null);
  };
  const addOne = (s: Slot, f: File) => {
    const p = problem(f);
    put(s, p ? { st: 'error', file: f, reason: p } : { st: 'ready', file: f });
  };
  const swap = (from: Slot, to: Slot) =>
    setItems((old) => ({ ...old, [from]: old[to], [to]: old[from] }));

  const ready = open.filter((s) => items[s]?.st === 'ready');
  const sendAll = async () => {
    if (!ready.length || busy) return;
    setBusy(true);
    let ok = 0;
    for (const s of ready) {
      const it = items[s]!;
      const f = it.file;
      put(s, { st: 'sending', file: f, pct: 0 });
      try {
        const path = `${session!.user.id}/${s}/${Date.now()}_${safeName(f.name)}`;
        const h = uploadWithProgress('submissions', path, f, (pct) => put(s, { st: 'sending', file: f, pct }));
        uploads.current.push(h);
        await h.promise;
        const { data, error } = await supabase
          .from('submissions')
          .insert({ student_id: session!.user.id, slot: s, source_kind: 'file', file_path: path, file_name: f.name, file_size: f.size })
          .select('id')
          .single();
        if (error) throw error;
        apiPost(`/api/submissions/${data.id}/analyze`).catch(() => undefined);
        put(s, { st: 'sent', file: f });
        ok++;
      } catch {
        put(s, { st: 'error', file: f, reason: 'Não foi enviado. Tente de novo.' });
      }
    }
    await qc.invalidateQueries({ queryKey: ['submissions'] });
    setBusy(false);
    if (ok === ready.length) {
      toast(ok === 1 ? 'Documento enviado.' : `${ok} documentos enviados.`);
      nav('/documentos');
    }
  };

  return (
    <div className="page">
      <div className="flow wide" style={{ gap: 20 }}>
        <BackLink to="/documentos">Meus documentos</BackLink>
        <div style={{ marginTop: -10 }}>
          <h1 style={{ fontWeight: 600, fontSize: 28, letterSpacing: '-.03em' }}>Enviar vários de uma vez</h1>
          <div style={{ fontSize: 15, color: 'var(--t3)', marginTop: 4, lineHeight: 1.5 }}>
            Escolha todos os arquivos juntos. O portal coloca cada um no lugar certo pelo nome do arquivo, e você pode trocar antes de enviar.
          </div>
        </div>

        <input ref={many} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) addMany(fs); }} />
        <input ref={one} type="file" accept={ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f && target.current) addOne(target.current, f); }} />

        {open.length === 0 ? (
          <div className="card" style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>
            Todos os seus documentos já estão com a equipe. Quando a devolutiva chegar, você pode mandar uma nova versão.
          </div>
        ) : (
          <>
            <button
              className="upload-zone"
              disabled={busy}
              onClick={() => many.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (!busy) addMany([...e.dataTransfer.files]); }}
              style={{ borderRadius: 12, background: '#fff', padding: '26px 16px', gap: 4, alignItems: 'center' }}
            >
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--ac-soft)', color: 'var(--ac)', display: 'grid', placeItems: 'center', marginBottom: 6 }}><Mark m="↑" size={20} /></div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>Escolher os arquivos</div>
              <div style={{ fontSize: 14, color: 'var(--t3)' }}>Pode selecionar vários · PDF, Word ou PowerPoint, até 50 MB cada</div>
            </button>
            {warn && <div style={{ fontSize: 14, color: 'var(--warn-t)', background: 'var(--warn-bg)', padding: '10px 12px', borderRadius: 8 }}>{warn}</div>}

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {open.map((s, i) => {
                const it = items[s];
                return (
                  <div key={s} className="lote-row" style={{ borderTop: i ? '1px solid var(--b-div)' : 'none' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{SLOTS[s].title}</div>
                      {q.docs[s].status === 'pronta' && <div style={{ fontSize: 12, color: 'var(--t3)' }}>Vai como nova versão</div>}
                    </div>
                    {it ? (
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        <FileIcon ext={extOf(it.file.name)} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.file.name}</div>
                          <div style={{ fontSize: 12, color: it.st === 'error' ? 'var(--err)' : it.st === 'sent' ? 'var(--ok-t)' : 'var(--t3)' }}>
                            {it.st === 'error' ? it.reason : it.st === 'sent' ? '✓ Enviado' : it.st === 'sending' ? `Enviando… ${it.pct}%` : fmtMB(it.file.size)}
                          </div>
                          {it.st === 'sending' && (
                            <div style={{ height: 4, borderRadius: 2, background: 'var(--alt3)', marginTop: 4, overflow: 'hidden' }}>
                              <div style={{ width: it.pct + '%', height: '100%', background: 'var(--ac)', transition: 'width .3s' }} />
                            </div>
                          )}
                        </div>
                        {!busy && it.st !== 'sent' && (
                          <>
                            {open.length > 1 && (
                              <select className="lote-move" aria-label={`Mover ${it.file.name} para outro tipo`} value={s} onChange={(e) => swap(s, e.target.value as Slot)}>
                                {open.map((o) => <option key={o} value={o}>{SLOTS[o].title}</option>)}
                              </select>
                            )}
                            <button className="rv-x" aria-label={`Tirar ${it.file.name}`} onClick={() => put(s, undefined)}><Mark m="×" size={16} /></button>
                          </>
                        )}
                      </div>
                    ) : (
                      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { target.current = s; one.current?.click(); }} style={{ justifySelf: 'start' }}>
                        <Mark m="+" size={13} /> Escolher arquivo
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {blocked.length > 0 && (
              <div style={{ fontSize: 14, color: 'var(--t3)' }}>
                Já com a equipe: {blocked.map((s) => SLOTS[s].title).join(', ')}.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-primary btn-lg" disabled={!ready.length || busy} onClick={sendAll}>
                {busy ? 'Enviando…' : ready.length > 1 ? `Enviar ${ready.length} documentos` : ready.length === 1 ? 'Enviar 1 documento' : 'Escolha pelo menos um arquivo'}
              </button>
              <div style={{ fontSize: 13, color: 'var(--t3)', textAlign: 'center' }}>
                Quer mandar um link ou colar o texto? <Link className="link" to="/documentos/nova">Envie um por vez</Link>.
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
