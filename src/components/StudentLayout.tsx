import { BarChart3, CalendarDays, ChevronRight, FileText, House, LogOut, MessageSquareText, MoreHorizontal, Siren, Trophy, UserRound, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useProfile } from '../lib/auth';
import { useDocs, useGami } from '../lib/data';
import { initials } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';

/** Menu lateral (computador), em dois grupos: o dia a dia e a mentoria. */
const NAV: [string, string, LucideIcon][][] = [
  [
    ['/', 'Início', House],
    ['/documentos', 'Documentos', FileText],
    ['/relatorios', 'Relatórios', BarChart3],
    ['/gamificacao', 'Gamificação', Trophy],
  ],
  [
    ['/sessoes', 'Sessões', Siren],
    ['/calendario', 'Calendário', CalendarDays],
    ['/feedback', 'Feedback', MessageSquareText],
    ['/perfil', 'Perfil', UserRound],
  ],
];
const TABS: [string, string, LucideIcon][] = [
  ['/', 'Início', House],
  ['/documentos', 'Documentos', FileText],
  ['/gamificacao', 'Gamificação', Trophy],
  ['/relatorios', 'Relatórios', BarChart3],
];
const MORE: [string, string][] = [
  ['/sessoes', 'Sessões'],
  ['/calendario', 'Calendário'],
  ['/feedback', 'Feedback da mentoria'],
  ['/perfil', 'Meu perfil'],
];

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="logo" aria-label="Render como Negócio · Início">
      <img src="/logo-rcn.png" alt="Render como Negócio" />
    </Link>
  );
}

/** Bloco de nível no menu lateral: nível atual, barra até o próximo e qual é o próximo. */
function LevelWidget({ g }: { g: ReturnType<typeof useGami> }) {
  const cur = g.current!;
  const next = g.levels.find((l) => l.n === cur.n + 1);
  const pct = g.xpMax ? (g.xpLevel / g.xpMax) * 100 : 0;
  const ghost = g.xpMax ? (g.xpStarted / g.xpMax) * 100 : 0;
  const left = g.tasksTotal - g.tasksDone;
  return (
    <Link to="/gamificacao" className="level-widget" aria-label={`Nível ${cur.n}, ${cur.name}. ${g.xpLevel} de ${g.xpMax} XP.`}>
      <div className="between" style={{ alignItems: 'baseline' }}>
        <span className="label" style={{ color: 'var(--gold)' }}>Nível {cur.n} de {g.levels.length}</span>
        <span className="mono" style={{ fontSize: 11, color: '#A9AFB9' }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: 18, letterSpacing: '-.02em', marginTop: 4 }}>{cur.name}</div>
      <div className="track" style={{ marginTop: 10 }}>
        <i style={{ width: pct + '%' }} />
        <i className="ghost" style={{ width: ghost + '%' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 8, fontSize: 12, color: '#A9AFB9' }}>
        <span className="mono">{g.xpLevel}/{g.xpMax} XP</span>
        <span>{next ? <>Próximo: <b style={{ color: '#fff', fontWeight: 600 }}>{next.name}</b></> : 'Último nível'}</span>
      </div>
      {left > 0 && <div style={{ fontSize: 12, color: '#A9AFB9', marginTop: 4 }}>{left === 1 ? 'Falta 1 tarefa' : `Faltam ${left} tarefas`}</div>}
    </Link>
  );
}

export default function StudentLayout() {
  const mobile = useIsMobile();
  const profile = useProfile();
  const { signOut } = useAuth();
  const { unseen } = useDocs();
  const gami = useGami();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  const badge = unseen.length;
  const inNova = pathname.startsWith('/documentos/nova');
  const isOn = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p));
  const inMore = MORE.some(([p]) => isOn(p));
  const logout = async () => {
    setMore(false);
    await signOut();
    nav('/login');
  };

  return (
    <div className={'app' + (mobile && !inNova ? ' has-tabbar' : '') + (mobile ? '' : ' with-sidebar')}>
      {mobile ? (
        <header className="mheader">
          <Logo />
          <Link to="/perfil" className="avatar-btn" aria-label="Meu perfil">
            {initials(profile.full_name)}
          </Link>
        </header>
      ) : (
        <aside className="sidebar">
          <div style={{ padding: '4px 10px 0' }}>
            <Logo />
          </div>
          <nav className="sidenav" aria-label="Menu principal">
            {NAV.map((group, gi) => (
              <div key={gi} className="sidenav-group">
                <div className="label sidenav-title">{gi === 0 ? 'Painel' : 'Mentoria'}</div>
                {group.map(([to, label, Icon]) => (
                  <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                    <Icon size={17} strokeWidth={1.8} aria-hidden />
                    <span style={{ flex: 1 }}>{label}</span>
                    {to === '/documentos' && badge > 0 && <span className="badge">{badge}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          {gami.current && <LevelWidget g={gami} />}
          <div className="sidebar-user">
            <Link to="/perfil" className="avatar-btn" style={{ width: 34, height: 34 }} aria-label="Meu perfil">
              {initials(profile.full_name)}
            </Link>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.full_name}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.group_name}</div>
            </div>
            <button className="rv-x" onClick={logout} aria-label="Sair" title="Sair">
              <LogOut size={17} aria-hidden />
            </button>
          </div>
        </aside>
      )}

      <main style={{ flex: 1, minWidth: 0 }}>
        <Outlet />
      </main>

      {mobile && !inNova && (
        <nav className="tabbar">
          {TABS.map(([to, label, Icon]) => (
            <Link key={to} to={to} className={isOn(to) && !more ? 'on' : ''}>
              <span className="ico">
                <Icon size={20} strokeWidth={isOn(to) && !more ? 2.2 : 1.7} aria-hidden />
                {to === '/documentos' && badge > 0 && <span className="dot">{badge}</span>}
              </span>
              {label}
            </Link>
          ))}
          <button className={inMore || more ? 'on' : ''} onClick={() => setMore(true)}>
            <span className="ico">
              <MoreHorizontal size={20} strokeWidth={1.7} aria-hidden />
            </span>
            Mais
          </button>
        </nav>
      )}

      {mobile && more && (
        <div className="sheet-backdrop" onClick={() => setMore(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Mais">
            <div className="grip" />
            {MORE.map(([to, label]) => (
              <Link key={to} to={to} onClick={() => setMore(false)}>
                {label}
                <span className="chev">
                  <ChevronRight size={18} aria-hidden />
                </span>
              </Link>
            ))}
            <button onClick={logout}>
              Sair
              <span className="chev">
                  <ChevronRight size={18} aria-hidden />
                </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
