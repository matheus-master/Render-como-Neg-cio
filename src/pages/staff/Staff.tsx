import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
const AvatarBuilder = lazy(() => import('../../components/AvatarBuilder'));
import { CalendarDays, Check, ChevronDown, FileText, Inbox, LayoutDashboard, LogOut, PenLine, Settings, Sparkles, Upload, type LucideIcon } from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useIsMobile } from '../../lib/useIsMobile';
import { FILE_SUMMARY, forbiddenHits, MAX_UPLOAD_BYTES, POINT_SECS, SLOTS, VERDICTS, type Feedback, type FeedbackFile, type PointSec, type Verdict } from '../../../shared/domain';
import { safeName, uploadWithProgress } from '../../lib/upload';
import { openSigned } from '../../lib/agenda';
import { ErrorState, VerdictChip, Mark } from '../../components/ui';
import { DoneRow, NextUp, Note, Pill, Row, Screen, ScreenHead, Section, Side, Workspace } from '../../components/kit';
import { Logo } from '../../components/StudentLayout';
import { useAuth, useProfile } from '../../lib/auth';
import { useFeatures, useQueue, useReviewItem, type QueueRow, type ReviewItem } from '../../lib/data';
import { firstName, fmtDue, fmtDueRel, fmtLongToday, fmtSent, fmtTime } from '../../lib/format';
import { apiPost, supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { Avatar } from '../../components/Avatar';


export function StaffLayout() {
  const profile = useProfile();
  const { signOut } = useAuth();
  const q = useQueue();
  const nav = useNavigate();
  const mobile = useIsMobile();
  const { pathname } = useLocation();
  const [me, setMe] = useState(false);
  const [builder, setBuilder] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pending = (q.data || []).filter((r) => r.status !== 'pronta').sort((a, b) => a.due_at.localeCompare(b.due_at)); // com o robô desligado, 'em análise' também espera a equipe
  const pend = pending.length;
  const items: [string, string, LucideIcon, number?][] = [
    ['/equipe', 'Painel', LayoutDashboard],
    ['/equipe/fila', 'Fila', Inbox, pend],
    ['/equipe/agenda', 'Agenda', CalendarDays],
    ['/equipe/config', 'Ajustes', Settings],
  ];
  const isOn = (to: string) => (to === '/equipe' ? pathname === '/equipe' || pathname.startsWith('/equipe/aluno') : pathname.startsWith(to) || (to === '/equipe/fila' && pathname.startsWith('/equipe/revisao')));
  const logout = async () => { setMe(false); await signOut(); nav('/equipe/entrar'); };
  const next = () => nav(pending[0] ? `/equipe/revisao/${pending[0].id}` : '/equipe/fila');

  useEffect(() => {
    if (mobile) return;
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [mobile]);
  useEffect(() => setMe(false), [pathname]);
  useEffect(() => {
    if (!me) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setMe(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [me]);

  if (mobile) {
    return (
      <div className="app has-tabbar">
        <header className="mheader">
          <Logo to="/equipe" />
          <button className="btn btn-gold btn-sm" onClick={next}>{pend ? `Próxima devolutiva · ${pend}` : 'Fila em dia'}</button>
        </header>
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><Outlet /></main>
        <nav className="tabbar" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {items.map(([to, label, Icon, badge]) => (
            <Link key={to} to={to} className={isOn(to) ? 'on' : ''}>
              <span className="ico">
                <Icon size={22} strokeWidth={isOn(to) ? 2.2 : 1.8} aria-hidden />
                {!!badge && <span className="dot">{badge}</span>}
              </span>
              {label}
            </Link>
          ))}
          <button onClick={logout}>
            <span className="ico"><LogOut size={22} strokeWidth={1.8} aria-hidden /></span>
            Sair
          </button>
        </nav>
      </div>
    );
  }
  return (
    <div className="app with-topnav staff-app">
      <header className={'topnav-bar' + (scrolled ? ' scrolled' : '')}>
        <div className="tn-brand">
          <Logo to="/equipe" white />
          <span className="tn-tag">Equipe</span>
        </div>
        <nav className="tn-links" aria-label="Menu da equipe">
          {items.map(([to, label, Icon, badge]) => (
            <Link key={to} to={to} className={'tn-item' + (isOn(to) ? ' on' : '')} title={label}>
              <span className="tn-ico">
                <Icon size={21} strokeWidth={isOn(to) ? 2.3 : 1.8} aria-hidden />
                {!!badge && <span className="tn-count">{badge}</span>}
              </span>
              <span className="tn-label">{label === 'Fila' ? 'Fila de revisão' : label}</span>
            </Link>
          ))}
        </nav>
        <button className="tn-send" onClick={next} title={pending[0] ? `${pending[0].student.full_name} · ${SLOTS[pending[0].slot].title}` : undefined}>
          <PenLine size={19} strokeWidth={2.4} aria-hidden /> {pend ? 'Próxima devolutiva' : 'Fila em dia'}
        </button>
        <div className="tn-me">
          <button className={'tn-me-btn' + (me ? ' open' : '')} aria-haspopup="menu" aria-expanded={me} onClick={() => setMe(!me)}>
            <span className="tn-ring" style={{ ['--p' as string]: '100%' }}>
              <Avatar path={profile.avatar_path} name={profile.full_name} className="avatar-btn" size={38} />
            </span>
            <span className="tn-me-txt"><b>{firstName(profile.full_name)}</b><small>Equipe RCN</small></span>
            <ChevronDown size={17} className="tn-chev" aria-hidden />
          </button>
          {me && (
            <>
              <div className="tn-scrim" onClick={() => setMe(false)} />
              <div className="tn-menu" role="menu">
                <div className="tn-menu-head">
                  <Avatar path={profile.avatar_path} name={profile.full_name} className="avatar-btn" size={44} />
                  <div style={{ minWidth: 0 }}><b>{profile.full_name}</b><span>{profile.email}</span></div>
                </div>
                  <button role="menuitem" onClick={() => { setMe(false); setBuilder(true); }}><Sparkles size={19} aria-hidden /> {profile.avatar_config ? 'Editar meu avatar' : 'Criar meu avatar'}</button>
                <Link to="/equipe/config" role="menuitem"><Settings size={19} aria-hidden /> Ajustes e grupos</Link>
                <div className="tn-menu-sep" />
                <button role="menuitem" onClick={logout}><LogOut size={19} aria-hidden /> Sair</button>
              </div>
            </>
          )}
        </div>
      </header>
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
      {builder && <Suspense fallback={null}><AvatarBuilder onClose={() => setBuilder(false)} /></Suspense>}
    </div>
  );
}

// ---------------------------------------------------------------------
// A. Fila de revisão
// ---------------------------------------------------------------------
type RowKind = 'draft' | 'wait' | 'run' | 'lib';
const kindOf = (r: QueueRow): RowKind => (r.status === 'pronta' ? 'lib' : r.status === 'analise' ? 'run' : r.fb.draft_saved_at ? 'draft' : 'wait');

export function Fila() {
  const q = useQueue();
  const nav = useNavigate();
  const [tab, setTab] = useState<'pend' | 'lib'>('pend');
  const [grp, setGrp] = useState<string>('Todos');
  const rows = q.data || [];
  const pend = rows.filter((r) => r.status !== 'pronta').sort((a, b) => a.due_at.localeCompare(b.due_at));
  const lib = rows.filter((r) => r.status === 'pronta').sort((a, b) => (b.fb.released_at || '').localeCompare(a.fb.released_at || ''));
  const pendCount = pend.length;
  const ai = useFeatures().data?.ai ?? false;
  const groups = [...new Set(rows.map((r) => r.student.group_name).filter(Boolean) as string[])].sort();
  const now = Date.now();
  const late = pend.filter((r) => new Date(r.due_at).getTime() < now);
  const todayDue = pend.filter((r) => fmtDueRel(r.due_at).today && new Date(r.due_at).getTime() >= now);
  const week = lib.filter((r) => r.fb.released_at && now - new Date(r.fb.released_at).getTime() < 7 * 86_400_000);
  const list = (tab === 'pend' ? pend : lib).filter((r) => grp === 'Todos' || r.student.group_name === grp);
  const first = pend[0];
  const open = (r: QueueRow) => nav(`/equipe/revisao/${r.id}`);
  const dueTone = (r: QueueRow) => (new Date(r.due_at).getTime() < now ? 'red' : fmtDueRel(r.due_at).today ? 'amber' : 'blue') as 'red' | 'amber' | 'blue';
  const action = (k: RowKind) => (k === 'draft' ? 'Continuar' : k === 'lib' ? 'Ver' : k === 'run' && ai ? 'Abrir' : 'Escrever');
  const status = (r: QueueRow, k: RowKind) =>
    k === 'lib' ? `Liberada por ${firstName(r.fb.reviewer?.full_name || '') || 'equipe'}` : k === 'draft' ? `Rascunho de ${firstName(r.fb.saver?.full_name || '')}` : k === 'run' && ai ? 'Mike está analisando' : 'Aguardando a equipe';

  return (
    <Screen>
      <ScreenHead
        title="Fila de revisão."
        accent={pendCount ? `${pendCount} esperando.` : 'Tudo em dia.'}
        date={fmtLongToday()}
        meta={[
          { k: 'Pendentes', v: `${pendCount} devolutiva${pendCount === 1 ? '' : 's'}` },
          { k: 'Vencem hoje', v: todayDue.length ? `${todayDue.length} · a próxima às ${fmtTime(todayDue[0]!.due_at)}` : 'Nenhuma' },
          { k: 'Vencidas', v: late.length ? `${late.length} fora do prazo` : 'Nenhuma' },
          { k: 'Liberadas em 7 dias', v: String(week.length) },
        ]}
      />
      <Workspace>
        {first ? (
          <NextUp
            label="Próxima devolutiva"
            when={fmtDueRel(first.due_at).text}
            Icon={PenLine}
            title={first.student.full_name}
            kind={`${SLOTS[first.slot].title} · versão ${first.version}`}
            meta={[first.student.group_name, first.student.studio].filter(Boolean).join(' · ')}
            primary={{ label: kindOf(first) === 'draft' ? 'Continuar o rascunho' : 'Escrever devolutiva', to: `/equipe/revisao/${first.id}` }}
          />
        ) : (
          !q.isLoading && <NextUp label="Fila" Icon={Check} title="Nenhuma devolutiva esperando" kind="Quando um aluno enviar material, ele aparece aqui na ordem do prazo." />
        )}

        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div className="seg sm">
            <button className={tab === 'pend' ? 'on' : ''} onClick={() => setTab('pend')}>Pendentes · {pendCount}</button>
            <button className={tab === 'lib' ? 'on' : ''} onClick={() => setTab('lib')}>Liberadas</button>
          </div>
          {['Todos', ...groups].map((g) => (
            <button key={g} className={'pill' + (grp === g ? ' on' : '')} onClick={() => setGrp(g)}>
              {g === 'Todos' ? 'Todos os grupos' : g}
            </button>
          ))}
        </div>

        {q.isError ? (
          <ErrorState onRetry={q.refetch} />
        ) : q.isLoading ? (
          <div className="skel-card" style={{ height: 260 }} />
        ) : list.length === 0 ? (
          <Note>{tab === 'pend' && grp === 'Todos' ? 'Tudo em dia. Nenhuma devolutiva esperando revisão.' : 'Nada por aqui com esse filtro.'}</Note>
        ) : (
          <Section title={tab === 'pend' ? 'Por ordem de prazo' : 'Liberadas'} right={<span className="k-count">{list.length}</span>}>
            {list.map((r) => {
              const k = kindOf(r);
              return (
                <Row
                  key={r.id}
                  Icon={k === 'lib' ? Check : k === 'draft' ? PenLine : FileText}
                  tone={k === 'lib' ? 'mint' : k === 'draft' ? 'amber' : 'blue'}
                  when={k === 'lib' ? `Liberada ${fmtSent(r.fb.released_at || r.created_at)}` : <span className={'due-' + dueTone(r)}>{fmtDueRel(r.due_at).text}</span>}
                  title={r.student.full_name}
                  sub={`${SLOTS[r.slot].title} · v${r.version} · ${r.student.group_name || 'sem grupo'} · ${status(r, k)}`}
                  onClick={() => open(r)}
                  right={
                    <span className="row" style={{ gap: 10, flex: 'none' }}>
                      {k === 'lib' ? <VerdictChip v={r.fb.verdict!} /> : <Pill tone={dueTone(r)}>{dueTone(r) === 'red' ? 'Vencida' : dueTone(r) === 'amber' ? 'Vence hoje' : 'No prazo'}</Pill>}
                      <span className={'btn btn-sm ' + (k === 'draft' ? 'btn-primary' : 'btn-soft')}>{action(k)}</span>
                    </span>
                  }
                />
              );
            })}
          </Section>
        )}

        <Side>
          <Section title="Liberadas recentemente">
            {lib.slice(0, 5).map((r) => (
              <DoneRow key={r.id} title={r.student.full_name} sub={`${SLOTS[r.slot].title} · ${r.fb.verdict ? VERDICTS[r.fb.verdict].label : ''} · ${fmtSent(r.fb.released_at || r.created_at)}`} to={`/equipe/revisao/${r.id}`} />
            ))}
            {lib.length === 0 && <div className="k-row-sub">Nenhuma ainda.</div>}
          </Section>
        </Side>
        <Side>
          <Note tone="blue">A fila é ordenada pelo prazo: o que vence primeiro fica no topo. O prazo do aluno é de 48h a partir do envio.</Note>
        </Side>
      </Workspace>
    </Screen>
  );
}

// ---------------------------------------------------------------------
// B. Revisão da devolutiva
// ---------------------------------------------------------------------
interface Draft {
  verdict: Verdict | null;
  sum: string;
  strong: string[];
  pts: { t: string; d: string; s: string; sec?: PointSec; pg?: string }[];
  steps: string; // um por linha
  file?: FeedbackFile | null;
}
const EMPTY: Draft = { verdict: null, sum: '', strong: [''], pts: [], steps: '' };
const toDraft = (f: Feedback | null): Draft => (f ? { verdict: f.verdict, sum: f.sum === FILE_SUMMARY ? '' : f.sum, strong: [...f.strong], pts: f.pts.map((p) => ({ ...p })), steps: f.steps.join('\n'), file: f.file ?? null } : EMPTY);
const toFeedback = (d: Draft): Feedback => ({
  verdict: d.verdict || 'aj',
  sum: d.sum.trim(),
  strong: d.strong.map((x) => x.trim()).filter(Boolean),
  pts: d.pts.filter((p) => p.t.trim()).map((p) => ({ t: p.t.trim(), d: p.d.trim(), s: p.s.trim(), ...(p.sec ? { sec: p.sec } : {}), ...(p.pg?.trim() ? { pg: p.pg.trim() } : {}) })),
  steps: d.steps.split('\n').map((x) => x.trim()).filter(Boolean),
});

export function Revisao() {
  const { id } = useParams();
  const q = useReviewItem(id);
  if (q.isLoading) return <div style={{ padding: 40 }}><div className="skel" style={{ height: 400, borderRadius: 12 }} /></div>;
  if (q.isError) return <div className="staff-wrap"><ErrorState onRetry={q.refetch} /></div>;
  if (!q.data)
    return (
      <div className="staff-wrap">
        <div className="dashed" style={{ gap: 10 }}>
          <div style={{ fontWeight: 600, fontSize: 17 }}>Envio não encontrado</div>
          <div style={{ fontSize: 14, color: 'var(--t3)' }}>Ele pode ter sido apagado, ou o link está incompleto.</div>
          <Link to="/equipe/fila" className="btn btn-primary btn-sm">Voltar para a fila</Link>
        </div>
      </div>
    );
  return <ReviewScreen key={q.data.id} item={q.data} refetch={q.refetch} />;
}

function ReviewScreen({ item, refetch }: { item: ReviewItem; refetch: () => unknown }) {
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const profile = useProfile();
  const ai = useFeatures().data?.ai ?? false;
  const released = item.status === 'pronta';
  const [draft, setDraft] = useState<Draft>(() => toDraft(released ? item.fb.released : item.fb.draft));
  const [scratch, setScratch] = useState(false);
  const [saved, setSaved] = useState(!!item.fb.draft_saved_at);
  const [busy, setBusy] = useState(false);
  const [releaseErr, setReleaseErr] = useState(false);
  const student = firstName(item.student.full_name);
  const hasDraft = !!item.fb.draft || scratch;
  // Sem rascunho da IA, a equipe sobe a devolutiva em arquivo (veredito + arquivo + recado).
  // O formulário completo fica para o rascunho da IA ou para quem preferir escrever ponto por ponto.
  const [mode, setMode] = useState<'file' | 'form'>(() => {
    const f = released ? item.fb.released : item.fb.draft;
    return f && !f.file ? 'form' : 'file';
  });
  const [up, setUp] = useState<number | null>(null);
  const fileIn = useRef<HTMLInputElement>(null);

  // O rascunho da IA chegou enquanto a tela estava aberta.
  useEffect(() => {
    if (item.fb.draft && !scratch && draft === EMPTY) {
      setDraft(toDraft(item.fb.draft));
      setMode(item.fb.draft.file ? 'file' : 'form');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.fb.draft]);

  const upd = (fn: (d: Draft) => void) => {
    setDraft((d) => {
      const c: Draft = JSON.parse(JSON.stringify(d));
      fn(c);
      return c;
    });
    setSaved(false);
    setReleaseErr(false);
  };

  const fbNow: Feedback =
    mode === 'file'
      ? { verdict: draft.verdict || 'aj', sum: draft.sum.trim(), strong: [], pts: [], steps: [], ...(draft.file ? { file: draft.file } : {}) }
      : toFeedback(draft);
  const texts = [draft.sum, ...draft.strong, ...draft.pts.flatMap((p) => [p.t, p.d, p.s]), draft.steps];
  const found = texts.flatMap(forbiddenHits);
  const nFields = texts.filter((t) => forbiddenHits(t).length).length;
  const words = [...new Set(found)].map((w) => `“${w}”`).join(', ');

  const saveDraft = async (silent = false) => {
    const { error } = await supabase
      .from('feedbacks')
      .update({ draft: { ...fbNow, verdict: draft.verdict || 'aj' }, draft_saved_by: profile.id, draft_saved_at: new Date().toISOString() })
      .eq('submission_id', item.id);
    if (error) {
      if (!silent) toast('O rascunho não foi salvo. Tente de novo.');
      return false;
    }
    setSaved(true);
    qc.invalidateQueries({ queryKey: ['queue'] });
    if (!silent) toast('Rascunho salvo.');
    return true;
  };

  const approve = async () => {
    if (busy) return;
    if (!draft.verdict) return toast('Escolha um veredito antes de liberar.');
    if (mode === 'file' && !draft.file) return toast('Suba o arquivo da devolutiva antes de liberar.');
    if (mode === 'form' && !draft.sum.trim()) return toast('Escreva o resumo antes de liberar.');
    setBusy(true);
    await saveDraft(true); // as edições ficam salvas mesmo se a liberação falhar
    try {
      await apiPost(`/api/submissions/${item.id}/release`, { draft: fbNow });
      qc.invalidateQueries({ queryKey: ['queue'] });
      toast(`Devolutiva liberada. ${student} já pode ver no portal.`);
      nav('/equipe/fila');
    } catch {
      setReleaseErr(true);
    } finally {
      setBusy(false);
    }
  };

  const uploadFile = async (f: File) => {
    if (f.size > MAX_UPLOAD_BYTES) return toast('O arquivo passa de 50 MB. Exporte em PDF ou divida em partes.');
    setUp(0);
    try {
      const path = `devolutivas/${item.id}/${Date.now()}_${safeName(f.name)}`;
      await uploadWithProgress('files', path, f, setUp).promise;
      const old = draft.file?.path;
      const next: Draft = { ...draft, file: { path, name: f.name } };
      setDraft(next);
      setReleaseErr(false);
      // Já guarda no rascunho: se a tela fechar, o arquivo continua ligado a esta devolutiva.
      const { error } = await supabase
        .from('feedbacks')
        .update({ draft: { verdict: next.verdict || 'aj', sum: next.sum.trim(), strong: [], pts: [], steps: [], file: next.file }, draft_saved_by: profile.id, draft_saved_at: new Date().toISOString() })
        .eq('submission_id', item.id);
      setSaved(!error);
      if (old) supabase.storage.from('files').remove([old]);
    } catch {
      toast('O envio do arquivo não foi concluído. Tente de novo.');
    } finally {
      setUp(null);
    }
  };
  const removeFile = () => {
    const old = draft.file?.path;
    upd((d) => { d.file = null; });
    if (old) supabase.storage.from('files').remove([old]);
  };

  const regenerate = async () => {
    try {
      await apiPost(`/api/submissions/${item.id}/analyze`);
      toast('Gerando de novo. Leva de 2 a 5 minutos.');
      refetch();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const meta = [item.student.studio, item.student.group_name, `versão ${item.version}`, `enviada ${fmtSent(item.created_at)}`, released ? 'liberada' : `vence ${fmtDue(item.due_at)}`].filter(Boolean).join(' · ');
  const generating = ai && !hasDraft && ['pending', 'queued'].includes(item.fb.ai_status) && !released;
  const failed = ai && !hasDraft && item.fb.ai_status === 'failed' && !released;
  const verdictPicker = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
      {(['ok', 'aj', 're'] as const).map((k) => {
        const x = VERDICTS[k], on = draft.verdict === k;
        return (
          <button key={k} aria-pressed={on} className={'rv-verdict' + (on ? ' on' : '')} onClick={() => upd((d) => { d.verdict = k; })} style={on ? { background: x.bg, color: x.fg, borderColor: x.strong } : undefined}>
            <Mark m={x.mark} size={18} />
            {x.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="row" style={{ background: '#fff', borderBottom: '1px solid var(--b-card)', gap: 14, padding: '14px 28px', flexWrap: 'wrap' }}>
        <Link to="/equipe/fila" className="link"><Mark m="←" size={14} /> Fila</Link>
        <div style={{ width: 1, height: 24, background: 'var(--b-card)' }} />
        <Avatar path={item.student.avatar_path} name={item.student.full_name} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            {item.student.full_name} · {SLOTS[item.slot].title}
          </div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>{meta}</div>
        </div>
      </div>
      <div className="review-cols">
        <Material item={item} student={student} />
        <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--alt)', minWidth: 0 }}>
          <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
            <div className="between" style={{ flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>
                {released ? 'Devolutiva liberada' : item.fb.draft && !scratch ? 'Devolutiva · rascunho' : 'Devolutiva'}
              </div>
              <div style={{ fontSize: 14, color: 'var(--t3)' }}>
                Critérios de {SLOTS[item.slot].tipo} · {item.student.group_name || 'todos os grupos'}
              </div>
            </div>

            {generating ? (
              <div className="card stack" style={{ alignItems: 'center', gap: 12, padding: '40px 20px', textAlign: 'center' }}>
                <div className="spinner" />
                <div style={{ fontWeight: 600, fontSize: 16 }}>Mike está preparando o rascunho da devolutiva…</div>
                <div style={{ fontSize: 15, color: 'var(--t3)' }}>Leva de 2 a 5 minutos. Você já pode ler o material ao lado.</div>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => { setScratch(true); setDraft(EMPTY); setMode('file'); }}>
                  Não esperar: subir a devolutiva em arquivo
                </button>
              </div>
            ) : failed ? (
              <div className="card stack" style={{ gap: 12, padding: 24 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>O Mike não conseguiu gerar o rascunho</div>
                <div style={{ fontSize: 15, color: 'var(--t2)', lineHeight: 1.45 }}>{item.fb.ai_error || 'A análise falhou.'}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={() => { setScratch(true); setDraft(EMPTY); setMode('file'); }}>Subir a devolutiva em arquivo</button>
                  <button className="btn btn-secondary" onClick={regenerate}>Gerar de novo</button>
                </div>
              </div>
            ) : mode === 'file' ? (
              <fieldset disabled={released} className="rv-filemode">
                <div className="rv-step">
                  <div className="rv-h"><span className="rv-n">1</span> Veredito</div>
                  {verdictPicker}
                </div>
                <div className="rv-step">
                  <div className="rv-h"><span className="rv-n">2</span> Arquivo da devolutiva</div>
                  <input ref={fileIn} type="file" hidden accept=".pdf,.doc,.docx,.ppt,.pptx,image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) uploadFile(f); }} />
                  {up !== null ? (
                    <div className="rv-drop busy">
                      <div className="spinner" />
                      <b>Enviando… {up}%</b>
                      <div className="track" style={{ height: 6, borderRadius: 3, width: '100%', maxWidth: 320 }}><i style={{ width: up + '%' }} /></div>
                    </div>
                  ) : draft.file ? (
                    <div className="rv-filecard">
                      <span className="rv-fileico"><FileText size={22} aria-hidden /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b>{draft.file.name}</b>
                        <span>{released ? `Liberado para ${student}` : `${student} só vê depois que você liberar`}</span>
                      </div>
                      <a href="#" role="button" className="btn btn-secondary btn-sm" onClick={(e) => { e.preventDefault(); openSigned(draft.file!.path); }}>Abrir</a>
                      {!released && <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileIn.current?.click()}>Trocar</button>}
                      {!released && <button type="button" className="rv-x" aria-label="Remover arquivo" onClick={removeFile}><Mark m="×" size={18} /></button>}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="rv-drop"
                      onClick={() => fileIn.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f); }}
                    >
                      <span className="rv-fileico"><Upload size={22} aria-hidden /></span>
                      <b>Arraste o arquivo aqui ou clique para escolher</b>
                      <span>O PDF ou Word com os seus comentários · até 50 MB</span>
                    </button>
                  )}
                </div>
                <div className="rv-step">
                  <div className="rv-h"><span className="rv-n">3</span> Recado para {student} <span className="rv-opt">opcional</span></div>
                  <Field value={draft.sum} min={64} placeholder={`Ex.: ${student}, deixei os ajustes comentados no arquivo. Comece pelo prazo e pelas revisões.`} onChange={(v) => upd((d) => { d.sum = v; })} />
                </div>
                {!released && (
                  <button type="button" className="link" style={{ alignSelf: 'flex-start', fontSize: 14 }} onClick={() => { setMode('form'); setScratch(true); }}>
                    Prefiro escrever ponto por ponto
                  </button>
                )}
              </fieldset>
            ) : (
              <fieldset disabled={released} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
                {!released && (
                  <button type="button" className="link" style={{ alignSelf: 'flex-start', fontSize: 14 }} onClick={() => setMode('file')}>
                    Usar um arquivo em vez disso
                  </button>
                )}
                <div className="stack" style={{ gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>Veredito</div>
                  {verdictPicker}
                  <Field value={draft.sum} min={64} placeholder="Resumo do veredito, em uma ou duas frases" onChange={(v) => upd((d) => { d.sum = v; })} />
                </div>

                <div className="stack" style={{ gap: 8 }}>
                  <div className="between">
                    <div style={{ fontWeight: 600, fontSize: 15 }}>Pontos fortes</div>
                    <button className="add" onClick={() => upd((d) => { d.strong.push(''); })}>+ Adicionar</button>
                  </div>
                  {draft.strong.map((v, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ color: 'var(--ok)', fontWeight: 600, paddingTop: 10 }}><Mark m="✓" size={13} /></span>
                      <Field value={v} onChange={(val) => upd((d) => { d.strong[i] = val; })} />
                      <button className="rv-x" aria-label="Remover" onClick={() => upd((d) => { d.strong.splice(i, 1); })}><Mark m="×" size={18} /></button>
                    </div>
                  ))}
                </div>

                <div className="stack" style={{ gap: 10 }}>
                  <div className="between">
                    <div style={{ fontWeight: 600, fontSize: 15 }}>Pontos a ajustar</div>
                    <button className="add" onClick={() => upd((d) => { d.pts.push({ t: '', d: '', s: '', sec: 'obrigatorio', pg: '' }); })}>+ Adicionar ponto</button>
                  </div>
                  {draft.pts.length === 0 && <div style={{ fontSize: 14, color: 'var(--t3)' }}>Nenhum ponto a ajustar.</div>}
                  {draft.pts.map((p, i) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid var(--b-input)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--warn-bg)', color: 'var(--warn-t)', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600, flex: 'none' }}>{i + 1}</div>
                        <input
                          className={'rv-field' + (forbiddenHits(p.t).length ? ' hit' : '')}
                          style={{ height: 40, fontWeight: 600, padding: '0 12px' }}
                          placeholder="Título do ponto"
                          value={p.t}
                          onChange={(e) => { const val = e.target.value; upd((d) => { d.pts[i]!.t = val; }); }}
                        />
                        <button className="rv-x" aria-label="Remover ponto" onClick={() => upd((d) => { d.pts.splice(i, 1); })}><Mark m="×" size={18} /></button>
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <select className="rv-field" style={{ height: 36, padding: '0 8px', flex: 1, minWidth: 0 }} aria-label="Seção" value={p.sec || ''} onChange={(e) => { const v = e.target.value as PointSec | ''; upd((d) => { d.pts[i]!.sec = v || undefined; }); }}>
                          <option value="">Sem seção</option>
                          {POINT_SECS.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}
                        </select>
                        <input className="rv-field" style={{ height: 36, padding: '0 10px', width: 130 }} placeholder="pág. / cláusula" aria-label="Página" value={p.pg || ''} onChange={(e) => { const v = e.target.value; upd((d) => { d.pts[i]!.pg = v; }); }} />
                      </div>
                      <Field value={p.d} min={56} placeholder={p.sec === 'portugues' ? 'Trecho como está escrito' : 'O que está errado ou faltando'} onChange={(val) => upd((d) => { d.pts[i]!.d = val; })} />
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ac)' }}>{p.sec === 'portugues' ? 'Correção' : 'O que fazer'}</div>
                      <Field value={p.s} min={56} placeholder={p.sec === 'portugues' ? 'Trecho corrigido' : 'Orientação direta ao aluno'} onChange={(val) => upd((d) => { d.pts[i]!.s = val; })} />
                    </div>
                  ))}
                </div>

                <div className="stack" style={{ gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    Próximos passos <span style={{ fontWeight: 400, color: 'var(--t3)' }}>· um por linha, viram checklist para o aluno</span>
                  </div>
                  <Field value={draft.steps} min={110} onChange={(v) => upd((d) => { d.steps = v; })} />
                </div>
              </fieldset>
            )}
          </div>

          {!released && (hasDraft || mode === 'file') && !generating && (
            <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid var(--b-card)' }}>
              {found.length > 0 && (
                <div className="row" style={{ gap: 10, padding: '10px 28px', borderBottom: '1px solid var(--b-div)', fontSize: 14, lineHeight: 1.4, color: '#5C3F00', background: '#FFF9EA' }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: '#B07800', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, flex: 'none' }}><Mark m="!" size={12} /></span>
                  <span style={{ flex: 1 }}>
                    {nFields === 1 ? '1 trecho menciona ' : `${nFields} trechos mencionam `}
                    {words}. Prefira falar direto com o aluno, sem citar modelos ou critérios internos.
                  </span>
                </div>
              )}
              {releaseErr && (
                <div className="alert-err" style={{ borderRadius: 0, padding: '10px 28px' }}>
                  <div className="ico-circle ico-err"><Mark m="!" size={12} /></div>
                  <div style={{ fontSize: 14, color: 'var(--err-t)', fontWeight: 600 }}>A devolutiva não foi liberada. Suas edições estão salvas como rascunho.</div>
                </div>
              )}
              <div className="row" style={{ padding: '14px 28px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 14, color: 'var(--t3)', flex: 1, minWidth: 200 }}>
                  {saved ? `Rascunho salvo. ${student} ainda não vê nada.` : `Ao liberar, ${student} vê a devolutiva assinada por você.`}
                </div>
                <button className="btn btn-secondary" onClick={() => saveDraft()}>Salvar rascunho</button>
                <button className="btn btn-primary" style={{ padding: '0 22px' }} disabled={busy} onClick={approve}>
                  {busy ? 'Liberando…' : mode === 'file' ? 'Liberar devolutiva' : 'Aprovar e liberar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ value, onChange, min = 44, placeholder }: { value: string; onChange: (v: string) => void; min?: number; placeholder?: string }) {
  return (
    <textarea
      className={'rv-field' + (forbiddenHits(value).length ? ' hit' : '')}
      style={{ minHeight: min }}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Material({ item, student }: { item: ReviewItem; student: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const mobile = useIsMobile();
  const isPdf = item.source_kind === 'file' && /\.pdf$/i.test(item.file_path || '');
  useEffect(() => {
    if (item.source_kind !== 'file' || !item.file_path) return;
    supabase.storage.from('submissions').createSignedUrl(item.file_path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [item.source_kind, item.file_path]);
  const text = item.source_kind === 'text' ? item.pasted_text : item.fb.material_text;
  const body = useMemo(() => text, [text]);

  return (
    <div style={{ background: 'var(--alt2)', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 14, borderRight: '1px solid var(--b-card)', minWidth: 0 }}>
      <div className="between" style={{ alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t3)' }}>Material do aluno</div>
        {url && <a href={url} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 14 }}>Abrir arquivo ↗</a>}
        {item.source_kind === 'link' && item.link_url && (
          <a href={/^https?:/.test(item.link_url) ? item.link_url : 'https://' + item.link_url} target="_blank" rel="noreferrer" className="link" style={{ fontSize: 14 }}>Abrir link ↗</a>
        )}
      </div>
      {item.note?.trim() && (
        <div style={{ background: '#FFF8E6', border: '1px solid #EAD9AE', borderRadius: 8, padding: '12px 14px', fontSize: 14, lineHeight: 1.45 }}>
          <span style={{ fontWeight: 600 }}>Observação de {student}:</span> {item.note}
        </div>
      )}
      {isPdf && url && mobile ? (
        <a href={url} target="_blank" rel="noreferrer" className="paper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
          <b>{item.file_name || 'Arquivo PDF'}</b>
          <span className="btn btn-primary btn-sm">Abrir PDF</span>
        </a>
      ) : isPdf && url ? (
        <iframe title="Material do aluno" src={url} style={{ width: '100%', flex: 1, minHeight: 720, border: 0, borderRadius: 6, boxShadow: '0 1px 4px rgba(0,0,0,.12)', background: '#fff' }} />
      ) : body ? (
        <div className="paper">
          <div style={{ fontSize: 12, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--t4)', marginBottom: 10 }}>{item.file_name || (item.source_kind === 'link' ? item.link_url : 'Texto colado')}</div>
          {body}
        </div>
      ) : (
        <div className="paper" style={{ color: 'var(--t3)' }}>
          {item.source_kind === 'link'
            ? 'O material está no link enviado pelo aluno. Use "Abrir link ↗" acima.'
            : item.source_kind === 'file'
              ? 'Este formato não abre aqui dentro. Use "Abrir arquivo ↗" acima para baixar e ler.'
              : 'Sem conteúdo.'}
        </div>
      )}
    </div>
  );
}
