import { BarChart3, Briefcase, CalendarDays, ChevronRight, FileStack, FileText, FileUp, House, LifeBuoy, LogOut, MessageSquareText, MoreHorizontal, Plus, Trophy, UserRound, X, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { accessOf, useAuth, useProfile } from '../lib/auth';
import { useDocs, useGami } from '../lib/data';
import { LevelUp } from './LevelUp';
import { Avatar } from './Avatar';
import { Tile } from './kit';
import { useMyEvents, useRespond } from '../lib/agenda';
import { useIsMobile } from '../lib/useIsMobile';

/** Menu do topo (computador): só palavras, como nas pranchas. Perfil, Feedback e Sair ficam no avatar. */
const TOP: [string, string][] = [
  ['/', 'Início'],
  ['/documentos', 'Documentos'],
  ['/relatorios', 'Relatórios'],
  ['/gamificacao', 'Gamificação'],
  ['/calendario', 'Agenda'],
  ['/harvey', 'Harvey'],
  ['/sessoes', 'Ajuda'],
];
/** Barra do celular: destinos com palavra + o "Enviar" no meio. */
const TABS_L: [string, string, LucideIcon][] = [
  ['/', 'Início', House],
  ['/documentos', 'Documentos', FileText],
];
const TABS_R: [string, string, LucideIcon][] = [['/gamificacao', 'Gamificação', Trophy]];
const MORE: [string, string, LucideIcon, string][] = [
  ['/relatorios', 'Relatórios', BarChart3, 'Números da quinzena'],
  ['/calendario', 'Agenda', CalendarDays, 'Aulas e sessões'],
  ['/harvey', 'Harvey', Briefcase, 'Ajuda numa venda'],
  ['/sessoes', 'Sessões e ajuda', LifeBuoy, 'Botão Vermelho'],
  ['/feedback', 'Feedback', MessageSquareText, 'Avalie a mentoria'],
  ['/perfil', 'Perfil', UserRound, 'Seus dados'],
];
/** O que dá para enviar: a mesma lista no "+" do celular e no "Enviar" do computador. */
const SEND: [string, string, LucideIcon, string][] = [
  ['/documentos/nova', 'Material para análise', FileUp, 'Proposta, contrato, portfólio ou apresentação'],
  ['/documentos/lote', 'Vários de uma vez', FileStack, 'Todos os arquivos juntos'],
  ['/relatorios/novo', 'Relatório da quinzena', BarChart3, 'Faturamento, prospecção e conquistas'],
  ['/harvey', 'Conversa para o Harvey', Briefcase, 'Print do WhatsApp com o cliente'],
  ['/sessoes', 'Pedido de ajuda', LifeBuoy, 'Botão Vermelho: sessão de emergência'],
];

export function Logo({ to = '/', white }: { to?: string; white?: boolean }) {
  return (
    <Link to={to} className="logo" aria-label="Render como Negócio · Início">
      <img src={white ? '/logo-rcn-branco.png' : '/logo-rcn.png'} alt="Render como Negócio" />
    </Link>
  );
}

function SendSheet({ onClose, desktop }: { onClose: () => void; desktop?: boolean }) {
  return (
    <div className={desktop ? 'modal-backdrop' : 'sheet-backdrop'} onClick={onClose}>
      <div className={desktop ? 'modal send-modal' : 'sheet send-sheet'} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="O que você quer enviar?">
        {!desktop && <div className="grip" />}
        <div className="send-head">
          <h2>O que você quer enviar?</h2>
          <button className="send-x" aria-label="Fechar" onClick={onClose}><X size={20} aria-hidden /></button>
        </div>
        <div className="send-list">
          {SEND.map(([to, label, Icon, sub]) => (
            <Link key={to + label} to={to} onClick={onClose} className="send-row">
              <Tile Icon={Icon} tone={to === '/sessoes' ? 'red' : to.startsWith('/relatorios') ? 'mint' : 'blue'} />
              <span className="k-row-main"><b>{label}</b><span className="k-row-sub">{sub}</span></span>
              <ChevronRight size={20} aria-hidden style={{ color: 'var(--t3)', flex: 'none' }} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Aviso de fim da mentoria (ou de prazo perto de vencer). */
function AccessBanner() {
  const profile = useProfile();
  if (profile.role !== 'aluno') return null;
  const a = accessOf(profile);
  const fmt = (d: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z'));
  if (a.ended)
    return (
      <div className="access-banner ended">
        <b>Sua mentoria terminou{a.until ? ` em ${fmt(a.until)}` : ''}.</b> Seus documentos, devolutivas, relatórios e sua evolução continuam aqui para você consultar. Para renovar e voltar a enviar materiais, fale com a equipe RCN.
      </div>
    );
  if (a.left !== null && a.left <= 15)
    return (
      <div className="access-banner">
        <b>{a.left === 0 ? 'Seu acesso vence hoje.' : `Seu acesso vence em ${a.left} ${a.left === 1 ? 'dia' : 'dias'}`}</b>{a.left ? ` (${fmt(a.until!)}).` : ''} Para continuar enviando materiais depois disso, fale com a equipe RCN sobre a renovação.
      </div>
    );
  return null;
}

/** Convites novos, mudanças e cancelamentos da agenda: aparecem em qualquer tela até o aluno responder. */
function AgendaNotices() {
  const q = useMyEvents();
  const respond = useRespond();
  const now = Date.now();
  const list = (q.data || []).filter((e) => e.me.notice && new Date(e.ends_at).getTime() > now - 86_400_000).slice(0, 3);
  if (!list.length) return null;
  const when = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  return (
    <div className="agenda-notices">
      {list.map((e) => (
        <div key={e.id} className={'agenda-notice ' + e.me.notice}>
          <Tile Icon={CalendarDays} tone={e.me.notice === 'cancelado' ? 'red' : e.me.notice === 'alterado' ? 'amber' : 'blue'} size="sm" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="an-k">
              {e.me.notice === 'novo' ? 'Novo na sua agenda' : e.me.notice === 'alterado' ? 'Mudança na agenda' : 'Evento cancelado'}
            </div>
            <div className="an-t">{e.title} · {when(e.starts_at)}</div>
            {e.me.notice !== 'novo' && e.me.notice_text && <div style={{ fontSize: 14, marginTop: 2, color: 'var(--t3)' }}>{e.me.notice_text}</div>}
          </div>
          {e.me.notice === 'cancelado' ? (
            <button className="btn btn-secondary btn-sm" onClick={() => respond.mutate({ eventId: e.id })}>Ok, entendi</button>
          ) : (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={() => respond.mutate({ eventId: e.id, response: 'vou' })}>Vou</button>
              <button className="btn btn-secondary btn-sm" onClick={() => respond.mutate({ eventId: e.id, response: 'nao_vou' })}>Não vou</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function StudentLayout() {
  const mobile = useIsMobile();
  const profile = useProfile();
  const { signOut, session } = useAuth();
  const { unseen } = useDocs();
  const gami = useGami();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  const [send, setSend] = useState(false);
  const [me, setMe] = useState(false);
  const badge = unseen.length;
  const inNova = pathname.startsWith('/documentos/nova');
  const isOn = (p: string) => (p === '/' ? pathname === '/' : pathname.startsWith(p));
  const onTab = (p: string) => isOn(p) && !more && !send;
  const inMore = MORE.some(([p]) => isOn(p));
  const logout = async () => {
    setMore(false);
    await signOut();
    nav('/login');
  };

  const tab = ([to, label, Icon]: [string, string, LucideIcon]) => (
    <Link key={to} to={to} className={onTab(to) ? 'on' : ''}>
      <span className="ico">
        <Icon size={22} strokeWidth={onTab(to) ? 2.2 : 1.8} aria-hidden />
        {to === '/documentos' && badge > 0 && <span className="dot">{badge}</span>}
      </span>
      {label}
    </Link>
  );

  return (
    <div className={'app' + (mobile && !inNova ? ' has-tabbar' : '') + (mobile ? '' : ' with-topnav')}>
      {mobile ? (
        <header className="mheader">
          <Logo />
          <Link to="/perfil" aria-label="Meu perfil">
            <Avatar path={profile.avatar_path} name={profile.full_name} className="avatar-btn" />
          </Link>
        </header>
      ) : (
        <header className="topnav-bar">
          <Logo white />
          <nav className="tn-links" aria-label="Menu principal">
            {TOP.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
                {label}
                {to === '/documentos' && badge > 0 && <span className="badge">{badge}</span>}
              </NavLink>
            ))}
          </nav>
          {gami.current && (
            <Link to="/gamificacao" className="tn-level" title={`${gami.xpLevel} de ${gami.xpMax} XP`}>
              <span className="tn-ring" style={{ ['--p' as string]: (gami.xpMax ? Math.round((gami.xpLevel / gami.xpMax) * 100) : 0) + '%' }} />
              {gami.current.name}
            </Link>
          )}
          <button className="tn-send" onClick={() => setSend(true)}>
            <Plus size={19} strokeWidth={2.6} aria-hidden /> Enviar
          </button>
          <div className="tn-me">
            <button className="tn-avatar" aria-label="Minha conta" aria-expanded={me} onClick={() => setMe(!me)}>
              <Avatar path={profile.avatar_path} name={profile.full_name} className="avatar-btn" size={40} />
            </button>
            {me && (
              <>
                <div className="tn-scrim" onClick={() => setMe(false)} />
                <div className="tn-menu" role="menu">
                  <div className="tn-menu-head"><b>{profile.full_name}</b><span>{profile.group_name}</span></div>
                  <Link to="/perfil" role="menuitem" onClick={() => setMe(false)}><UserRound size={18} aria-hidden /> Meu perfil</Link>
                  <Link to="/feedback" role="menuitem" onClick={() => setMe(false)}><MessageSquareText size={18} aria-hidden /> Feedback da mentoria</Link>
                  <button role="menuitem" onClick={() => { setMe(false); logout(); }}><LogOut size={18} aria-hidden /> Sair</button>
                </div>
              </>
            )}
          </div>
        </header>
      )}

      <main style={{ flex: 1, minWidth: 0 }}>
        <AccessBanner />
        <AgendaNotices />
        <Outlet />
      </main>
      {session && <LevelUp uid={session.user.id} g={gami} />}

      {mobile && !inNova && (
        <nav className="tabbar">
          {TABS_L.map(tab)}
          <button className={'tab-plus' + (send ? ' on' : '')} onClick={() => setSend(true)}>
            <span className="plus-btn"><Plus size={26} strokeWidth={2.4} aria-hidden /></span>
            Enviar
          </button>
          {TABS_R.map(tab)}
          <button className={inMore || more ? 'on' : ''} onClick={() => setMore(true)}>
            <span className="ico"><MoreHorizontal size={22} strokeWidth={1.8} aria-hidden /></span>
            Mais
          </button>
        </nav>
      )}

      {mobile && more && (
        <div className="sheet-backdrop" onClick={() => setMore(false)}>
          <div className="sheet more-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Mais">
            <div className="grip" />
            <div className="more-grid">
              {MORE.map(([to, label, Icon, sub]) => (
                <Link key={to} to={to} onClick={() => setMore(false)} className={'more-tile' + (isOn(to) ? ' on' : '')}>
                  <Tile Icon={Icon} tone={to === '/sessoes' ? 'red' : 'blue'} />
                  <b>{label}</b>
                  <span>{sub}</span>
                </Link>
              ))}
            </div>
            <button className="k-big secondary" onClick={logout}><LogOut size={20} aria-hidden /><span>Sair</span><span /></button>
          </div>
        </div>
      )}
      {send && <SendSheet onClose={() => setSend(false)} desktop={!mobile} />}
    </div>
  );
}
