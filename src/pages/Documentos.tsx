import { useQueryClient } from '@tanstack/react-query';
import { Fragment, useRef, useState } from 'react';
import { Clock, FilePen, FileStack, FileUp, History, Mail, Paperclip } from 'lucide-react';
import { Actions, BigButton, DoneRow, NextUp, Pill, Row, Screen, ScreenHead, Section } from '../components/kit';
import { NewBadge } from './Inicio';
import { Link, useSearchParams } from 'react-router-dom';
import { MAX_UPLOAD_BYTES, SLOT_ORDER, SLOTS, VERDICTS } from '../../shared/domain';
import { ErrorState, PageSkeleton, VersionChip } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useDocs, useFeatures, useStudentFiles, type DocState, type StudentFile } from '../lib/data';
import { dueLine, fmtDay } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { safeName, uploadWithProgress } from '../lib/upload';

const versionsLabel = (n: number) => (n === 1 ? '1 versão' : `${n} versões`);

export default function Documentos() {
  const [params] = useSearchParams();
  const tab = params.get('tab') === 'hist' ? 'hist' : 'list';
  const q = useDocs();

  if (tab === 'hist')
    return (
      <Screen>
        <ScreenHead back="/documentos" title="Histórico de versões" sub="Cada material enviado fica guardado aqui, versão por versão." />
        {q.isLoading ? <PageSkeleton hero={false} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : <HistTab docs={q.docs} />}
      </Screen>
    );
  return (
    <Screen>
      <ScreenHead title="Documentos" sub="Envie seus materiais. A equipe lê e devolve uma devolutiva aqui mesmo, em até 48h." />
      {q.isLoading ? <PageSkeleton hero={false} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : <ListTab docs={q.docs} />}
    </Screen>
  );
}

