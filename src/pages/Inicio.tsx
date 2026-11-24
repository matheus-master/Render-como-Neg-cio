import { Link, useNavigate } from 'react-router-dom';
import { SLOT_ORDER, SLOTS } from '../../shared/domain';
import { DocChip, ErrorState, PageSkeleton, Mark } from '../components/ui';
import { useProfile } from '../lib/auth';
import { useDocs, useGami, useReports, type DocState } from '../lib/data';
import { dueLine, firstName, fmtBRL, fmtDay, fmtPeriod } from '../lib/format';

export function slotHref(d: DocState): string {
  if (d.status === 'none') return `/documentos/nova?slot=${d.slot}`;
  if (d.status === 'pronta') return `/documentos/${d.slot}/devolutiva`;
  return `/documentos/${d.slot}/status`;
}

export function docLine(d: DocState): string {
  const v = d.latest?.version;
  if (d.status === 'none') return 'Toque para enviar';
  if (d.status === 'analise' || d.status === 'revisao') return `Versão ${v} · com a equipe · ${dueLine(d.latest!.due_at)}`;
  return `Versão ${v} · devolutiva pronta`;
}

export function NewBadge() {
  return <span style={{ background: 'var(--gold)', color: 'var(--t)', fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 6 }}>NOVA</span>;
}

