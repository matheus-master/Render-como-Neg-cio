import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Inbox, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { useIsMobile } from '../../lib/useIsMobile';
import { forbiddenHits, SLOTS, VERDICTS, type Feedback, type Verdict } from '../../../shared/domain';
import { Chip, ErrorState, VerdictChip, Mark } from '../../components/ui';
import { Logo } from '../../components/StudentLayout';
import { useAuth, useProfile } from '../../lib/auth';
import { useFeatures, useQueue, useReviewItem, type QueueRow, type ReviewItem } from '../../lib/data';
import { firstName, fmtDue, fmtDueRel, fmtLongToday, fmtSent, fmtTime } from '../../lib/format';
import { apiPost, supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { Avatar } from '../../components/Avatar';

const GROUP_COLOR: Record<string, string> = { 'Zorango Tango': '#7A4FD0', 'Octa Performance': '#0E7C66' };

export function StaffLayout() {
  const profile = useProfile();
  const { signOut } = useAuth();
  const q = useQueue();
  const nav = useNavigate();
  const mobile = useIsMobile();
  const pend = (q.data || []).filter((r) => r.status !== 'pronta').length; // com o robô desligado, 'em análise' também espera a equipe
  const items: [string, string, React.ReactNode, number?][] = [
    ['/equipe', 'Painel', <LayoutDashboard size={17} strokeWidth={1.8} aria-hidden key="p" />],
    ['/equipe/fila', 'Fila de revisão', <Inbox size={17} strokeWidth={1.8} aria-hidden key="f" />, pend],
    ['/equipe/agenda', 'Agenda', <CalendarDays size={17} strokeWidth={1.8} aria-hidden key="a" />],
    ['/equipe/config', 'Configurações', <Settings size={17} strokeWidth={1.8} aria-hidden key="c" />],
  ];
  const logout = async () => { await signOut(); nav('/equipe/entrar'); };
  const SHORT: Record<string, string> = { 'Fila de revisão': 'Fila', Configurações: 'Ajustes' };
  const links = items.map(([to, label, icon, badge]) => (
    <NavLink key={to} to={to} end={to === '/equipe'} aria-label={label} className={({ isActive }) => (isActive || (to === '/equipe/fila' && location.pathname.startsWith('/equipe/revisao')) ? 'active' : '')}>
      {icon}
      <span style={{ flex: 1 }}>{mobile ? SHORT[label] ?? label : label}</span>
      {!!badge && <span className="badge">{badge}</span>}
    </NavLink>
  ));
  if (mobile) {
    return (
      <div className="app">
        <header className="mheader">
          <Logo to="/equipe" />
          <button className="btn-out-light" onClick={logout}>Sair</button>
        </header>
        <nav className="sidenav staff-mnav" aria-label="Menu da equipe">{links}</nav>
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}><Outlet /></main>
      </div>
    );
  }
  return (
    <div className="app with-sidebar">
      <aside className="sidebar">
        <div style={{ padding: '4px 10px 0' }}>
          <Logo to="/equipe" />
          <span className="chip" style={{ background: 'var(--ink)', color: 'var(--gold)', marginTop: 10 }}>Equipe</span>
        </div>
        <nav className="sidenav" aria-label="Menu da equipe">
          <div className="sidenav-group">{links}</div>
        </nav>
        <div className="sidebar-user">
          <Avatar path={profile.avatar_path} name={profile.full_name} className="avatar-btn" size={34} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{firstName(profile.full_name)}</div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>Equipe RCN</div>
          </div>
          <button className="rv-x" onClick={logout} aria-label="Sair" title="Sair"><LogOut size={17} aria-hidden /></button>
        </div>
      </aside>
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
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
  const pend = rows.filter((r) => r.status !== 'pronta');
  const lib = rows.filter((r) => r.status === 'pronta').sort((a, b) => (b.fb.released_at || '').localeCompare(a.fb.released_at || ''));
  const pendCount = pend.length;
  const ai = useFeatures().data?.ai ?? false;
  const groups = [...new Set(rows.map((r) => r.student.group_name).filter(Boolean) as string[])].sort();
  const todayDue = pend.filter((r) => fmtDueRel(r.due_at).today).sort((a, b) => a.due_at.localeCompare(b.due_at));
  const list = (tab === 'pend' ? pend : lib).filter((r) => grp === 'Todos' || r.student.group_name === grp);

  return (
    <div className="staff-wrap">
      <div className="between" style={{ alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="h-page">Fila de revisão</h1>
          <div style={{ fontSize: 15, color: 'var(--t3)', marginTop: 6 }}>{fmtLongToday()}</div>
        </div>
        <div className="row card tight" style={{ gap: 16, padding: '14px 20px' }}>
          <div style={{ fontWeight: 600, fontSize: 40, lineHeight: 1, color: 'var(--ac)' }}>{pendCount}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>devolutiva{pendCount === 1 ? '' : 's'} pendente{pendCount === 1 ? '' : 's'}</div>
            {todayDue.length > 0 && (
              <div style={{ fontSize: 14, color: 'var(--warn-t)', fontWeight: 600 }}>
                {todayDue.length} vence{todayDue.length > 1 ? 'm' : ''} hoje{todayDue.length === 1 ? ` às ${fmtTime(todayDue[0]!.due_at)}` : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="seg sm">
          <button className={tab === 'pend' ? 'on' : ''} onClick={() => setTab('pend')}>Pendentes · {pendCount}</button>
          <button className={tab === 'lib' ? 'on' : ''} onClick={() => setTab('lib')}>Liberadas</button>
        </div>
        <div style={{ width: 1, height: 24, background: '#D3D6DB', margin: '0 4px' }} />
        {['Todos', ...groups].map((g) => (
          <button key={g} className={'pill' + (grp === g ? ' on' : '')} onClick={() => setGrp(g)}>
            {g === 'Todos' ? 'Todos os grupos' : g}
          </button>
        ))}
      </div>

      {q.isError ? (
        <ErrorState onRetry={q.refetch} />
      ) : (
        <div className="card" style={{ padding: 0, borderRadius: 10, overflowX: 'auto' }}>
          <div className="fila-table" style={{ fontSize: 15 }}>
            <div className="fila-grid fila-head">
              <div>Aluno</div>
              <div>Grupo</div>
              <div>Tipo</div>
              <div>Enviado · prazo</div>
              <div>Status</div>
              <div />
            </div>
            {q.isLoading &&
              [0, 1, 2].map((i) => (
                <div key={i} className="fila-grid">
                  <div className="skel" style={{ height: 36 }} />
                  <div className="skel light" style={{ height: 14 }} />
                  <div className="skel light" style={{ height: 14 }} />
                  <div className="skel light" style={{ height: 14 }} />
                  <div className="skel light" style={{ height: 14 }} />
                  <div />
                </div>
              ))}
            {list.map((r) => {
              const k = kindOf(r);
              const due = fmtDueRel(r.due_at);
              const open = () => nav(`/equipe/revisao/${r.id}`);
              return (
                <div key={r.id} className="fila-grid">
                  <div className="row" style={{ minWidth: 0 }}>
                    <Avatar path={r.student.avatar_path} name={r.student.full_name} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{r.student.full_name}</div>
                      <div style={{ fontSize: 13, color: 'var(--t3)' }}>{r.student.studio || 'Studio não informado'}</div>
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8, fontSize: 14 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: GROUP_COLOR[r.student.group_name || ''] || '#AEB3BC', flex: 'none' }} />
                    {r.student.group_name || '—'}
                  </div>
                  <div>
                    {SLOTS[r.slot].tipo} <span className="muted">· v{r.version}</span>
                  </div>
                  <div>
                    <div>{fmtSent(r.created_at)}</div>
                    {k === 'lib' ? (
                      <div style={{ fontSize: 13, color: 'var(--t3)' }}>liberada por {firstName(r.fb.reviewer?.full_name || '') || 'equipe'}</div>
                    ) : (
                      <div style={{ fontSize: 13, color: due.today ? 'var(--warn-t)' : 'var(--t3)', fontWeight: due.today ? 600 : 400 }}>{due.text}</div>
                    )}
                  </div>
                  <div>
                    {k === 'lib' ? (
                      <VerdictChip v={r.fb.verdict!} />
                    ) : k === 'draft' ? (
                      <Chip tone="ink">Rascunho · {firstName(r.fb.saver?.full_name || '')}</Chip>
                    ) : k === 'wait' ? (
                      <Chip tone="soft">Aguardando revisão</Chip>
                    ) : (
                      ai ? <Chip live style={{ border: 0, paddingLeft: 0 }}>Análise em andamento</Chip> : <Chip tone="soft">Aguardando a equipe</Chip>
                    )}
                  </div>
                  <div>
                    {k === 'draft' && <button className="btn btn-primary btn-sm btn-block" onClick={open}>Continuar</button>}
                    {k === 'wait' && <button className="btn btn-outline btn-sm btn-block" onClick={open}>Revisar</button>}
                    {k === 'lib' && <button className="btn btn-outline btn-sm btn-block" onClick={open}>Ver</button>}
                    {k === 'run' && <button className={'btn btn-sm btn-block ' + (ai ? 'btn-secondary' : 'btn-outline')} onClick={open}>{ai ? 'Abrir' : 'Escrever'}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!q.isLoading && !q.isError && list.length === 0 && (
        <div className="dashed" style={{ borderRadius: 10, padding: 28, fontSize: 15, color: 'var(--t3)' }}>
          {tab === 'pend' && grp === 'Todos' ? 'Tudo em dia. Nenhuma devolutiva esperando revisão.' : 'Nada por aqui com esse filtro.'}
        </div>
      )}
      <div style={{ fontSize: 14, color: 'var(--t3)' }}>Ordenado por prazo: o que vence primeiro fica no topo.</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// B. Revisão da devolutiva
// ---------------------------------------------------------------------
interface Draft {
  verdict: Verdict | null;
  sum: string;
  strong: string[];
  pts: { t: string; d: string; s: string }[];
  steps: string; // um por linha
}
const EMPTY: Draft = { verdict: null, sum: '', strong: [''], pts: [], steps: '' };
const toDraft = (f: Feedback | null): Draft => (f ? { verdict: f.verdict, sum: f.sum, strong: [...f.strong], pts: f.pts.map((p) => ({ ...p })), steps: f.steps.join('\n') } : EMPTY);
const toFeedback = (d: Draft): Feedback => ({
  verdict: d.verdict || 'aj',
  sum: d.sum.trim(),
  strong: d.strong.map((x) => x.trim()).filter(Boolean),
  pts: d.pts.filter((p) => p.t.trim()).map((p) => ({ t: p.t.trim(), d: p.d.trim(), s: p.s.trim() })),
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

  // O rascunho da IA chegou enquanto a tela estava aberta.
  useEffect(() => {
    if (item.fb.draft && !scratch && draft === EMPTY) setDraft(toDraft(item.fb.draft));
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

  const fbNow = toFeedback(draft);
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
    if (!draft.sum.trim()) return toast('Escreva o resumo antes de liberar.');
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
  const manual = !ai && !hasDraft && !released; // robô desligado: a equipe escreve a devolutiva

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

            {manual ? (
              <div className="card stack" style={{ gap: 12, padding: 24 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>Escreva a devolutiva</div>
                <div style={{ fontSize: 15, color: 'var(--t2)', lineHeight: 1.45 }}>
                  A análise automática está desligada, então o rascunho não vem pronto. Leia o material ao lado e escreva a devolutiva: veredito, resumo, pontos a ajustar e próximos passos.
                </div>
                <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => { setScratch(true); setDraft(EMPTY); }}>Escrever devolutiva</button>
              </div>
            ) : generating ? (
              <div className="card stack" style={{ alignItems: 'center', gap: 12, padding: '40px 20px', textAlign: 'center' }}>
                <div className="spinner" />
                <div style={{ fontWeight: 600, fontSize: 16 }}>Gerando o rascunho da devolutiva…</div>
                <div style={{ fontSize: 15, color: 'var(--t3)' }}>Leva de 2 a 5 minutos. Você já pode ler o material ao lado.</div>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => { setScratch(true); setDraft(EMPTY); }}>
                  Não esperar: escrever do zero
                </button>
              </div>
            ) : failed ? (
              <div className="card stack" style={{ gap: 12, padding: 24 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>Não foi possível gerar o rascunho</div>
                <div style={{ fontSize: 15, color: 'var(--t2)', lineHeight: 1.45 }}>{item.fb.ai_error || 'A análise falhou.'}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" onClick={() => { setScratch(true); setDraft(EMPTY); }}>Escrever do zero</button>
                  <button className="btn btn-secondary" onClick={regenerate}>Gerar de novo</button>
                </div>
              </div>
            ) : (
              <fieldset disabled={released} style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
                <div className="stack" style={{ gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>Veredito</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    {(['ok', 'aj', 're'] as const).map((k) => {
                      const x = VERDICTS[k], on = draft.verdict === k;
                      return (
                        <button key={k} aria-pressed={on} onClick={() => upd((d) => { d.verdict = k; })} style={{ height: 48, borderRadius: 8, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 15, background: on ? x.bg : '#fff', color: on ? x.fg : 'var(--t2)', border: on ? '2px solid ' + x.strong : '1px solid var(--b-input)' }}>
                          <span><Mark m={x.mark} size={18} /></span>
                          {x.label}
                        </button>
                      );
                    })}
                  </div>
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
                    <button className="add" onClick={() => upd((d) => { d.pts.push({ t: '', d: '', s: '' }); })}>+ Adicionar ponto</button>
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
                      <Field value={p.d} min={56} placeholder="O que foi observado no material" onChange={(val) => upd((d) => { d.pts[i]!.d = val; })} />
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ac)' }}>Sugestão ao aluno</div>
                      <Field value={p.s} min={56} placeholder="sugiro…" onChange={(val) => upd((d) => { d.pts[i]!.s = val; })} />
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

          {!released && hasDraft && (
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
                  {busy ? 'Liberando…' : 'Aprovar e liberar'}
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
