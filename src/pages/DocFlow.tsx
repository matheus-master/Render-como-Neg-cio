import { Fragment, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { isSlot, POINT_SECS, SLOT_ORDER, SLOTS, VERDICTS, type Feedback, type FeedbackFile, type Slot } from '../../shared/domain';
import { openSigned, signedUrl } from '../lib/agenda';
import { CheckIcon, ErrorState, PageSkeleton, VerdictChip, VersionChip } from '../components/ui';
import { Check, Clock, FileStack, FileText, FileUp, History, House, Mail, RotateCcw, TriangleAlert } from 'lucide-react';
import { Actions, BigButton, Confirm, DetailCard, DoneRow, HelpCard, Note, Pill, ReadAloud, Row, Screen, ScreenHead, Section, Side, Tile, Workspace } from '../components/kit';
import { MaterialPreview } from '../components/MaterialPreview';
import { useProfile } from '../lib/auth';
import { useDocs, useFeatures, useGami, useMarkSeen, useSetChecks } from '../lib/data';
import { firstName, fmtDay, fmtDue, fmtDueShort, isPast } from '../lib/format';

/** Tempo típico da análise (para a barra de progresso) e a partir de quando avisamos que está demorando. */
const TYPICAL_MS = 3 * 60_000;
const SLOW_MS = 6 * 60_000;

function useSlotDocs() {
  const { slot } = useParams();
  const q = useDocs();
  return { slot: isSlot(slot) ? slot : null, q };
}

function Shell({ children }: { wide?: boolean; children: React.ReactNode }) {
  return <Screen>{children}</Screen>;
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

  const late = isPast(lv.due_at);
  const dueTxt = late ? 'em breve' : 'até ' + fmtDue(lv.due_at);
  const where = mail ? `Avisamos em ${profile.email} e aqui em Documentos quando estiver pronta.` : 'Ela aparece aqui em Documentos quando estiver pronta.';
  const title =
    stage === 1 ? (ai && !late ? 'Sua devolutiva chega até ' + fmtDue(lv.due_at) : 'Seu material está com a equipe') : stage === 2 ? 'A equipe está revisando sua devolutiva' : 'Sua devolutiva está pronta';
  const sub =
    stage === 1
      ? ai
        ? `Não precisa ficar nesta tela. ${where}`
        : `A equipe lê o material e escreve a devolutiva ${dueTxt}.${late ? ` O prazo previsto era ${fmtDueShort(lv.due_at)}; está levando um pouco mais, mas já está com a equipe.` : ''} Não precisa ficar nesta tela: ${where.charAt(0).toLowerCase() + where.slice(1)}`
      : stage === 2
        ? late
          ? `O prazo previsto era ${fmtDueShort(lv.due_at)}. A revisão está levando um pouco mais, mas a equipe já está finalizando. ${where}`
          : `Previsão: até ${fmtDue(lv.due_at)}. ${where}`
        : `Revisada por ${reviewer}.`;
  const steps: [string, string][] = ai
    ? [
        ['Em análise', stage === 1 ? 'Uma primeira leitura automática. Costuma levar de 2 a 5 minutos.' : 'Concluída'],
        ['Em revisão pela equipe', stage === 3 ? `Concluída por ${reviewer}` : 'Alguém da equipe lê e ajusta antes de liberar.'],
        ['Devolutiva pronta', stage === 3 ? 'Liberada' : mail ? 'Você recebe um e-mail.' : 'Aparece em Documentos.'],
      ]
    : [
        ['Recebido', 'Seu material chegou e está guardado com segurança.'],
        ['Com a equipe', stage === 3 ? `Concluída por ${reviewer}` : late ? 'A equipe está finalizando sua devolutiva.' : `Alguém da equipe lê e escreve sua devolutiva até ${fmtDue(lv.due_at)}.`],
        ['Devolutiva pronta', stage === 3 ? 'Liberada' : mail ? 'Você recebe um e-mail.' : 'Aparece em Documentos.'],
      ];
  // Sem robô, "Recebido" já está concluído e a etapa atual é "Com a equipe".
  const shown = ai ? stage : stage === 3 ? 3 : 2;

  const pill = stage === 3 ? <Pill tone="mint">Devolutiva pronta</Pill> : stage === 2 ? <Pill tone="blue">Em revisão</Pill> : <Pill tone="blue">Com a equipe</Pill>;
  const others = notSent.length > 0 && stage !== 3 && (
    <Section title={justSent ? 'Quer aproveitar e mandar os outros?' : 'Ainda falta enviar'}>
      {notSent.map((x) => <Row key={x} Icon={FileUp} tone="gray" title={SLOTS[x].title} sub={SLOTS[x].desc} to={`/documentos/nova?slot=${x}`} />)}
      {notSent.length > 1 && <BigButton a={{ label: 'Enviar todos de uma vez', to: '/documentos/lote', Icon: FileStack }} variant="secondary" />}
    </Section>
  );

  if (justSent && stage !== 3)
    return (
      <Screen>
        <Confirm
          title="Material enviado"
          sub="A equipe já recebeu. Não precisa ficar nesta tela."
          card={{ Icon: FileText, title: SLOTS[slot].title, sub: `Versão ${lv.version} · ${SLOTS[slot].tipo}`, note: late ? 'Devolutiva em breve' : `Devolutiva até ${fmtDue(lv.due_at)}` }}
          primary={{ label: 'Voltar ao início', to: '/', Icon: House }}
          secondary={{ label: 'Ver meus documentos', to: '/documentos', Icon: FileText }}
        />
        <Note>{where}</Note>
        {others}
      </Screen>
    );

  return (
    <Screen>
      <ScreenHead back="/documentos" title={SLOTS[slot].title} accent={stage === 3 ? 'Devolutiva pronta.' : late ? 'Devolutiva em breve.' : `Devolutiva até ${fmtDueShort(lv.due_at)}.`} date={`Enviado ${fmtDay(lv.created_at)}`} status={pill} />
      <Workspace>
      <Side>
      <DetailCard
        Icon={FileText}
        eyebrow={`${SLOTS[slot].tipo} · versão ${lv.version}`}
        title={SLOTS[slot].title}
        time={stage !== 3 ? <><Clock size={22} aria-hidden />{late ? 'Em breve' : fmtDue(lv.due_at)}</> : undefined}
        when={stage !== 3 ? 'previsão da devolutiva' : undefined}
        question={title}
        sub={sub}
      >
        {stage !== 3 && <Note>Você não precisa ficar nesta tela. {where}</Note>}
      </DetailCard>
      </Side>

      <section className="k-steps">
        {steps.map(([label, st], i) => {
          const n = i + 1, done = n < shown || shown === 3, cur = n === shown && !done;
          return (
            <div key={label} className={'k-step' + (done ? ' done' : cur ? ' cur' : '')}>
              <span className="k-step-dot">{done ? <Check size={18} strokeWidth={2.6} aria-hidden /> : cur ? <i /> : n}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b>{label}</b>
                <span>{st}</span>
                {cur && n === 1 && ai && (
                  <div className="track" style={{ height: 6, borderRadius: 3, marginTop: 10 }}><i style={{ width: anaPct + '%', transition: 'width .9s linear' }} /></div>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {slow && <Note tone="amber">Está levando mais tempo que o normal. Isso não muda seu prazo: se a análise travar, a equipe assume e a devolutiva chega até {fmtDue(lv.due_at)}.</Note>}

      <MaterialPreview v={lv} title={SLOTS[slot].title} />

      <Actions>
        {stage === 3 ? (
          <BigButton a={{ label: 'Ver devolutiva', to: `/documentos/${slot}/devolutiva`, Icon: Mail }} />
        ) : (
          <BigButton a={{ label: 'Voltar ao início', to: '/', Icon: House }} />
        )}
        <BigButton a={{ label: 'Ver meus documentos', to: '/documentos', Icon: FileText }} variant="soft" />
      </Actions>
      <Side>{others}</Side>
      </Workspace>
    </Screen>
  );
}

// ---------------------------------------------------------------------
// Devolutiva
// ---------------------------------------------------------------------
/** Pontos agrupados por seção (devolutivas no formato da análise de documentos), com a página de cada item. */
function PointsBySection({ pts }: { pts: Feedback['pts'] }) {
  const groups = POINT_SECS.map((s) => ({ ...s, items: pts.filter((p) => (p.sec ?? 'obrigatorio') === s.k) })).filter((g) => g.items.length);
  return (
    <>
      {groups.map((g) => (
        <div key={g.k} className="k-sec">
          <div className="k-sec-head"><h2>{g.label}</h2></div>
          {g.k === 'portugues' ? (
            <div className="card tight stack" style={{ gap: 0, padding: '4px 16px' }}>
              {g.items.map((p, i) => (
                <div key={i} className="pt-pt">
                  {p.pg && <span className="pt-pg">{p.pg}</span>}
                  <span><s>{p.d}</s> <b>→ {p.s}</b></span>
                </div>
              ))}
            </div>
          ) : g.k === 'sugestao' || g.k === 'observacao' ? (
            <ul className="pt-list">
              {g.items.map((p, i) => (
                <li key={i}>
                  {p.pg && p.pg !== 'geral' && <span className="pt-pg">{p.pg}</span>}
                  <b>{p.t}.</b> {p.d}{p.s ? ` ${p.s}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            g.items.map((p, i) => (
              <div key={i} className="pt-card">
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  {p.pg && <span className="pt-pg">{p.pg}</span>}
                  <b className="pt-t">{p.t}</b>
                </div>
                {p.d && <div className="pt-d">{p.d}</div>}
                {p.s && <div className="pt-do">→ {p.s}</div>}
              </div>
            ))
          )}
        </div>
      ))}
    </>
  );
}

/** Devolutiva em arquivo (PDF/Word comentado pela equipe): abrir, baixar e ver o PDF aqui mesmo. */
function DevolutivaArquivo({ file }: { file: FeedbackFile }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    signedUrl(file.path).then((u) => on && setUrl(u));
    return () => { on = false; };
  }, [file.path]);
  const pdf = /\.pdf$/i.test(file.name);
  const img = /\.(png|jpe?g|webp|gif)$/i.test(file.name);
  return (
    <Section title="Devolutiva completa">
      <div className="k-row dev-file-row">
        <Tile Icon={FileText} />
        <span className="k-row-main">
          <b>{file.name}</b>
          <span className="k-row-sub">Arquivo da equipe com os ajustes comentados</span>
        </span>
        <button className="btn btn-primary btn-sm" onClick={() => openSigned(file.path)}>Abrir</button>
      </div>
      {url && pdf && <iframe className="dev-file-frame" src={url} title="Devolutiva completa" />}
      {url && img && <img className="dev-file-img" src={url} alt="Devolutiva completa" />}
    </Section>
  );
}

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

  const vt = (fb.verdict === 'ok' ? 'mint' : fb.verdict === 'aj' ? 'amber' : 'red') as 'mint' | 'amber' | 'red';
  const VIcon = fb.verdict === 'ok' ? Check : fb.verdict === 're' ? RotateCcw : TriangleAlert;
  const doneN = checks.filter(Boolean).length;
  const speech = [
    `${SLOTS[slot].title}. Veredito: ${v.label}. ${fb.sum}`,
    fb.strong.length ? `Pontos fortes: ${fb.strong.join('. ')}.` : '',
    fb.pts.length ? `Pontos a ajustar: ${fb.pts.map((p) => `${p.t}. ${p.d || ''} ${p.s ? 'Sugestão: ' + p.s : ''}`).join(' ')}` : '',
    fb.steps.length ? `Próximos passos: ${fb.steps.join('. ')}.` : '',
  ].filter(Boolean).join(' ');

  return (
    <Screen>
      <ScreenHead
        back="/documentos"
        title={SLOTS[slot].title}
        accent={`${v.label}.`}
        right={<ReadAloud text={speech} />}
        date={`Versão ${lv.version} · revisado por ${firstName(reviewer)}`}
        status={<Pill tone={vt}>{v.label}</Pill>}
        lede={fb.sum}
      />
      <Workspace>
      <Side>
      <DetailCard Icon={VIcon} tone={vt} eyebrow={`Devolutiva · versão ${lv.version}`} title={`${v.label}: ${v.meaning}`}>
        <blockquote className="quote" style={{ margin: 0 }}>{fb.sum}</blockquote>
        <div className="k-row-sub dev-counts">{fb.file && !fb.pts.length ? 'Os ajustes estão no arquivo da devolutiva' : `${fb.pts.length ? `${fb.pts.length} ponto${fb.pts.length > 1 ? 's' : ''} a ajustar` : 'Nenhum ponto a ajustar'} · ${doneN} de ${checks.length} passos feitos`}</div>
        <BigButton a={{ label: fb.verdict === 'ok' ? 'Enviar outra versão' : 'Enviar nova versão', to: `/documentos/nova?slot=${slot}`, Icon: FileUp }} />
        <button onClick={() => setLegend(!legend)} className="link" style={{ alignSelf: 'flex-start', fontSize: 15 }}>
          {legend ? 'Esconder o significado dos vereditos' : 'O que significa cada veredito?'}
        </button>
        {legend && (
          <div className="stack" style={{ gap: 8 }}>
            {(['ok', 'aj', 're'] as const).map((k) => (
              <div key={k} className="row" style={{ gap: 10, fontSize: 15 }}>
                <Pill tone={k === 'ok' ? 'mint' : k === 'aj' ? 'amber' : 'red'}>{VERDICTS[k].label}</Pill>
                <span style={{ color: 'var(--t2)' }}>{VERDICTS[k].meaning}</span>
              </div>
            ))}
          </div>
        )}
      </DetailCard>
      </Side>

        <div className="dev-main">
          {fb.file && <DevolutivaArquivo file={fb.file} />}
          {fb.verdict === 'ok' && SLOTS[slot].task && (
            <DoneRow title={`+${task?.xp ?? 100} XP na Gamificação`} sub={`Tarefa concluída: ${task?.title ?? SLOTS[slot].task}`} to="/gamificacao" />
          )}

          {fb.strong.length > 0 && (
            <Section title="Pontos fortes">
              {fb.strong.map((t, i) => <DoneRow key={i} title={t} />)}
            </Section>
          )}

          {fb.pts.length > 0 && fb.pts.some((p) => p.sec) ? (
            <PointsBySection pts={fb.pts} />
          ) : fb.pts.length > 0 && (
            <Section title="Pontos a ajustar">
              {fb.pts.map((p, i) => (
                <div key={i} className="pt-card">
                  <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                    <span className="pt-n">{i + 1}</span>
                    <div className="stack" style={{ gap: 6, minWidth: 0 }}>
                      <b className="pt-t">{p.t}</b>
                      {p.d && <div className="pt-d">{p.d}</div>}
                      {p.s && <div className="pt-do">→ {p.s}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {fb.steps.length > 0 && (
            <Section title="Próximos passos" right={<span className="k-count">{doneN} de {checks.length} feitos</span>}>
              {fb.steps.map((label, i) => (
                <button key={i} role="checkbox" aria-checked={checks[i]} onClick={() => toggle(i)} className={'k-row k-check' + (checks[i] ? ' done' : '')}>
                  <span className="k-check-box">{checks[i] ? <Check size={20} strokeWidth={2.6} aria-hidden /> : i + 1}</span>
                  <span className="k-row-main"><b>{label}</b>{checks[i] && <span className="k-row-sub">Feito</span>}</span>
                </button>
              ))}
            </Section>
          )}

          <div className="dev-inline-doc">
            <MaterialPreview v={lv} title={SLOTS[slot].title} />
          </div>

          <Actions>
            <BigButton a={{ label: fb.verdict === 'ok' ? 'Enviar outra versão' : 'Enviar nova versão', to: `/documentos/nova?slot=${slot}`, Icon: FileUp }} />
            <BigButton a={{ label: 'Histórico e comparação', to: `/documentos/${slot}/historico`, Icon: History }} variant="soft" />
          </Actions>
          <HelpCard sub="O Harvey te ajuda a aplicar os ajustes e a apresentar a proposta ao cliente." to="/harvey" />
        </div>
        <Side>
        <aside className="dev-doc">
          <MaterialPreview v={lv} title={SLOTS[slot].title} defaultOpen />
        </aside>
        </Side>
      </Workspace>
    </Screen>
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
    <Screen>
      <ScreenHead back="/documentos" title={SLOTS[slot].title} date="Histórico e comparação" />
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
    </Screen>
  );
}