export default function Inicio() {
  const profile = useProfile();
  const docsQ = useDocs();
  const gami = useGami();
  const reports = useReports();
  const nav = useNavigate();
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
  const ready = unseen[0] ? docs[unseen[0]] : null;
  const reps = reports.data || [];
  const last = reps[0];
  const total = reps.reduce((a, r) => a + r.revenue, 0);
  const lvl = gami.current;
  const pct = gami.xpMax ? (gami.xpLevel / gami.xpMax) * 100 : 0;

  return (
    <div className="page">
      <div className="between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 className="h-page">Olá, {firstName(profile.full_name)}!</h1>
          <div style={{ fontSize: 15, color: 'var(--t3)', marginTop: 6 }}>{[profile.studio, profile.group_name].filter(Boolean).join(' · ')}</div>
        </div>
        <Link to="/relatorios/novo" className="btn btn-primary" style={{ flex: '1 1 auto', maxWidth: 320 }}>
          <span className="plus"><Mark m="+" size={16} /></span>Enviar relatório quinzenal
        </Link>
      </div>

      {ready && (
        <Link to={`/documentos/${ready.slot}/devolutiva`} className="card" style={{ borderColor: 'var(--ink)', padding: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', color: 'inherit', textDecoration: 'none' }}>
          <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 8, background: 'var(--ink)', color: '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}>
            <span className="chip-live" style={{ position: 'absolute', top: -3, right: -3, width: 10, height: 10, borderRadius: '50%', background: 'var(--gold)', border: '2px solid #fff' }}><span className="dot" style={{ display: 'block', width: '100%', height: '100%', borderRadius: '50%', background: 'var(--gold)' }} /></span><Mark m="✉" size={18} /></div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Sua devolutiva chegou</div>
            <div style={{ fontSize: 14, color: 'var(--t2)' }}>
              {SLOTS[ready.slot].title} · versão {ready.latest!.version}
            </div>
          </div>
          <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ac)', whiteSpace: 'nowrap' }}>Ver devolutiva  →</div>
        </Link>
      )}

      {fresh && (
        <div className="card" style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 20, lineHeight: 1.25 }}>Comece enviando seu primeiro material</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 15, lineHeight: 1.45, color: 'var(--t2)' }}>
            {['Escolha o material: proposta, contrato, portfólio ou apresentação do studio.', 'Envie o arquivo, um link ou cole o texto.', 'Receba a devolutiva revisada pela equipe em até 48h.'].map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--ac-soft)', color: 'var(--ac)', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 13, flex: 'none' }}>{i + 1}</div>
                <div>{t}</div>
              </div>
            ))}
          </div>
          <Link to="/documentos/nova" className="btn btn-primary" style={{ height: 54, borderRadius: 10, fontSize: 16, gap: 10 }}>
            <span className="plus"><Mark m="+" size={16} /></span>Enviar material para análise
          </Link>
        </div>
      )}

      {lvl && (
        <Link to="/gamificacao" className="hero" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14, textDecoration: 'none' }}>
          <div className="label" style={{ color: 'var(--gold)' }}>
            Nível {lvl.n} de {gami.levels.length}
            {lvl.goal ? ` · Meta ${lvl.goal}` : ''}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 40, lineHeight: 1, letterSpacing: '-.04em' }}>{lvl.name}</div>
            {lvl.tagline && <div style={{ fontSize: 15, color: '#A9AFB9', marginTop: 6 }}>{lvl.tagline}</div>}
          </div>
          <div className="between" style={{ fontSize: 14, flexWrap: 'wrap' }}>
            <span>
              {gami.xpLevel} de {gami.xpMax} XP
            </span>
            <span style={{ whiteSpace: 'nowrap' }}>
              {gami.tasksDone}/{gami.tasksTotal} tarefas principais{gami.tasksStarted ? ` · ${gami.tasksStarted} em andamento` : ''}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,.16)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', height: '100%' }}>
              <div style={{ width: pct + '%', height: '100%', background: 'var(--gold)' }} />
              <div style={{ width: (gami.xpMax ? (gami.xpStarted / gami.xpMax) * 100 : 0) + '%', height: '100%', background: 'repeating-linear-gradient(45deg, rgba(242,183,31,.55) 0 6px, rgba(242,183,31,.3) 6px 12px)' }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(92px,1fr))', gap: 8, fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textAlign: 'center' }}>
            {gami.levels.map((l) => {
              const done = l.n < lvl.n, cur = l.n === lvl.n;
              return (
                <div key={l.n} style={{ padding: '9px 4px', borderRadius: 8, background: cur ? 'var(--gold)' : done ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)', color: cur ? 'var(--t)' : done ? '#fff' : '#6E7580' }}>
                  {done ? <Mark m="✓" size={11} /> : null}
                  {l.name.toUpperCase()}
                </div>
              );
            })}
          </div>
        </Link>
      )}

      <div className="home-split">
      <div className="home-stats">
        <Link to="/relatorios" className="card" style={{ color: 'inherit', textDecoration: 'none' }}>
          <div className="label">Último relatório</div>
          <div style={{ fontWeight: 600, fontSize: 26, marginTop: 8 }}>{last ? fmtBRL(last.revenue) : '—'}</div>
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 2 }}>
            {last ? `Quinzena ${fmtPeriod(last.period_start, last.period_end)} · enviado ${fmtDay(last.created_at, false)}` : 'Envie seu primeiro relatório'}
          </div>
        </Link>
        <Link to="/relatorios" className="card" style={{ color: 'inherit', textDecoration: 'none' }}>
          <div className="label">Faturamento registrado</div>
          <div style={{ fontWeight: 600, fontSize: 26, marginTop: 8 }}>{fmtBRL(total)}</div>
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 2 }}>
            {reps.length ? `Soma de ${reps.length} relatório${reps.length > 1 ? 's' : ''}` : 'Nenhum relatório ainda'}
          </div>
        </Link>
      </div>

      <div className="card" style={{ padding: '20px 20px 8px' }}>
        <div className="between" style={{ alignItems: 'baseline' }}>
          <div className="h-card">Seus materiais</div>
          <Link to="/documentos" className="link">
            Ver todos
          </Link>
        </div>
        {SLOT_ORDER.map((s) => {
          const d = docs[s];
          return (
            <button key={s} onClick={() => nav(slotHref(d))} className="between divrow" style={{ alignItems: 'center', minHeight: 64, padding: '8px 0', width: '100%' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, display: 'flex', gap: 8, alignItems: 'center' }}>
                  {SLOTS[s].title}
                  {d.unseen && <NewBadge />}
                </div>
                <div style={{ fontSize: 13, color: 'var(--t3)' }}>{docLine(d)}</div>
              </div>
              <DocChip d={d} />
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}
