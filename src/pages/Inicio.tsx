import { BarChart3, Briefcase, CalendarDays, Check, FilePen, FileUp, Mail, TrendingUp, Trophy, type LucideIcon } from 'lucide-react';
import { SLOT_ORDER, SLOTS, VERDICTS } from '../../shared/domain';
import { ActionGrid, DoneRow, NextUp, Pill, Row, Screen, ScreenHead, Section, Side, Workspace } from '../components/kit';
import { ErrorState, PageSkeleton } from '../components/ui';
import { useProfile } from '../lib/auth';
import { kindInfo, useMyEvents } from '../lib/agenda';
import { useDocs, useGami, useReports, type DocState } from '../lib/data';
import { dueLine, firstName, fmtBRL, fmtDay, fmtPeriod } from '../lib/format';

const TZ = 'America/Sao_Paulo';
/** "Bom dia" / "Boa tarde" / "Boa noite" no horário de Brasília. */
const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};
export const todayLabel = () => {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const whenLabel = (iso: string) => {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(x);
  const hour = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d);
  if (day(d) === day(new Date())) return `Hoje · ${hour}`;
  if (day(d) === day(new Date(Date.now() + 86_400_000))) return `Amanhã · ${hour}`;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(/\./g, '') + ` · ${hour}`;
};

export function slotHref(d: DocState): string {
  if (d.status === 'none') return `/documentos/nova?slot=${d.slot}`;
  if (d.status === 'pronta') return `/documentos/${d.slot}/devolutiva`;
  return `/documentos/${d.slot}/status`;
}

export function docLine(d: DocState): string {
  const v = d.latest?.version;
  if (d.status === 'none') return 'Ainda não enviado';
  if (d.status === 'analise' || d.status === 'revisao') return `Versão ${v} · com a equipe · ${dueLine(d.latest!.due_at)}`;
  return `Versão ${v} · devolutiva pronta`;
}

export function NewBadge() {
  return <span style={{ background: 'var(--gold)', color: 'var(--ink)', fontSize: 11, fontWeight: 900, padding: '2px 8px', borderRadius: 999 }}>Nova</span>;
}

/** Um item da lista "o que fazer agora", em ordem de importância. */
interface Step { key: string; Icon: LucideIcon; kind: string; title: string; meta?: string; when?: string; cta: string; to: string }

