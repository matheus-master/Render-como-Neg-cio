import { BarChart3, Briefcase, CalendarDays, Check, ChevronRight, FilePen, FileText, FileUp, Mail, TrendingUp, Trophy, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SLOT_ORDER, SLOTS, VERDICTS } from '../../shared/domain';
import { DocChip, ErrorState, PageSkeleton, Num } from '../components/ui';
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
const todayLabel = () => {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const whenLabel = (iso: string) => {
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

  if (loading) return <div className="page"><PageSkeleton /></div>;
  if (error)
    return (
      <div className="page">
        <ErrorState onRetry={() => { docsQ.refetch(); gami.refetch(); reports.refetch(); }} />
      </div>
    );

  const { docs, unseen } = docsQ;
  const fresh = SLOT_ORDER.every((s) => docs[s].versions.length === 0);
  const reps = reports.data || [];
  const last = reps[0];
  const total = reps.reduce((a, r) => a + r.revenue, 0);
  const lvl = gami.current;
  const pct = gami.xpMax ? (gami.xpLevel / gami.xpMax) * 100 : 0;
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
    steps.push({ key: 'dev' + s, Icon: Mail, kind: 'Devolutiva', title: `Sua devolutiva chegou: ${SLOTS[s].title}`, meta: `Versão ${d.latest!.version}${d.latest?.verdict ? ' · ' + VERDICTS[d.latest.verdict].label : ''}`, when: 'Nova', cta: 'Abrir devolutiva', to: `/documentos/${s}/devolutiva` });
  }
  if (fresh) steps.push({ key: 'first', Icon: FileUp, kind: 'Comece por aqui', title: 'Envie seu primeiro material', meta: 'Proposta, contrato, portfólio ou apresentação · devolutiva em até 48h', cta: 'Enviar material', to: '/documentos/nova' });
  soon.forEach((e) => steps.push(evStep(e)));
  for (const s of SLOT_ORDER) {
    const d = docs[s];
    if (d.status === 'pronta' && !d.unseen && d.latest?.verdict && d.latest.verdict !== 'ok')
      steps.push({ key: 'fix' + s, Icon: FilePen, kind: `Devolutiva: ${VERDICTS[d.latest.verdict].label}`, title: `Envie a nova versão: ${SLOTS[s].title}`, meta: 'Os pontos a mudar estão na devolutiva', cta: 'Enviar nova versão', to: `/documentos/nova?slot=${s}` });
  }
  if (daysSinceReport === null || daysSinceReport >= 14)
    steps.push({ key: 'rep', Icon: BarChart3, kind: 'Relatório quinzenal', title: last ? 'Hora do relatório da quinzena' : 'Envie seu primeiro relatório', meta: last ? `O último foi há ${daysSinceReport} dias` : 'Faturamento, propostas e prospecção da quinzena', cta: 'Enviar relatório', to: '/relatorios/novo' });
  week.filter((e) => !soon.includes(e)).forEach((e) => steps.push(evStep(e)));
  if (nextTask) steps.push({ key: 'task', Icon: Trophy, kind: `Tarefa do nível ${lvl!.name}`, title: nextTask.title, meta: `+${nextTask.xp} XP`, cta: 'Ver minhas tarefas', to: '/gamificacao' });
  if (!fresh)
    for (const s of SLOT_ORDER)
      if (docs[s].status === 'none') steps.push({ key: 'send' + s, Icon: FileUp, kind: 'Material', title: `Envie seu ${SLOTS[s].title.toLowerCase()}`, meta: 'A equipe devolve revisado em até 48h', cta: 'Enviar material', to: `/documentos/nova?slot=${s}` });

  const [next, ...later] = steps;

  return (
    <div className="page home">
      <header className="home-head">
        <div>
          <h1 className="h-page">{greeting()}, {firstName(profile.full_name)}</h1>
          <div className="home-date">{todayLabel()}{profile.studio ? ` · ${profile.studio}` : ''}</div>
        </div>
        {lvl && (
          <Link to="/gamificacao" className="home-chip" aria-label={`Nível ${lvl.n}: ${lvl.name}`}>
            <Trophy size={16} aria-hidden /> Nível {lvl.n} · <b>{lvl.name}</b>
          </Link>
        )}
      </header>

      {next ? (
        <section className="hero nextup" aria-label="Próximo passo">
          <div className="nextup-top">
            <span>Próximo passo</span>
            {next.when && <span>{next.when}</span>}
          </div>
          <div className="nextup-body">
            <span className="tile navy"><next.Icon size={24} strokeWidth={1.9} aria-hidden /></span>
            <div style={{ minWidth: 0 }}>
              <div className="nextup-title">{next.title}</div>
              <div className="nextup-kind">{next.kind}</div>
              {next.meta && <div className="nextup-meta">{next.meta}</div>}
            </div>
          </div>
          <Link to={next.to} className="btn btn-white btn-lg">{next.cta}</Link>
          {later[0] && (
            <Link to={later[0].to} className="nextup-later">
              <span><b>Depois:</b> {later[0].title}</span>
              {later[0].when ? <span className="nextup-when">{later[0].when}</span> : <ChevronRight size={18} aria-hidden />}
            </Link>
          )}
        </section>
      ) : (
        <section className="hero nextup" aria-label="Próximo passo">
          <div className="nextup-body">
            <span className="tile navy"><Check size={24} aria-hidden /></span>
            <div>
              <div className="nextup-title">Tudo em dia por aqui</div>
              <div className="nextup-kind">Nada pendente agora. Bom momento para revisar suas tarefas ou falar com o Harvey.</div>
            </div>
          </div>
        </section>
      )}

      <section className="home-sec">
        <h2 className="home-q">O que você quer fazer?</h2>
        <div className="home-actions">
          <Link to="/documentos/nova" className="action">
            <span className="tile"><FileUp size={24} strokeWidth={1.8} aria-hidden /></span>
            <b>Enviar material</b>
            <span>Proposta, contrato ou portfólio</span>
          </Link>
          <Link to="/relatorios/novo" className="action">
            <span className="tile mint"><BarChart3 size={24} strokeWidth={1.8} aria-hidden /></span>
            <b>Relatório</b>
            <span>Os números da quinzena</span>
          </Link>
          <Link to="/harvey" className="action">
            <span className="tile"><Briefcase size={24} strokeWidth={1.8} aria-hidden /></span>
            <b>Harvey</b>
            <span>Ajuda numa venda</span>
          </Link>
          <Link to="/gamificacao" className="action">
            <span className="tile mint"><Trophy size={24} strokeWidth={1.8} aria-hidden /></span>
            <b>Minhas tarefas</b>
            <span>{left > 0 ? `${left === 1 ? 'Falta 1' : `Faltam ${left}`} para subir` : 'Nível completo'}</span>
          </Link>
        </div>
      </section>

      {later.length > 1 && (
        <section className="home-sec">
          <h2 className="home-q">Mais para depois</h2>
          <div className="later-list">
            {later.slice(1, 4).map((s) => (
              <Link key={s.key} to={s.to} className="later-row">
                <span className="tile sm"><s.Icon size={19} strokeWidth={1.9} aria-hidden /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {s.when && <span className="later-when">{s.when}</span>}
                  <b>{s.title}</b>
                  <span className="later-kind">{s.kind}</span>
                </span>
                <ChevronRight size={18} aria-hidden style={{ color: 'var(--t4)' }} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="home-split">
        <section className="card home-mats">
          <div className="between" style={{ alignItems: 'baseline', marginBottom: 4 }}>
            <h2 className="h-card">Seus materiais</h2>
            <Link to="/documentos" className="link">Ver todos</Link>
          </div>
          {SLOT_ORDER.map((s) => {
            const d = docs[s];
            const ok = d.status === 'pronta' && d.latest?.verdict === 'ok';
            return (
              <Link key={s} to={slotHref(d)} className="mat-row">
                <span className={'tile sm' + (ok ? ' mint' : '')}>{ok ? <Check size={19} aria-hidden /> : <FileText size={19} strokeWidth={1.9} aria-hidden />}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b>{SLOTS[s].title} {d.unseen && <NewBadge />}</b>
                  <span className="later-kind">{docLine(d)}</span>
                </span>
                <DocChip d={d} />
              </Link>
            );
          })}
        </section>

        <div className="home-stats">
          {lvl && (
            <Link to="/gamificacao" className="card home-level">
              <div className="between" style={{ alignItems: 'baseline' }}>
                <span className="label">Nível {lvl.n} de {gami.levels.length}</span>
                <span className="label" style={{ letterSpacing: 0 }}>{Math.round(pct)}%</span>
              </div>
              <div className="home-level-name">{lvl.name}</div>
              <div className="track" style={{ height: 8, borderRadius: 4, marginTop: 12 }}>
                <i style={{ width: pct + '%' }} />
                <i className="ghost" style={{ width: (gami.xpMax ? (gami.xpStarted / gami.xpMax) * 100 : 0) + '%' }} />
              </div>
              <div className="home-ladder">
                {gami.levels.map((l) => (
                  <i key={l.n} className={l.n < lvl.n ? 'done' : l.n === lvl.n ? 'now' : ''} title={l.name} />
                ))}
              </div>
              <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 10 }}>
                {gami.xpLevel} de {gami.xpMax} XP · {gami.tasksDone}/{gami.tasksTotal} tarefas{gami.tasksStarted ? ` · ${gami.tasksStarted} em andamento` : ''}
              </div>
            </Link>
          )}
          <Link to="/relatorios" className="card home-stat">
            <span className="tile mint sm"><BarChart3 size={19} aria-hidden /></span>
            <span style={{ minWidth: 0 }}>
              <span className="label">Último relatório</span>
              <span className="home-num num">{last ? <Num>{fmtBRL(last.revenue)}</Num> : '—'}</span>
              <span className="later-kind">{last ? `Quinzena ${fmtPeriod(last.period_start, last.period_end)} · enviado ${fmtDay(last.created_at, false)}` : 'Envie seu primeiro relatório'}</span>
            </span>
          </Link>
          <Link to="/relatorios" className="card home-stat">
            <span className="tile sm"><TrendingUp size={19} aria-hidden /></span>
            <span style={{ minWidth: 0 }}>
              <span className="label">Faturamento registrado</span>
              <span className="home-num num"><Num>{fmtBRL(total)}</Num></span>
              <span className="later-kind">{reps.length ? `Soma de ${reps.length} relatório${reps.length > 1 ? 's' : ''}` : 'Nenhum relatório ainda'}</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
