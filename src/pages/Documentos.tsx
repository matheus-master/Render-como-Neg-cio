import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MAX_UPLOAD_BYTES, SLOT_ORDER, SLOTS } from '../../shared/domain';
import { Chip, DocChip, ErrorState, extOf, FileIcon, PageHead, PageSkeleton, VersionChip, Mark } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useDocs, useStudentFiles, type StudentFile } from '../lib/data';
import { fmtDay, fmtDueShort } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { safeName, uploadWithProgress } from '../lib/upload';

const versionsLabel = (n: number) => (n === 1 ? '1 versão' : `${n} versões`);

export default function Documentos() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'hist' ? 'hist' : 'list';
  const q = useDocs();

  return (
    <div className="page">
      <PageHead title="Meus documentos" sub="Envie seus materiais da mentoria. A equipe analisa e devolve uma devolutiva aqui mesmo, em até 48h." />
      <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 360 }} role="tablist">
        {(['list', 'hist'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setParams(k === 'hist' ? { tab: 'hist' } : {}, { replace: true })}>
            {k === 'list' ? 'Documentos' : 'Histórico'}
          </button>
        ))}
      </div>
      {q.isLoading ? <PageSkeleton hero={false} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : tab === 'list' ? <ListTab docs={q.docs} /> : <HistTab docs={q.docs} />}
    </div>
  );
}