export default function Inicio() {
  const profile = useProfile();
  const docsQ = useDocs();
  const gami = useGami();
  const reports = useReports();
  const events = useMyEvents();
  const loading = docsQ.isLoading || gami.isLoading || reports.isLoading;
  const error = docsQ.isError || gami.isError || reports.isError;

  if (loading) return <Screen><PageSkeleton /></Screen>;
  if (error)
    return (
      <Screen>
        <ErrorState onRetry={() => { docsQ.refetch(); gami.refetch(); reports.refetch(); }} />
      </Screen>
    );

  const { docs, unseen } = docsQ;
  const fresh = SLOT_ORDER.every((s) => docs[s].versions.length === 0);
  const reps = reports.data || [];
  const last = reps[0];
  const total = reps.reduce((a, r) => a + r.revenue, 0);
  const lvl = gami.current;
  const left = gami.tasksTotal - gami.tasksDone;

  // ----- Próximo passo: a coisa mais importante agora, e o que vem depois -----
  const now = Date.now();
  const upcoming = (events.data || []).filter((e) => !e.canceled && e.me.response !== 'nao_vou' && new Date(e.ends_at).getTime() > now);
  const evStep = (e: (typeof upcoming)[number]): Step => ({
    key: 'ev' + e.id, Icon: CalendarDays, kind: kindInfo(e.kind).label, title: e.title, when: whenLabel(e.starts_at),
    meta: e.meet_url ? 'Online · o link fica na agenda' : e.location || undefined, cta: 'Ver na agenda', to: '/calendario',
  });
  const soon = upcoming.filter((e) => new Date(e.starts_at).getTime() - now < 48 * 3_600_000);
  const week = upcoming.filter((e) => new Date(e.starts_at).getTime() - now < 7 * 86_400_000);
  const daysSinceReport = last ? Math.floor((now - new Date(last.created_at).getTime()) / 86_400_000) : null;
  const nextTask = lvl ? gami.mainOf(lvl.n).find((t) => !gami.isDone(t) && !t.auto_slot) : undefined;

  const steps: Step[] = [];
  for (const s of unseen) {
    const d = docs[s];
    steps.push({ key: 'dev' + s, Icon: Mail, kind: 'Devolutiva nova', title: SLOTS[s].title, meta: `Versão ${d.latest!.version}${d.latest?.verdict ? ' · ' + VERDICTS[d.latest.verdict].label : ''}`, when: 'Chegou', cta: 'Abrir devolutiva', to: `/documentos/${s}/devolutiva` });
  }
  if (fresh) steps.push({ key: 'first', Icon: FileUp, kind: 'Comece por aqui', title: 'Envie seu primeiro material', meta: 'Devolutiva da equipe em até 48h', cta: 'Enviar material', to: '/documentos/nova' });
  soon.forEach((e) => steps.push(evStep(e)));
  for (const s of SLOT_ORDER) {
    const d = docs[s];
    if (d.status === 'pronta' && !d.unseen && d.latest?.verdict && d.latest.verdict !== 'ok')
      steps.push({ key: 'fix' + s, Icon: FilePen, kind: `Nova versão · a devolutiva pediu ${VERDICTS[d.latest.verdict].label.toLowerCase()}`, title: SLOTS[s].title, meta: 'Os pontos a mudar estão na devolutiva', cta: 'Enviar nova versão', to: `/documentos/nova?slot=${s}` });
  }
  if (daysSinceReport === null || daysSinceReport >= 14)
    steps.push({ key: 'rep', Icon: BarChart3, kind: 'Relatório quinzenal', title: last ? 'Hora do relatório da quinzena' : 'Envie seu primeiro relatório', meta: last ? `O último foi há ${daysSinceReport} dias` : 'Faturamento, propostas e prospecção', cta: 'Enviar relatório', to: '/relatorios/novo' });
  week.filter((e) => !soon.includes(e)).forEach((e) => steps.push(evStep(e)));
  if (nextTask) steps.push({ key: 'task', Icon: Trophy, kind: `Tarefa do nível ${lvl!.name}`, title: nextTask.title, meta: `+${nextTask.xp} XP`, cta: 'Ver a tarefa', to: '/gamificacao' });
  if (!fresh)
    for (const s of SLOT_ORDER)
      if (docs[s].status === 'none') steps.push({ key: 'send' + s, Icon: FileUp, kind: 'Material para enviar', title: SLOTS[s].title, meta: 'A equipe devolve revisado em até 48h', cta: 'Enviar material', to: `/documentos/nova?slot=${s}` });

  const [next, ...later] = steps;

  // ----- Feito: o que andou nos últimos dias (dá a sensação de progresso) -----
  const weekAgo = now - 10 * 86_400_000;
  const done: { key: string; title: string; sub: string; to: string; at: number }[] = [];
  for (const s of SLOT_ORDER) {
    const d = docs[s];
    const at = d.latest?.feedback?.released_at;
    if (d.status === 'pronta' && d.latest?.verdict === 'ok' && at) done.push({ key: 'ok' + s, title: `${SLOTS[s].title} aprovado`, sub: `Devolutiva de ${fmtDay(at, false)}`, to: `/documentos/${s}/devolutiva`, at: new Date(at).getTime() });
  }
  for (const t of gami.tasks) {
    const at = gami.doneAt(t);
    if (at && new Date(at).getTime() > weekAgo) done.push({ key: 't' + t.id, title: t.title, sub: `Tarefa feita · +${t.xp} XP`, to: '/gamificacao', at: new Date(at).getTime() });
  }
  if (last && daysSinceReport !== null && daysSinceReport < 14) done.push({ key: 'rep', title: 'Relatório da quinzena enviado', sub: `Quinzena ${fmtPeriod(last.period_start, last.period_end)}`, to: `/relatorios/${last.id}`, at: new Date(last.created_at).getTime() });
  done.sort((a, b) => b.at - a.at);

  return (
    <Screen>
      <ScreenHead
        title={`${greeting()}, ${firstName(profile.full_name)}.`}
        accent="Uma coisa de cada vez."
        decor
        date={todayLabel()}
        status={lvl ? <Pill tone="blue">Nível {lvl.n} · {lvl.name}</Pill> : undefined}
        lede="O que importa agora vem primeiro. O resto espera a vez: a gente organiza o que vem depois para você não precisar lembrar."
        meta={[
          { k: 'Seu nível', v: lvl ? `${lvl.name} · ${left > 0 ? `faltam ${left} tarefas` : 'completo'}` : '—' },
          { k: 'Último relatório', v: last ? `${fmtBRL(last.revenue)} na quinzena` : 'Nenhum ainda' },
          { k: 'Faturamento registrado', v: fmtBRL(total) },
          { k: 'Próxima aula', v: upcoming[0] ? whenLabel(upcoming[0].starts_at) : 'Nada marcado' },
        ]}
      />

      <Workspace>
      {next ? (
        <NextUp
          label="Próximo"
          when={next.when}
          Icon={next.Icon}
          title={next.title}
          kind={next.kind}
          meta={next.meta}
          primary={{ label: next.cta, to: next.to }}
          later={later[0] ? { label: `Depois: ${later[0].title}`, to: later[0].to } : undefined}
        />
      ) : (
        <NextUp label="Hoje" Icon={Check} title="Tudo em dia por aqui" kind="Nada pendente agora." primary={{ label: 'Ver minhas tarefas', to: '/gamificacao' }} />
      )}

      <Side>
      <Section title="O que você quer fazer?">
        <ActionGrid
          items={[
            { to: '/documentos/nova', Icon: FileUp, title: 'Enviar material', sub: 'Proposta, contrato ou portfólio' },
            { to: '/relatorios/novo', Icon: BarChart3, tone: 'mint', title: 'Relatório', sub: 'Os números da quinzena' },
            { to: '/harvey', Icon: Briefcase, title: 'Harvey', sub: 'Ajuda numa venda' },
            { to: '/gamificacao', Icon: Trophy, tone: 'mint', title: 'Tarefas', sub: left > 0 ? `${left === 1 ? 'Falta 1' : `Faltam ${left}`} para subir` : 'Nível completo' },
          ]}
        />
      </Section>
      </Side>

      {later.length > 1 && (
        <Section title="Mais tarde">
          {later.slice(1, 4).map((s) => (
            <Row key={s.key} Icon={s.Icon} when={s.when} title={s.title} sub={s.kind} to={s.to} />
          ))}
        </Section>
      )}

      <Side>
      {done.length > 0 && (
        <Section title="Feito">
          {done.slice(0, 3).map((d) => <DoneRow key={d.key} title={d.title} sub={d.sub} to={d.to} />)}
        </Section>
      )}
      </Side>

      <div className="m-only">
      <Section title="Seus números">
        <Row Icon={BarChart3} tone="mint" when="Último relatório" title={last ? fmtBRL(last.revenue) : 'Nenhum ainda'} sub={last ? `Quinzena ${fmtPeriod(last.period_start, last.period_end)}` : 'Envie seu primeiro relatório'} to="/relatorios" />
        <Row Icon={TrendingUp} when="Faturamento registrado" title={fmtBRL(total)} sub={reps.length ? `Soma de ${reps.length} relatório${reps.length > 1 ? 's' : ''}` : 'Nenhum relatório ainda'} to="/relatorios" />
      </Section>
      </div>
      </Workspace>
    </Screen>
  );
}