function ListTab({ docs }: { docs: ReturnType<typeof useDocs>['docs'] }) {
  const ai = useFeatures().data?.ai ?? false;
  const all = SLOT_ORDER.map((s) => docs[s]);
  const withTeam = all.filter((d) => d.status === 'analise' || d.status === 'revisao');
  const ready = all.filter((d) => d.status === 'pronta' && d.latest?.verdict !== 'ok');
  const approved = all.filter((d) => d.status === 'pronta' && d.latest?.verdict === 'ok');
  const toSend = all.filter((d) => d.status === 'none');
  const fresh = all.every((d) => d.versions.length === 0);
  // O que fazer primeiro: devolutiva nova > nova versão pedida > material ainda não enviado.
  const unseen = all.find((d) => d.unseen);
  const fix = ready.find((d) => !d.unseen);
  const first = toSend[0];
  const vtone = (d: DocState) => (d.latest?.verdict === 're' ? 'red' : 'amber') as 'red' | 'amber';

  return (
    <>
      {unseen ? (
        <NextUp label="Devolutiva nova" when="Chegou" Icon={Mail} title={SLOTS[unseen.slot].title} kind={`Versão ${unseen.latest!.version}${unseen.latest?.verdict ? ' · ' + VERDICTS[unseen.latest.verdict].label : ''}`} primary={{ label: 'Abrir devolutiva', to: `/documentos/${unseen.slot}/devolutiva` }} />
      ) : fix ? (
        <NextUp label="Próximo" Icon={FilePen} title={`Nova versão: ${SLOTS[fix.slot].title}`} kind={`A devolutiva pediu ${VERDICTS[fix.latest!.verdict!].label.toLowerCase()}`} meta="Os pontos a mudar estão na devolutiva" primary={{ label: 'Enviar nova versão', to: `/documentos/nova?slot=${fix.slot}` }} later={{ label: 'Rever a devolutiva', to: `/documentos/${fix.slot}/devolutiva` }} />
      ) : first ? (
        <NextUp label={fresh ? 'Comece por aqui' : 'Próximo'} Icon={FileUp} title={fresh ? 'Envie seu primeiro material' : SLOTS[first.slot].title} kind={fresh ? 'Proposta, contrato, portfólio ou apresentação' : SLOTS[first.slot].desc} meta="PDF, Word, link ou texto · devolutiva em até 48h" primary={{ label: 'Enviar material', to: fresh ? '/documentos/nova' : `/documentos/nova?slot=${first.slot}` }} />
      ) : null}

      <Actions>
        <BigButton a={{ label: 'Enviar material para análise', to: '/documentos/nova', Icon: FileUp }} />
        <BigButton a={{ label: 'Enviar vários de uma vez', to: '/documentos/lote', Icon: FileStack }} variant="secondary" />
      </Actions>

      {withTeam.length > 0 && (
        <Section title="Com a equipe">
          {withTeam.map((d) => (
            <Row key={d.slot} Icon={Clock} when={d.status === 'analise' && ai ? 'Em análise · poucos minutos' : dueLine(d.latest!.due_at)} title={SLOTS[d.slot].title} sub={`Versão ${d.latest!.version} · ${d.status === 'revisao' ? 'em revisão pela equipe' : 'recebido'}`} to={`/documentos/${d.slot}/status`} right={<Pill tone="blue">{d.status === 'revisao' ? 'Em revisão' : 'Com a equipe'}</Pill>} />
          ))}
        </Section>
      )}

      {ready.length > 0 && (
        <Section title="Devolutiva pronta">
          {ready.map((d) => (
            <Row key={d.slot} Icon={FilePen} tone={vtone(d)} title={<>{SLOTS[d.slot].title} {d.unseen && <NewBadge />}</>} sub={`Versão ${d.latest!.version} · ${VERDICTS[d.latest!.verdict!].meaning}`} to={`/documentos/${d.slot}/devolutiva`} right={<Pill tone={vtone(d)}>{VERDICTS[d.latest!.verdict!].label}</Pill>} />
          ))}
        </Section>
      )}

      {toSend.length > 0 && (
        <Section title="Para enviar">
          {toSend.map((d) => (
            <Row key={d.slot} Icon={FileUp} tone="gray" title={SLOTS[d.slot].title} sub={SLOTS[d.slot].desc} to={`/documentos/nova?slot=${d.slot}`} />
          ))}
        </Section>
      )}

      {approved.length > 0 && (
        <Section title="Aprovados">
          {approved.map((d) => (
            <DoneRow key={d.slot} title={SLOTS[d.slot].title} sub={`Versão ${d.latest!.version} · pode enviar ao cliente`} to={`/documentos/${d.slot}/devolutiva`} />
          ))}
        </Section>
      )}

      <Section title="Outros arquivos">
        <OtherFiles />
        {all.some((d) => d.versions.length) && <Row Icon={History} tone="gray" title="Histórico de versões" sub="Compare a evolução de cada material" to="/documentos?tab=hist" />}
      </Section>
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

  // A apresentação do studio virou documento com devolutiva; aqui fica só o que não precisa de análise.
  const defs: [StudentFile['kind'], string][] = [['outros', 'Outros arquivos']];
  return (
    <>
      {defs.map(([kind, title]) => {
        const f = files.data?.find((x) => x.kind === kind);
        return (
          <Fragment key={kind}>
            <input type="file" hidden ref={(el) => { inputs.current[kind] = el; }} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) upload(kind, file); }} />
            <Row
              Icon={Paperclip}
              tone="gray"
              title={busy === kind ? `Enviando… ${pct}%` : f ? f.file_name : title}
              sub={f ? `Enviado ${fmtDay(f.created_at)} · fica guardado para a equipe, sem devolutiva` : 'Qualquer formato, até 50 MB · fica guardado para a equipe, sem devolutiva'}
              onClick={() => !busy && inputs.current[kind]?.click()}
              right={<span className="btn btn-soft btn-sm">{f ? 'Enviar outro' : 'Enviar'}</span>}
            />
          </Fragment>
        );
      })}
    </>
  );
}

function HistTab({ docs }: { docs: ReturnType<typeof useDocs>['docs'] }) {
  const [filter, setFilter] = useState<'Todos' | 'Portfólio' | 'Proposta' | 'Contrato' | 'Apresentação'>('Todos');
  const groups = SLOT_ORDER.filter((s) => docs[s].versions.length && (filter === 'Todos' || SLOTS[s].tipo === filter));
  const anyAtAll = SLOT_ORDER.some((s) => docs[s].versions.length);
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['Todos', 'Proposta', 'Contrato', 'Portfólio', 'Apresentação'] as const).map((f) => (
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