function ListTab({ docs }: { docs: ReturnType<typeof useDocs>['docs'] }) {
  const nav = useNavigate();
  const seg = (on: boolean, cur: boolean) => ({ height: 6, borderRadius: 3, background: on ? (cur ? 'var(--ac)' : 'var(--ok)') : '#DCDFE3' });
  return (
    <>
      <div className="label" style={{ marginTop: 4 }}>Com devolutiva</div>
      <div className="grid-320">
        {SLOT_ORDER.map((s) => {
          const d = docs[s], m = SLOTS[s];
          const stage = d.status === 'analise' ? 1 : 2;
          return (
            <div key={s} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="between" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="h-card">{m.title}</div>
                  <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--t3)', marginTop: 2 }}>{m.desc}</div>
                </div>
                <DocChip d={d} />
              </div>
              {d.status === 'none' && (
                <button className="upload-zone" onClick={() => nav(`/documentos/nova?slot=${s}`)}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ac)' }}><Mark m="↑" size={14} /> Enviar para análise</div>
                  <div style={{ fontSize: 13, color: 'var(--t3)' }}>PDF, Word, link ou texto</div>
                </button>
              )}
              {(d.status === 'analise' || d.status === 'revisao') && (
                <Link to={`/documentos/${s}/status`} style={{ background: 'var(--alt)', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                    <div style={seg(true, stage === 1)} />
                    <div style={seg(stage >= 2, stage === 2)} />
                    <div style={seg(false, false)} />
                  </div>
                  <div className="between" style={{ fontSize: 14, gap: 10 }}>
                    <span style={{ color: 'var(--t2)' }}>
                      {d.status === 'analise' ? 'Em análise · leva poucos minutos' : 'Em revisão pela equipe · até ' + fmtDueShort(d.latest!.due_at)}
                    </span>
                    <span style={{ fontWeight: 600, color: 'var(--ac)', whiteSpace: 'nowrap' }}>Acompanhar  →</span>
                  </div>
                </Link>
              )}
              {d.status === 'pronta' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Link to={`/documentos/${s}/devolutiva`} className="btn btn-primary">Ver devolutiva</Link>
                  <Link to={`/documentos/nova?slot=${s}`} className="btn btn-secondary">Nova versão</Link>
                </div>
              )}
              {d.versions.length > 0 && (
                <Link to={`/documentos/${s}/historico`} style={{ borderTop: '1px solid var(--b-div)', paddingTop: 12, fontSize: 14, fontWeight: 600 }}>
                  Histórico · {versionsLabel(d.versions.length)}
                </Link>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8 }}>
        <div className="label">Outros envios</div>
        <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4 }}>Ficam guardados para a equipe. Não recebem devolutiva.</div>
      </div>
      <OtherFiles />
    </>
  );
}

function OtherFiles() {
  const files = useStudentFiles();
  const { session } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const upload = async (kind: StudentFile['kind'], file: File) => {
    if (file.size > MAX_UPLOAD_BYTES) return toast('O arquivo passa de 50 MB.');
    setBusy(kind);
    setPct(0);
    try {
      const path = `${session!.user.id}/${kind}/${Date.now()}_${safeName(file.name)}`;
      await uploadWithProgress('files', path, file, setPct).promise;
      const { error } = await supabase.from('student_files').insert({ kind, file_path: path, file_name: file.name, file_size: file.size });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['student_files'] });
      toast('Arquivo enviado para a equipe.');
    } catch {
      toast('O envio não foi concluído. Tente de novo.');
    } finally {
      setBusy(null);
    }
  };

  const defs: [StudentFile['kind'], string][] = [
    ['apresentacao', 'Apresentação do Studio'],
    ['outros', 'Outros arquivos'],
  ];
  return (
    <div className="grid-320">
      {defs.map(([kind, title]) => {
        const f = files.data?.find((x) => x.kind === kind);
        return (
          <div key={kind} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="between" style={{ alignItems: 'center' }}>
              <div className="h-card">{title}</div>
              {f ? <Chip tone="ok">Enviado</Chip> : <Chip>Não enviado</Chip>}
            </div>
            <input type="file" hidden ref={(el) => { inputs.current[kind] = el; }} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) upload(kind, file); }} />
            {f && (
              <div className="row" style={{ background: 'var(--alt)', borderRadius: 8, padding: 12 }}>
                <FileIcon ext={extOf(f.file_name, 'ARQ')} small />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
                  <div style={{ fontSize: 13, color: 'var(--t3)' }}>Enviado {fmtDay(f.created_at)}</div>
                </div>
              </div>
            )}
            <button className="upload-zone" style={{ padding: '16px 14px' }} disabled={!!busy} onClick={() => inputs.current[kind]?.click()}>
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--t2)' }}>{busy === kind ? `Enviando… ${pct}%` : f ? 'Enviar outro arquivo' : 'Toque para enviar'}</div>
              <div style={{ fontSize: 13, color: 'var(--t3)' }}>Qualquer formato · até 50 MB</div>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function HistTab({ docs }: { docs: ReturnType<typeof useDocs>['docs'] }) {
  const [filter, setFilter] = useState<'Todos' | 'Portfólio' | 'Proposta' | 'Contrato'>('Todos');
  const groups = SLOT_ORDER.filter((s) => docs[s].versions.length && (filter === 'Todos' || SLOTS[s].tipo === filter));
  const anyAtAll = SLOT_ORDER.some((s) => docs[s].versions.length);
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['Todos', 'Portfólio', 'Proposta', 'Contrato'] as const).map((f) => (
          <button key={f} className={'pill' + (filter === f ? ' on' : '')} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      {groups.length > 0 ? (
        <div className="grid-320" style={{ alignItems: 'flex-start' }}>
          {groups.map((s) => {
            const d = docs[s];
            const judged = d.versions.filter((v) => v.verdict).length;
            return (
              <div key={s} className="card" style={{ padding: '16px 16px 4px' }}>
                <div className="between" style={{ alignItems: 'flex-start', paddingBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 13, color: 'var(--t3)' }}>{SLOTS[s].tipo}</div>
                    <div style={{ fontWeight: 600, fontSize: 17 }}>{SLOTS[s].title}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', background: 'var(--alt2)', padding: '5px 10px', borderRadius: 8, whiteSpace: 'nowrap' }}>{versionsLabel(d.versions.length)}</div>
                </div>
                {[...d.versions].reverse().map((v) => (
                  <div key={v.id} className="between" style={{ alignItems: 'center', minHeight: 52, borderTop: '1px solid var(--b-div)' }}>
                    <div style={{ fontSize: 15 }}>
                      <span style={{ fontWeight: 600 }}>Versão {v.version}</span> <span className="muted">· {fmtDay(v.created_at)}</span>
                    </div>
                    <VersionChip verdict={v.verdict} />
                  </div>
                ))}
                <Link to={`/documentos/${s}/historico`} style={{ display: 'block', borderTop: '1px solid var(--b-div)', padding: '14px 0', textAlign: 'center', fontWeight: 600, fontSize: 15 }}>
                  {judged >= 2 ? 'Comparar versões' : 'Ver detalhes'}
                </Link>
              </div>
            );
          })}
        </div>
      ) : anyAtAll ? (
        <div className="dashed" style={{ padding: 28 }}>
          <div style={{ fontSize: 15, color: 'var(--t3)' }}>Nada por aqui com esse filtro.</div>
        </div>
      ) : (
        <div className="dashed">
          <div style={{ fontWeight: 600, fontSize: 17 }}>Nenhum envio ainda</div>
          <div style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--t2)', maxWidth: 360 }}>Cada material enviado fica guardado aqui, versão por versão, para você ver sua evolução.</div>
          <Link to="/documentos/nova" className="btn btn-primary" style={{ height: 50, padding: '0 22px', marginTop: 8 }}>
            Enviar primeiro material
          </Link>
        </div>
      )}
    </>
  );
}
