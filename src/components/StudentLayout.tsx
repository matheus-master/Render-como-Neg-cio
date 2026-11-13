import { BarChart3, ChevronRight, FileText, House, MoreHorizontal, Trophy, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useProfile } from '../lib/auth';
import { useDocs } from '../lib/data';
import { initials } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';

const NAV: [string, string][] = [
  ['/', 'Início'],
  ['/gamificacao', 'Gamificação'],
  ['/relatorios', 'Relatórios'],
  ['/documentos', 'Documentos'],
  ['/sessoes', 'Sessões'],
  ['/calendario', 'Calendário'],
  ['/feedback', 'Feedback'],
  ['/perfil', 'Perfil'],
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
      <span className="logo-mark" aria-hidden>
        <i />
      </span>
      <span>
        Render<small>como</small>
        <br />
        Negócio
      </span>
    </Link>
  );
}

export default function StudentLayout() {
  const mobile = useIsMobile();
  const profile = useProfile();
  const { signOut } = useAuth();
  const { unseen } = useDocs();
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
    <div className={'app' + (mobile && !inNova ? ' has-tabbar' : '')}>
      {mobile ? (
        <header className="mheader">
          <Logo />
          <Link to="/perfil" className="avatar-btn" aria-label="Meu perfil">
            {initials(profile.full_name)}
          </Link>
        </header>
      ) : (
        <header className="topbar">
          <Logo />
          <nav className="topnav">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                {label}
                {to === '/documentos' && badge > 0 && <span className="badge">{badge}</span>}
              </NavLink>
            ))}
          </nav>
          <div style={{ fontSize: 15, fontWeight: 500, whiteSpace: 'nowrap', flex: 'none' }}>{profile.full_name}</div>
          <button className="btn-out-light" onClick={logout}>
            Sair
          </button>
        </header>
      )}

      <main style={{ flex: 1 }}>
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
