import { Fragment, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { isSlot, SLOT_ORDER, SLOTS, VERDICTS, type Feedback, type Slot } from '../../shared/domain';
import { BackLink, CheckIcon, ErrorState, PageSkeleton, VerdictChip, VersionChip, Mark } from '../components/ui';
import { MaterialPreview } from '../components/MaterialPreview';
import { useProfile } from '../lib/auth';
import { useDocs, useFeatures, useGami, useMarkSeen, useSetChecks } from '../lib/data';
import { firstName, fmtDay, fmtDue, initials } from '../lib/format';

/** Tempo típico da análise (para a barra de progresso) e a partir de quando avisamos que está demorando. */
const TYPICAL_MS = 3 * 60_000;
const SLOW_MS = 6 * 60_000;

function useSlotDocs() {
  const { slot } = useParams();
  const q = useDocs();
  return { slot: isSlot(slot) ? slot : null, q };
}

function Shell({ wide, children }: { wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="page">
      <div className={'flow' + (wide ? ' wide' : '')}>{children}</div>
    </div>
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}


// ---------------------------------------------------------------------
// Status do envio
// ---------------------------------------------------------------------
export function Status() {
  const { slot, q } = useSlotDocs();
  const profile = useProfile();
  const d = slot ? q.docs[slot] : null;
  const feat = useFeatures();
  const justSent = !!(useLocation().state as { justSent?: boolean } | null)?.justSent;
  // Sem o robô ligado, o material vai direto para a equipe: nada de barra de progresso fingindo análise.
  const ai = feat.data?.ai ?? false;
  const mail = feat.data?.email ?? false;
  const stage = d ? ({ analise: 1, revisao: 2, pronta: 3, none: 0 } as const)[d.status] : 0;
  const now = useNow(stage === 1 && ai);

  if (!slot) return <Navigate to="/documentos" replace />;
  if (q.isLoading) return <Shell><PageSkeleton hero={false} /></Shell>;
  if (q.isError) return <Shell><ErrorState onRetry={q.refetch} /></Shell>;
  if (!d || !d.latest) return <Navigate to={`/documentos/nova?slot=${slot}`} replace />;

  const lv = d.latest;
  const reviewer = firstName(lv.feedback?.reviewer_name || '') || 'a equipe';
  const elapsed = now - new Date(lv.created_at).getTime();
  const anaPct = Math.min(96, 8 + (elapsed / TYPICAL_MS) * 88);
  const slow = ai && stage === 1 && elapsed > SLOW_MS;
  const notSent = SLOT_ORDER.filter((x) => x !== slot && q.docs[x].status === 'none');

  const where = mail ? `Avisamos em ${profile.email} e aqui em Documentos quando estiver pronta.` : 'Ela aparece aqui em Documentos quando estiver pronta.';
  const title =
    stage === 1 ? (ai ? 'Sua devolutiva chega até ' + fmtDue(lv.due_at) : 'Seu material está com a equipe') : stage === 2 ? 'A equipe está revisando sua devolutiva' : 'Sua devolutiva está pronta';
  const sub =
    stage === 1
      ? ai
        ? `Não precisa ficar nesta tela. ${where}`
        : `A equipe lê o material e escreve a devolutiva até ${fmtDue(lv.due_at)}. Não precisa ficar nesta tela: ${where.charAt(0).toLowerCase() + where.slice(1)}`
      : stage === 2
        ? `Previsão: até ${fmtDue(lv.due_at)}. ${where}`
        : `Revisada por ${reviewer}.`;
  const steps: [string, string][] = ai
    ? [
        ['Em análise', stage === 1 ? 'Uma primeira leitura automática. Costuma levar de 2 a 5 minutos.' : 'Concluída'],
        ['Em revisão pela equipe', stage === 3 ? `Concluída por ${reviewer}` : 'Alguém da equipe lê e ajusta antes de liberar.'],
        ['Devolutiva pronta', stage === 3 ? 'Liberada' : mail ? 'Você recebe um e-mail.' : 'Aparece em Documentos.'],
      ]
    : [
        ['Recebido', 'Seu material chegou e está guardado com segurança.'],
        ['Com a equipe', stage === 3 ? `Concluída por ${reviewer}` : `Alguém da equipe lê e escreve sua devolutiva até ${fmtDue(lv.due_at)}.`],
        ['Devolutiva pronta', stage === 3 ? 'Liberada' : mail ? 'Você recebe um e-mail.' : 'Aparece em Documentos.'],
      ];
  // Sem robô, "Recebido" já está concluído e a etapa atual é "Com a equipe".
  const shown = ai ? stage : stage === 3 ? 3 : 2;

  return (
    <Shell>
      <BackLink to="/documentos">Meus documentos</BackLink>
      <div className="stack" style={{ gap: 8 }}>
        {stage === 1 && (
          <div style={{ display: 'inline-flex', alignSelf: 'flex-start', gap: 6, alignItems: 'center', background: 'var(--ok-bg)', color: 'var(--ok-t)', fontWeight: 600, fontSize: 14, padding: '6px 10px', borderRadius: 8 }}><Mark m="✓" size={13} /> Recebemos seu material</div>
        )}
        <div className="h-flow">{title}</div>
        <div style={{ fontSize: 16, lineHeight: 1.5, color: 'var(--t2)' }}>{sub}</div>
      </div>

      <div className="card stack">
        {steps.map(([label, s], i) => {
          const n = i + 1, done = n < shown || shown === 3, cur = n === shown && !done;
          return (
            <div key={label} style={{ display: 'flex', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 14, fontWeight: 600, background: done ? 'var(--ok)' : cur ? 'var(--ac)' : '#fff', border: done || cur ? 'none' : '2px solid var(--b-btn)' }}>
                  {done ? <Mark m="✓" /> : cur ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff' }} /> : ''}
                </div>
                <div style={{ width: 2, flex: 1, margin: '4px 0', background: i === 2 ? 'transparent' : done ? 'var(--ok)' : '#DCDFE3' }} />
              </div>
              <div style={{ paddingBottom: 20, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 16, color: done || cur ? 'var(--t)' : 'var(--t3)' }}>{label}</div>
                <div style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--t3)', marginTop: 2 }}>{s}</div>
                {cur && n === 1 && ai && (
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--alt3)', overflow: 'hidden', marginTop: 10 }}>
                    <div style={{ width: anaPct + '%', height: '100%', borderRadius: 3, background: 'var(--ac)', transition: 'width .9s linear' }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <MaterialPreview v={lv} title={SLOTS[slot].title} />

      {slow && (
        <div className="card tight" style={{ borderColor: '#D3D6DB', display: 'flex', gap: 14 }}>
          <div className="spinner" />
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Está levando mais tempo que o normal</div>
            <div style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--t2)', marginTop: 2 }}>
              Isso não muda seu prazo. Se a análise travar, a equipe assume e a devolutiva chega até {fmtDue(lv.due_at)}.
            </div>
          </div>
        </div>
      )}

      {stage === 3 && (
        <Link to={`/documentos/${slot}/devolutiva`} className="btn btn-primary btn-lg">
          Ver devolutiva
        </Link>
      )}
      {stage !== 3 && notSent.length > 0 && (
        <div className="card stack" style={{ gap: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{justSent ? 'Quer aproveitar e mandar os outros?' : 'Ainda falta enviar'}</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {notSent.map((x) => (
              <Link key={x} to={`/documentos/nova?slot=${x}`} className="btn btn-secondary btn-sm">
                <Mark m="+" size={13} /> {SLOTS[x].title}
              </Link>
            ))}
            {notSent.length > 1 && (
              <Link to="/documentos/lote" className="btn btn-primary btn-sm">Enviar todos de uma vez</Link>
            )}
          </div>
        </div>
      )}
      <Link to="/documentos" className="btn btn-secondary btn-md btn-block" style={{ borderRadius: 10 }}>
        Voltar para Documentos
      </Link>
    </Shell>
  );
}

// ---------------------------------------------------------------------
// Devolutiva
// ---------------------------------------------------------------------
export function Devolutiva() {
  const { slot, q } = useSlotDocs();
  const gami = useGami();
  const markSeen = useMarkSeen();
  const setChecks = useSetChecks();
  const [legend, setLegend] = useState(false);
  const d = slot ? q.docs[slot] : null;
  const lv = d?.latest;
  const fbRow = lv?.feedback;

  useEffect(() => {
    if (fbRow && !fbRow.seen_at && !markSeen.isPending) markSeen.mutate(fbRow.submission_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fbRow?.submission_id, fbRow?.seen_at]);

  if (!slot) return <Navigate to="/documentos" replace />;
  if (q.isLoading) return <Shell wide><PageSkeleton hero={false} /></Shell>;
  if (q.isError) return <Shell wide><ErrorState onRetry={q.refetch} /></Shell>;
  if (!d || !lv) return <Navigate to={`/documentos/nova?slot=${slot}`} replace />;
  if (d.status !== 'pronta' || !fbRow) return <Navigate to={`/documentos/${slot}/status`} replace />;

  const fb = fbRow.released;
  const v = VERDICTS[fb.verdict];
  const reviewer = fbRow.reviewer_name || 'Equipe RCN';
  const task = gami.tasks.find((t) => t.auto_slot === slot);
  const checks = fb.steps.map((_, i) => !!fbRow.checks[i]);
  const toggle = (i: number) => setChecks.mutate({ submissionId: fbRow.submission_id, checks: checks.map((c, j) => (j === i ? !c : c)) });

  return (
    <div className="page">
      <div className="dev-split">
        <div className="flow wide dev-main">
      <BackLink to="/documentos">Meus documentos</BackLink>
      <div className="stack" style={{ gap: 4, marginTop: -10 }}>
        <div className="h-flow">{SLOTS[slot].title}</div>
        <div style={{ fontSize: 14, color: 'var(--t3)' }}>
          Versão {lv.version} de {d.versions.length}
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8, fontSize: 14, color: 'var(--t2)' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--alt3)', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 12 }}>{initials(reviewer)}</div>
          Revisado por {firstName(reviewer)}
        </div>
      </div>

      <div className="card" style={{ padding: 0, display: 'flex', overflow: 'hidden' }}>
        <div style={{ width: 4, background: v.strong, flex: 'none' }} />
        <div style={{ padding: '20px 20px 22px', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: v.bg, color: v.strong, display: 'grid', placeItems: 'center', flex: 'none' }}>
            <Mark m={v.mark} size={20} />
          </div>
          <div>
            <div className="label">Veredito</div>
            <div style={{ fontWeight: 600, fontSize: 28, letterSpacing: '-.03em', lineHeight: 1.1, marginTop: 4, color: v.strong }}>{v.label}</div>
            <div style={{ fontSize: 15, lineHeight: 1.5, marginTop: 8, color: 'var(--t2)' }}>{fb.sum}</div>
          </div>
        </div>
      </div>

      <div className="stack" style={{ marginTop: -14, gap: 8 }}>
        <button onClick={() => setLegend(!legend)} style={{ fontSize: 14, fontWeight: 600, color: 'var(--ac)', padding: '4px 0', alignSelf: 'flex-start' }}>
          {legend ? 'Esconder o significado dos vereditos' : 'O que significa cada veredito?'}
        </button>
        {legend && (
          <div className="stack" style={{ gap: 6 }}>
            {(['ok', 'aj', 're'] as const).map((k) => {
              const x = VERDICTS[k];
              return (
                <div key={k} className="row" style={{ gap: 10, background: x.bg, borderRadius: 8, padding: '10px 12px' }}>
                  <CheckIcon bg={x.strong} fg="#fff" mark={x.mark} size={26} />
                  <div style={{ fontSize: 14, color: x.fg }}>
                    <span style={{ fontWeight: 600 }}>{x.label}:</span> {x.meaning}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {fb.verdict === 'ok' && SLOTS[slot].task && (
        <Link to="/gamificacao" className="hero" style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none' }}>
          <div style={{ background: 'var(--gold)', color: 'var(--t)', fontWeight: 600, fontSize: 14, padding: '6px 10px', borderRadius: 8, flex: 'none' }}>+{task?.xp ?? 100} XP</div>
          <div style={{ fontSize: 15, lineHeight: 1.4, flex: 1 }}>Tarefa concluída na Gamificação: {task?.title ?? SLOTS[slot].task}</div>
          <div style={{ fontSize: 18 }}><Mark m="›" size={18} /></div>
        </Link>
      )}

      {fb.strong.length > 0 && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="h-sec">Pontos fortes</div>
          <div className="card list" style={{ padding: '4px 16px' }}>
            {fb.strong.map((t, i) => (
              <div key={i} className="divrow" style={{ display: 'flex', gap: 12, padding: '14px 0' }}>
                <CheckIcon />
                <div style={{ fontSize: 15, lineHeight: 1.45 }}>{t}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {fb.pts.length > 0 && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="h-sec">Pontos a ajustar</div>
          {fb.pts.map((p, i) => (
            <div key={i} className="card tight" style={{ display: 'flex', gap: 12 }}>
              <CheckIcon bg="var(--warn-bg)" fg="var(--warn-t)" mark={String(i + 1)} size={26} />
              <div className="stack" style={{ gap: 8, minWidth: 0 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16 }}>{p.t}</div>
                  {p.d && <div style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--t2)', marginTop: 2 }}>{p.d}</div>}
                </div>
                {p.s && (
                  <div style={{ borderLeft: '2px solid var(--ac)', background: 'var(--alt)', borderRadius: '0 6px 6px 0', padding: '10px 14px', fontSize: 15, lineHeight: 1.5 }}>
                    <span style={{ fontWeight: 600, color: 'var(--ac)' }}>Sugestão:</span> {p.s}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {fb.steps.length > 0 && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="between" style={{ alignItems: 'baseline' }}>
            <div className="h-sec">Próximos passos</div>
            <div style={{ fontSize: 14, color: 'var(--t3)' }}>
              {checks.filter(Boolean).length} de {checks.length} feitos
            </div>
          </div>
          <div className="card list">
            {fb.steps.map((label, i) => (
              <button key={i} role="checkbox" aria-checked={checks[i]} onClick={() => toggle(i)} className="row divrow" style={{ minHeight: 56, width: '100%' }}>
                <div className={'check-box' + (checks[i] ? ' on' : '')}>{checks[i] ? <Mark m="✓" /> : ''}</div>
                <div style={{ fontSize: 15, lineHeight: 1.4, color: checks[i] ? 'var(--t3)' : 'var(--t)', textDecoration: checks[i] ? 'line-through' : 'none' }}>{label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="dev-inline-doc">
        <MaterialPreview v={lv} title={SLOTS[slot].title} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
        <Link to={`/documentos/nova?slot=${slot}`} className="btn btn-primary" style={{ height: 54, borderRadius: 10, fontSize: 16 }}>
          Enviar nova versão
        </Link>
        <Link to={`/documentos/${slot}/historico`} className="btn btn-secondary" style={{ height: 54, borderRadius: 10, fontSize: 16 }}>
          Histórico e comparação
        </Link>
      </div>
        </div>
        <aside className="dev-doc">
          <MaterialPreview v={lv} title={SLOTS[slot].title} defaultOpen />
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Histórico e comparação
// ---------------------------------------------------------------------
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\w ]+/g, ' ').replace(/\s+/g, ' ').trim();

export function compareVersions(a: Feedback, b: Feedback) {
  const bTitles = new Set(b.pts.map((p) => norm(p.t)));
  const aTitles = new Set(a.pts.map((p) => norm(p.t)));
  if (b.verdict === 'ok') return { resolved: a.pts.map((p) => p.t), pending: [] as string[], added: [] as string[] };
  return {
    resolved: a.pts.filter((p) => !bTitles.has(norm(p.t))).map((p) => p.t),
    pending: b.pts.filter((p) => aTitles.has(norm(p.t))).map((p) => p.t),
    added: b.pts.filter((p) => !aTitles.has(norm(p.t))).map((p) => p.t),
  };
}

export function Historico() {
  const { slot, q } = useSlotDocs();
  if (!slot) return <Navigate to="/documentos?tab=hist" replace />;
  if (q.isLoading) return <Shell wide><PageSkeleton hero={false} /></Shell>;
  if (q.isError) return <Shell wide><ErrorState onRetry={q.refetch} /></Shell>;
  const d = q.docs[slot as Slot];
  const judged = d.versions.filter((v) => v.feedback);
  const a = judged[judged.length - 2], b = judged[judged.length - 1];
  const cmp = a && b ? compareVersions(a.feedback!.released, b.feedback!.released) : null;
  const groups: [string, string[], string, string, string][] = cmp
    ? ([
        ['Você resolveu', cmp.resolved, '✓', 'var(--ok-bg)', 'var(--ok)'],
        ['Continua pendente', cmp.pending, '!', 'var(--warn-bg)', 'var(--warn-t)'],
        ['Novo nesta versão', cmp.added, '!', 'var(--warn-bg)', 'var(--warn-t)'],
      ] as [string, string[], string, string, string][]).filter((g) => g[1].length)
    : [];

  return (
    <Shell wide>
      <BackLink to="/documentos">Meus documentos</BackLink>
      <div style={{ marginTop: -10 }}>
        <div style={{ fontSize: 14, color: 'var(--t3)' }}>Histórico</div>
        <div className="h-flow">{SLOTS[slot].title}</div>
      </div>
      {d.versions.length === 0 ? (
        <div className="dashed">
          <div style={{ fontWeight: 600, fontSize: 17 }}>Nenhum envio ainda</div>
          <Link to={`/documentos/nova?slot=${slot}`} className="btn btn-primary" style={{ marginTop: 8 }}>Enviar primeiro material</Link>
        </div>
      ) : (
        <div className="card list">
          {[...d.versions].reverse().map((v) => (
            <div key={v.id} className="between divrow" style={{ alignItems: 'center', minHeight: 60 }}>
              <div style={{ fontSize: 15 }}>
                <span style={{ fontWeight: 600 }}>Versão {v.version}</span> <span className="muted">· {fmtDay(v.created_at)}</span>
              </div>
              {v.feedback && v === d.latest ? (
                <Link to={`/documentos/${slot}/devolutiva`}><VersionChip verdict={v.verdict} /></Link>
              ) : (
                <VersionChip verdict={v.verdict} />
              )}
            </div>
          ))}
        </div>
      )}
      {cmp && a && b ? (
        <div className="stack" style={{ gap: 16 }}>
          <div className="h-card">
            Versão {a.version} → versão {b.version}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 28px 1fr', alignItems: 'center', gap: 4 }}>
            {[a, b].map((x, i) => (
              <Fragment key={x.id}>
                {i === 1 && <div style={{ textAlign: 'center', fontSize: 20, color: 'var(--t3)' }}>→</div>}
                <div className="card tight stack" style={{ gap: 8, padding: 14 }}>
                  <div style={{ fontSize: 14, color: 'var(--t3)' }}>
                    Versão {x.version} · {fmtDay(x.created_at, false)}
                  </div>
                  <VerdictChip v={x.verdict!} style={{ alignSelf: 'flex-start' }} />
                </div>
              </Fragment>
            ))}
          </div>
          {groups.map(([label, items, mark, bg, fg]) => (
            <div key={label} className="stack" style={{ gap: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {label} <span style={{ color: 'var(--t3)', fontWeight: 500 }}>· {items.length}</span>
              </div>
              <div className="card list" style={{ padding: '4px 16px' }}>
                {items.map((t, i) => (
                  <div key={i} className="divrow" style={{ display: 'flex', gap: 12, padding: '12px 0', alignItems: 'flex-start' }}>
                    <CheckIcon bg={bg} fg={fg} mark={mark} />
                    <div style={{ fontSize: 15, lineHeight: 1.4 }}>{t}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        d.versions.length > 0 && (
          <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--t3)', background: '#fff', border: '1px dashed var(--b-dash)', borderRadius: 10, padding: 18, textAlign: 'center' }}>
            A comparação aparece quando houver duas versões com devolutiva.
          </div>
        )
      )}
    </Shell>
  );
}
