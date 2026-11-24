import { useQueryClient, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, FileText, Search, Siren, Users, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SLOT_ORDER, SLOTS } from '../../../shared/domain';
import { BackLink, Chip, ErrorState, Mark, PageHead, VerdictChip } from '../../components/ui';
import { fmtBRL, fmtDay, fmtLongToday, fmtPeriod, initials } from '../../lib/format';
import { daysSince, LATE_DAYS, progressOf, useStaffOverview, type Overview, type StaffStudent } from '../../lib/staffData';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { Avatar } from '../../components/Avatar';
import { InstagramAntesDepois, instagramOf } from '../../components/InstagramAntesDepois';

const STATUS_LABEL: Record<StaffStudent['status'], string> = { ativo: 'Ativo', onboarding: 'Aguardando onboarding', pausado: 'Pausado/Inativo', encerrado: 'Mentoria encerrada' };

const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const plusMonths = (from: string, n: number) => { const d = new Date(from + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
/** Dias até o fim do acesso (negativo = já venceu); null = sem prazo. */
export const accessLeft = (s: { access_until: string | null }) =>
  s.access_until ? Math.round((new Date(s.access_until + 'T12:00:00Z').getTime() - new Date(todayISO() + 'T12:00:00Z').getTime()) / 86_400_000) : null;
const GROUP_COLOR: Record<string, string> = { 'Zorango Tango': '#7A4FD0', 'Octa Performance': '#0E7C66' };

/** Último relatório de cada aluno e se está atrasado (> 16 dias, contando da entrada se nunca enviou). */
function reportInfo(o: Overview, s: StaffStudent) {
  const last = o.reports.find((r) => r.student_id === s.id);
  const days = daysSince(last ? last.created_at : s.created_at);
  return { last, days, late: s.status === 'ativo' && (days ?? 0) > LATE_DAYS };
}
const pendingDocs = (o: Overview, id: string) => {
  const seen = new Set<string>();
  let n = 0;
  for (const s of o.subs) {
    if (s.student_id !== id || seen.has(s.slot)) continue;
    seen.add(s.slot);
    if (s.status !== 'pronta') n++;
  }
  return n;
};

// ---------------------------------------------------------------------
// Painel
// ---------------------------------------------------------------------
export function Painel() {
  const q = useStaffOverview();
  const nav = useNavigate();
  const [search, setSearch] = useState('');
  const [grp, setGrp] = useState('Todos');
  const [status, setStatus] = useState<'todos' | StaffStudent['status']>('ativo');
  const [onlyLate, setOnlyLate] = useState(false);

  if (q.isLoading) return <div className="page"><div className="skel" style={{ height: 120 }} /><div className="skel-card" style={{ height: 420 }} /></div>;
  if (q.isError || !q.data) return <div className="page"><ErrorState onRetry={q.refetch} /></div>;
  const o = q.data;

  const rows = o.students.map((s) => ({ s, rep: reportInfo(o, s), prog: progressOf(o, s.id), docs: pendingDocs(o, s.id) }));
  const ativos = rows.filter((r) => r.s.status === 'ativo');
  const late = rows.filter((r) => r.rep.late);
  const toReview = o.subs.filter((s) => s.status !== 'pronta').length;  // em análise (robô desligado) também precisa da equipe
  const since15 = Date.now() - 15 * 86400000;
  const recent = o.reports.filter((r) => new Date(r.created_at).getTime() >= since15);
  const byGroup = new Map<string, number>();
  for (const r of recent) {
    const g = o.students.find((s) => s.id === r.student_id)?.group_name || 'Sem grupo';
    byGroup.set(g, (byGroup.get(g) || 0) + r.revenue);
  }
  const redOpen = o.red.filter((r) => r.staff_status !== 'realizado');
  const groups = ['Todos', ...new Set(o.students.map((s) => s.group_name).filter(Boolean) as string[])];
  const filtered = rows.filter(
    (r) =>
      (grp === 'Todos' || r.s.group_name === grp) &&
      (status === 'todos' || r.s.status === status) &&
      (!onlyLate || r.rep.late) &&
      (!search.trim() || `${r.s.full_name} ${r.s.studio} ${r.s.email}`.toLowerCase().includes(search.trim().toLowerCase())),
  );

  // Atividade recente: relatórios, envios, Botão Vermelho e tarefas concluídas.
  const name = (id: string) => o.students.find((s) => s.id === id)?.full_name || 'Aluno';
  const events = [
    ...o.reports.map((r) => ({ at: r.created_at, id: r.student_id, text: `enviou o relatório ${fmtPeriod(r.period_start, r.period_end)}`, icon: 'rel' })),
    ...o.subs.map((s) => ({ at: s.created_at, id: s.student_id, text: `enviou ${SLOTS[s.slot].title} · v${s.version}`, icon: 'doc' })),
    ...o.red.map((r) => ({ at: r.used_at, id: r.student_id, text: 'acionou o Botão Vermelho', icon: 'red' })),
    ...o.comps.filter((c) => c.status === 'feita').map((c) => ({ at: c.updated_at, id: c.student_id, text: `concluiu "${o.tasks.find((t) => t.id === c.task_id)?.title || 'tarefa'}"`, icon: 'task' })),
  ]
    .filter((e) => o.students.some((s) => s.id === e.id))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);

  const kpis: [React.ReactNode, string, string, string | null][] = [
    [<Users size={18} key="u" />, 'Alunos ativos', String(ativos.length), `${o.students.length} no total`],
    [<AlertTriangle size={18} key="a" />, 'Relatórios atrasados', String(late.length), `mais de ${LATE_DAYS} dias sem relatório`],
    [<FileText size={18} key="f" />, 'Devolutivas para revisar', String(toReview), 'em análise ou aguardando revisão'],
    [<Wallet size={18} key="w" />, 'Faturamento (15 dias)', fmtBRL(recent.reduce((a, r) => a + r.revenue, 0)), [...byGroup].map(([g, v]) => `${g}: ${fmtBRL(v)}`).join(' · ') || 'nenhum relatório'],
  ];

  return (
    <div className="page">
      <PageHead title="Painel" sub={fmtLongToday()} />
      <div className="kpi-grid">
        {kpis.map(([icon, label, value, sub], i) => (
          <button key={label} className="card kpi" onClick={() => (i === 1 ? setOnlyLate(true) : i === 2 ? nav('/equipe/fila') : undefined)}>
            <div className="row" style={{ gap: 8, color: i === 1 && late.length ? 'var(--err)' : 'var(--t3)' }}>
              {icon}
              <span className="label" style={{ color: 'inherit' }}>{label}</span>
            </div>
            <div className="evo-num" style={{ fontSize: 32, marginTop: 10 }}>{value}</div>
            {sub && <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>{sub}</div>}
          </button>
        ))}
      </div>

      {redOpen.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--err)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row" style={{ gap: 8, color: 'var(--err)' }}>
            <Siren size={18} aria-hidden />
            <span className="h-card" style={{ color: 'var(--err-t)' }}>Botão Vermelho acionado</span>
          </div>
          {redOpen.map((r) => (
            <Link key={r.student_id} to={`/equipe/aluno/${r.student_id}?aba=sessoes`} className="between" style={{ alignItems: 'center', color: 'inherit', padding: '6px 0', borderTop: '1px solid var(--b-div)' }}>
              <span style={{ fontSize: 14 }}>
                <b>{name(r.student_id)}</b> · {fmtDay(r.used_at)} {r.reason ? `· "${r.reason.slice(0, 90)}${r.reason.length > 90 ? '…' : ''}"` : ''}
              </span>
              <Chip tone={r.staff_status === 'agendado' ? 'soft' : 'err'}>{r.staff_status}</Chip>
            </Link>
          ))}
        </div>
      )}

      <div className="painel-split">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="row" style={{ padding: '14px 16px', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
            <div style={{ position: 'relative', flex: '1 1 220px' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--t4)' }} aria-hidden />
              <input className="input md" style={{ paddingLeft: 36, height: 40 }} placeholder="Buscar aluno, studio ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="input md" style={{ height: 40, width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Situação">
              <option value="ativo">Ativos</option>
              <option value="onboarding">Aguardando onboarding</option>
              <option value="pausado">Pausados/Inativos</option>
              <option value="todos">Todas as situações</option>
            </select>
            <button className={'pill' + (onlyLate ? ' on' : '')} onClick={() => setOnlyLate(!onlyLate)}>Só atrasados</button>
          </div>
          <div className="row" style={{ padding: '10px 16px', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--line)' }}>
            {groups.map((g) => (
              <button key={g} className={'pill' + (grp === g ? ' on' : '')} onClick={() => setGrp(g)}>{g === 'Todos' ? 'Todos os grupos' : g}</button>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 820 }}>
              <div className="stu-row stu-head">
                <div>Aluno</div>
                <div>Nível</div>
                <div>Último relatório</div>
                <div>Docs</div>
                <div>Último faturamento</div>
              </div>
              {filtered.map(({ s, rep, prog, docs }) => (
                <Link key={s.id} to={`/equipe/aluno/${s.id}`} className="stu-row">
                  <div className="row" style={{ minWidth: 0 }}>
                    <Avatar path={s.avatar_path} name={s.full_name} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</div>
                      <div className="row" style={{ gap: 6, fontSize: 12, color: 'var(--t3)' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: GROUP_COLOR[s.group_name || ''] || 'var(--t4)', flex: 'none' }} />
                        {s.group_name || 'Sem grupo'}
                        {s.status !== 'ativo' && <span>· {STATUS_LABEL[s.status]}</span>}
                        {s.status !== 'encerrado' && accessLeft(s) !== null && accessLeft(s)! <= 15 && (
                          <span style={{ color: accessLeft(s)! < 0 ? 'var(--err-t)' : 'var(--warn-t)', fontWeight: 600 }}>
                            · {accessLeft(s)! < 0 ? 'acesso vencido' : accessLeft(s) === 0 ? 'acesso vence hoje' : `acesso vence em ${accessLeft(s)} d`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{prog.current?.name}</div>
                    <div className="track" style={{ marginTop: 6, maxWidth: 120 }}><i style={{ width: prog.pct + '%' }} /></div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--t3)', marginTop: 3 }}>{prog.pct}% · {prog.xpTotal} XP</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 14 }}>{rep.last ? fmtPeriod(rep.last.period_start, rep.last.period_end) : 'Nenhum'}</div>
                    <div style={{ fontSize: 12, color: rep.late ? 'var(--err-t)' : 'var(--t3)', fontWeight: rep.late ? 600 : 400 }}>
                      {rep.late ? `atrasado · ${rep.days} dias` : rep.last ? `há ${rep.days} dias` : `entrou há ${rep.days} dias`}
                    </div>
                  </div>
                  <div>{docs > 0 ? <Chip tone="soft">{docs} pendente{docs > 1 ? 's' : ''}</Chip> : <span style={{ fontSize: 13, color: 'var(--t4)' }}>—</span>}</div>
                  <div className="evo-num" style={{ fontSize: 16, marginTop: 0 }}>{rep.last ? fmtBRL(rep.last.revenue) : '—'}</div>
                </Link>
              ))}
              {filtered.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: 'var(--t3)', fontSize: 14 }}>Nenhum aluno com esses filtros.</div>}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '18px 18px 8px' }}>
          <div className="h-card" style={{ marginBottom: 10 }}>Atividade recente</div>
          {events.length === 0 && <div style={{ fontSize: 14, color: 'var(--t3)', padding: '12px 0' }}>Nada ainda.</div>}
          {events.map((e, i) => (
            <Link key={i} to={`/equipe/aluno/${e.id}`} className="act-item">
              <span className={'act-ico ' + e.icon}>
                {e.icon === 'red' ? <Siren size={14} /> : e.icon === 'doc' ? <FileText size={14} /> : e.icon === 'task' ? <Mark m="✓" size={13} /> : <Mark m="→" size={13} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.4 }}>
                <b>{name(e.id).split(' ')[0]}</b> {e.text}
                <span className="mono" style={{ display: 'block', fontSize: 11, color: 'var(--t3)', marginTop: 1 }}>{fmtDay(e.at)}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Ficha do aluno
// ---------------------------------------------------------------------
type Tab = 'resumo' | 'relatorios' | 'documentos' | 'gamificacao' | 'instagram' | 'sessoes';
const TABS: [Tab, string][] = [['resumo', 'Resumo'], ['relatorios', 'Relatórios'], ['documentos', 'Documentos'], ['gamificacao', 'Gamificação'], ['instagram', 'Instagram'], ['sessoes', 'Sessões']];

export function AlunoFicha() {
  const { id } = useParams();
  const q = useStaffOverview();
  const qc = useQueryClient();
  const toast = useToast();
  const initialTab = (new URLSearchParams(window.location.search).get('aba') as Tab) || 'resumo';
  const [tab, setTab] = useState<Tab>(initialTab);
  const groups = useGroups();

  if (q.isLoading) return <div className="page"><div className="skel-card" style={{ height: 500 }} /></div>;
  if (q.isError || !q.data) return <div className="page"><ErrorState onRetry={q.refetch} /></div>;
  const o = q.data;
  const s = o.students.find((x) => x.id === id);
  if (!s) return <div className="page"><BackLink to="/equipe">Painel</BackLink><div className="dashed">Aluno não encontrado.</div></div>;
  const prog = progressOf(o, s.id);
  const reps = o.reports.filter((r) => r.student_id === s.id);
  const subs = o.subs.filter((x) => x.student_id === s.id);
  const red = o.red.find((r) => r.student_id === s.id);
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff-overview'] });

  const updateProfile = async (patch: Partial<StaffStudent>) => {
    const { error } = await supabase.from('profiles').update(patch).eq('id', s.id);
    if (error) return toast('Não deu para salvar.');
    toast('Salvo.');
    refresh();
  };

  return (
    <div className="page">
      <BackLink to="/equipe">Painel</BackLink>
      <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: -8 }}>
        <Avatar path={s.avatar_path} name={s.full_name} className="avatar-btn" size={52} style={{ fontSize: 16 }} />
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div className="h-flow" style={{ fontSize: 24 }}>{s.full_name}</div>
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 2 }}>
            {[s.studio, s.city, s.email, s.whatsapp].filter(Boolean).join(' · ')}
            {instagramOf(s.instagram) && (
              <>
                {' · '}
                <a className="link" href={instagramOf(s.instagram)!.url} target="_blank" rel="noreferrer">@{instagramOf(s.instagram)!.handle} ↗</a>
              </>
            )}
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>desde {fmtDay(s.created_at, false)}</div>
        </div>
        <label className="field" style={{ minWidth: 170 }}>
          <span>Grupo</span>
          <select className="input md" style={{ height: 40 }} value={s.group_name || ''} onChange={(e) => updateProfile({ group_name: e.target.value || null })}>
            {!s.group_name && <option value="">Sem grupo</option>}
            {[...new Set([...(groups.data || []).map((x) => x.name), s.group_name || ''])].filter(Boolean).map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 200 }}>
          <span>Situação</span>
          <select className="input md" style={{ height: 40 }} value={s.status} onChange={(e) => updateProfile({ status: e.target.value as StaffStudent['status'] })}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <AccessField s={s} onSave={updateProfile} />
      </div>

      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--line)' }} role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ padding: '11px 14px', fontSize: 14, fontWeight: tab === k ? 600 : 500, whiteSpace: 'nowrap', color: tab === k ? 'var(--t)' : 'var(--t3)', borderBottom: tab === k ? '2px solid var(--ink)' : '2px solid transparent', marginBottom: -1 }}>
            {label}
            {k === 'relatorios' && reps.length > 0 && <span className="mono" style={{ marginLeft: 6, fontSize: 11, color: 'var(--t3)' }}>{reps.length}</span>}
          </button>
        ))}
      </div>

      {tab === 'resumo' && (
        <>
          <div className="hero" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="label">Nível {prog.current?.n} de {o.levels.length}{prog.current?.goal ? ` · Meta ${prog.current.goal}` : ''}</div>
            <div style={{ fontWeight: 600, fontSize: 30, letterSpacing: '-.03em' }}>{prog.current?.name}</div>
            <div className="track" style={{ height: 6 }}><i style={{ width: prog.pct + '%' }} /></div>
            <div className="hero-sub mono" style={{ fontSize: 12 }}>{prog.xpLevel}/{prog.xpMax} XP neste nível · {prog.xpTotal} XP no total</div>
          </div>
          <div className="kpi-grid">
            {[
              ['Relatórios', String(reps.length)],
              ['Faturamento total', fmtBRL(reps.reduce((a, r) => a + r.revenue, 0))],
              ['Reuniões feitas', String(reps.reduce((a, r) => a + r.meetings, 0))],
              ['Projetos fechados', String(reps.reduce((a, r) => a + r.closed, 0))],
            ].map(([l, v]) => (
              <div key={l} className="card"><div className="label">{l}</div><div className="evo-num" style={{ fontSize: 26, marginTop: 6 }}>{v}</div></div>
            ))}
          </div>
          {reps[0] && (
            <div className="card">
              <div className="label">Último relatório · {fmtPeriod(reps[0].period_start, reps[0].period_end)}</div>
              <div style={{ fontSize: 15, lineHeight: 1.5, marginTop: 8 }}>
                {reps[0].executed ? <><b>Conquista:</b> {reps[0].wins || '—'}<br /><b>Desafio:</b> {reps[0].struggles || '—'}</> : <><b>Não executou.</b> {reps[0].blocker}</>}
              </div>
              <button className="link" style={{ marginTop: 10 }} onClick={() => setTab('relatorios')}>Ver e comentar <ArrowRight size={14} /></button>
            </div>
          )}
        </>
      )}

      {tab === 'relatorios' && (
        reps.length === 0 ? <div className="dashed">Nenhum relatório enviado.</div> : <div className="stack" style={{ gap: 12 }}>{reps.map((r) => <ReportCard key={r.id} r={r} onSaved={refresh} />)}</div>
      )}

      {tab === 'documentos' && (
        <div className="grid-320">
          {SLOT_ORDER.map((slot) => {
            const vs = subs.filter((x) => x.slot === slot);
            return (
              <div key={slot} className="card" style={{ padding: '16px 16px 6px' }}>
                <div className="h-card" style={{ marginBottom: 6 }}>{SLOTS[slot].title}</div>
                {vs.length === 0 && <div style={{ fontSize: 14, color: 'var(--t3)', padding: '8px 0 12px' }}>Ainda não enviado.</div>}
                {vs.map((v) => (
                  <Link key={v.id} to={`/equipe/revisao/${v.id}`} className="between divrow" style={{ alignItems: 'center', padding: '10px 0', color: 'inherit' }}>
                    <span style={{ fontSize: 14 }}><b>Versão {v.version}</b> <span className="muted">· {fmtDay(v.created_at)}</span></span>
                    {v.status === 'pronta' && v.fb?.verdict ? <VerdictChip v={v.fb.verdict} /> : v.status === 'revisao' ? <Chip tone="soft">Aguardando revisão</Chip> : <Chip live>Em análise</Chip>}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'gamificacao' && <StaffGami o={o} studentId={s.id} onChanged={refresh} />}

      {tab === 'instagram' && <InstagramAntesDepois studentId={s.id} instagram={s.instagram} team />}

      {tab === 'sessoes' && <StaffSessions red={red} studentName={s.full_name} onSaved={refresh} />}
    </div>
  );
}

function ReportCard({ r, onSaved }: { r: Overview['reports'][number]; onSaved: () => void }) {
  const toast = useToast();
  const [comment, setComment] = useState(r.staff_comment || '');
  const [open, setOpen] = useState(!r.staff_comment);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from('reports').update({ staff_comment: comment }).eq('id', r.id);
    setBusy(false);
    if (error) return toast('O comentário não foi salvo.');
    toast('Comentário salvo. O aluno já vê no portal.');
    onSaved();
  };
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <div className="h-card">{fmtPeriod(r.period_start, r.period_end)}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>enviado {fmtDay(r.created_at)}</div>
        </div>
        <div className="evo-num" style={{ fontSize: 20, marginTop: 0 }}>{fmtBRL(r.revenue)}</div>
      </div>
      <div className="mono" style={{ fontSize: 12, color: 'var(--t2)' }}>
        {r.leads} leads · {r.contacts} contatos · {r.responses} respostas · {r.appointments} agend. · {r.meetings} reuniões · {r.proposals} propostas · {r.closed} fechados
      </div>
      {r.executed ? (
        <div style={{ fontSize: 14, lineHeight: 1.55, display: 'grid', gap: 6 }}>
          {r.actions && <div><span className="label">Ações</span><br />{r.actions}</div>}
          <div><span className="label">Conquistas</span><br />{r.wins || '—'}</div>
          <div><span className="label">Desafios</span><br />{r.struggles || '—'}</div>
        </div>
      ) : (
        <div style={{ fontSize: 14, lineHeight: 1.55, display: 'grid', gap: 6, background: 'var(--warn-bg)', padding: 12, borderRadius: 8 }}>
          <div><span className="label">Não executou · o que impediu</span><br />{r.blocker || '—'}</div>
          <div><span className="label">O que precisa</span><br />{r.needs || '—'}</div>
        </div>
      )}
      {r.next_focus && <div style={{ fontSize: 14 }}><span className="label">Combinado</span><br />{r.next_focus}</div>}
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        {open ? (
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">Feedback da equipe RCN</span>
            <textarea className="textarea" placeholder="Escreva um comentário para o aluno sobre esta quinzena." value={comment} onChange={(e) => setComment(e.target.value)} />
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              {r.staff_comment && <button className="btn btn-secondary btn-sm" onClick={() => { setComment(r.staff_comment || ''); setOpen(false); }}>Cancelar</button>}
              <button className="btn btn-primary btn-sm" disabled={busy || comment.trim() === (r.staff_comment || '')} onClick={save}>{busy ? 'Salvando…' : 'Salvar comentário'}</button>
            </div>
          </div>
        ) : (
          <div className="between" style={{ alignItems: 'flex-start', gap: 12 }}>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
              <span className="label">Feedback da equipe{r.staff_comment_at ? ` · ${fmtDay(r.staff_comment_at, false)}` : ''}</span>
              <div style={{ marginTop: 4 }}>{r.staff_comment}</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>Editar</button>
          </div>
        )}
      </div>
    </div>
  );
}

function StaffGami({ o, studentId, onChanged }: { o: Overview; studentId: string; onChanged: () => void }) {
  const prog = progressOf(o, studentId);
  const [lvl, setLvl] = useState(prog.current?.n ?? 1);
  const toast = useToast();
  const tasks = [...o.tasks.filter((t) => t.level === lvl && !t.bonus), ...o.tasks.filter((t) => t.level === lvl && t.bonus)];
  const set = async (taskId: number, status: 'pendente' | 'feita' | 'andamento') => {
    const r = status === 'pendente'
      ? await supabase.from('task_completions').delete().eq('student_id', studentId).eq('task_id', taskId)
      : await supabase.from('task_completions').upsert({ student_id: studentId, task_id: taskId, status, updated_at: new Date().toISOString() });
    if (r.error) return toast('Não deu para salvar.');
    onChanged();
  };
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', borderBottom: '1px solid var(--line)', padding: '0 12px' }}>
        {o.levels.map((l) => {
          const main = o.tasks.filter((t) => t.level === l.n && !t.bonus);
          const done = main.filter(prog.isDone).length;
          return (
            <button key={l.n} onClick={() => setLvl(l.n)} style={{ padding: '12px 10px', fontSize: 13, whiteSpace: 'nowrap', fontWeight: lvl === l.n ? 600 : 500, color: lvl === l.n ? 'var(--t)' : 'var(--t3)', borderBottom: lvl === l.n ? '2px solid var(--ink)' : '2px solid transparent' }}>
              {l.n}. {l.name} <span className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>{done}/{main.length}</span>
              {l.n === prog.current?.n ? ' ★' : ''}
            </button>
          );
        })}
      </div>
      <div style={{ padding: '4px 16px 8px' }}>
        {tasks.map((t, i) => {
          const st = prog.statusOf(t);
          const header = t.bonus && (i === 0 || !tasks[i - 1]!.bonus);
          return (
            <div key={t.id}>
              {header && <div className="label" style={{ padding: '14px 0 4px' }}>Missões bônus</div>}
              <div className="row" style={{ padding: '10px 0', borderTop: '1px solid var(--b-div)' }}>
                <div className="mono" style={{ width: 20, fontSize: 12, color: 'var(--t4)' }}>{t.position}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, textDecoration: st === 'feita' ? 'line-through' : 'none', color: st === 'feita' ? 'var(--t3)' : 'var(--t)' }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--t3)' }}>{t.description} · {t.category} · +{t.xp} XP</div>
                </div>
                {t.auto_slot ? (
                  <Chip tone={st === 'feita' ? 'ok' : 'none'}>{st === 'feita' ? 'Pela devolutiva' : 'Automática'}</Chip>
                ) : (
                  <select className="input md" style={{ height: 34, width: 'auto', fontSize: 13 }} value={st} onChange={(e) => set(t.id, e.target.value as 'pendente')} aria-label={`Situação de ${t.title}`}>
                    <option value="pendente">Pendente</option>
                    <option value="andamento">Em andamento</option>
                    <option value="feita">Concluída</option>
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StaffSessions({ red, studentName, onSaved }: { red: Overview['red'][number] | undefined; studentName: string; onSaved: () => void }) {
  const toast = useToast();
  const [st, setSt] = useState(red?.staff_status || 'solicitado');
  const [notes, setNotes] = useState(red?.staff_notes || '');
  if (!red) return <div className="dashed">{studentName.split(' ')[0]} ainda não acionou o Botão Vermelho.</div>;
  const save = async () => {
    const { error } = await supabase.from('red_button').update({ staff_status: st, staff_notes: notes }).eq('student_id', red.student_id);
    if (error) return toast('Não deu para salvar.');
    toast('Sessão atualizada.');
    onSaved();
  };
  return (
    <div className="card stack" style={{ gap: 12, borderColor: 'var(--err)' }}>
      <div className="row" style={{ gap: 8, color: 'var(--err)' }}><Siren size={18} /><span className="h-card" style={{ color: 'var(--err-t)' }}>Botão Vermelho</span></div>
      <div style={{ fontSize: 14, color: 'var(--t3)' }}>Acionado {fmtDay(red.used_at)}</div>
      <div style={{ fontSize: 15, lineHeight: 1.5, background: 'var(--alt)', padding: 12, borderRadius: 8 }}>
        <span className="label">Motivo informado</span><br />{red.reason || 'Sem motivo informado.'}
      </div>
      <label className="field" style={{ maxWidth: 260 }}>
        <span>Situação</span>
        <select className="input md" value={st} onChange={(e) => setSt(e.target.value as typeof st)}>
          <option value="solicitado">Solicitado</option>
          <option value="agendado">Agendado</option>
          <option value="realizado">Realizado</option>
        </select>
      </label>
      <label className="field">
        <span>Anotações da equipe</span>
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Data combinada, o que foi conversado…" />
      </label>
      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={save}>Salvar</button>
    </div>
  );
}

// ---------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------
/** Plano e prazo de acesso do aluno, com atalhos para renovar. */
function AccessField({ s, onSave }: { s: StaffStudent; onSave: (p: Partial<StaffStudent>) => void }) {
  const left = accessLeft(s);
  const base = s.access_until && left !== null && left >= 0 ? s.access_until : todayISO();
  return (
    <div className="field" style={{ minWidth: 230 }}>
      <span>
        Acesso até{' '}
        {left !== null && (
          <b style={{ fontWeight: 600, color: left < 0 ? 'var(--err-t)' : left <= 15 ? 'var(--warn-t)' : 'var(--ok-t)' }}>
            · {left < 0 ? `venceu há ${-left} d` : left === 0 ? 'vence hoje' : `faltam ${left} d`}
          </b>
        )}
      </span>
      <div className="row" style={{ gap: 6 }}>
        <input className="input md" type="date" style={{ height: 40, flex: 1, minWidth: 0, padding: '0 8px' }} value={s.access_until || ''} onChange={(e) => onSave({ access_until: e.target.value || null })} />
        <select className="input md" style={{ height: 40, width: 'auto', padding: '0 6px' }} value="" aria-label="Renovar acesso" onChange={(e) => { const n = Number(e.target.value); if (n) onSave({ access_until: plusMonths(base, n), plan: n === 12 ? '1 ano' : `${n} meses`, status: s.status === 'encerrado' ? 'ativo' : s.status }); }}>
          <option value="">Renovar…</option>
          <option value="3">+3 meses</option>
          <option value="6">+6 meses</option>
          <option value="12">+1 ano</option>
        </select>
      </div>
      <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--t3)' }}>
        {s.plan ? `Plano: ${s.plan}. ` : ''}Sem data = acesso sem prazo. Depois do prazo o aluno continua vendo tudo, mas não envia material novo.
      </span>
    </div>
  );
}

/** Grupos com a contagem de alunos. */
function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const [g, p] = await Promise.all([
        supabase.from('groups').select('name, color').order('name'),
        supabase.from('profiles').select('group_name').eq('role', 'aluno'),
      ]);
      const count = (n: string) => (p.data || []).filter((x) => x.group_name === n).length;
      return ((g.data || []) as { name: string; color: string }[]).map((x) => ({ ...x, count: count(x.name) }));
    },
  });
}

export function Configuracoes() {
  const qc = useQueryClient();
  const toast = useToast();
  const codes = useQuery({ queryKey: ['class_codes'], queryFn: async () => (await supabase.from('class_codes').select('*').order('created_at')).data as { code: string; group_name: string; active: boolean }[] });
  const settings = useQuery({ queryKey: ['settings-all'], queryFn: async () => Object.fromEntries(((await supabase.from('settings').select('key, value')).data || []).map((r) => [r.key, r.value])) as Record<string, string> });
  const staff = useQuery({ queryKey: ['staff-list'], queryFn: async () => (await supabase.from('profiles').select('full_name, email').eq('role', 'staff').order('full_name')).data || [] });
  const groups = useGroups();
  const [code, setCode] = useState('');
  const [groupSel, setGroup] = useState<string | null>(null);
  const group = groupSel ?? groups.data?.[0]?.name ?? '';
  const [newGroup, setNewGroup] = useState('');
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const [ics, setIcs] = useState<string | null>(null);
  const [calUrl, setCalUrl] = useState<string | null>(null);
  const icsVal = ics ?? settings.data?.calendar_ics_url ?? '';
  const calVal = calUrl ?? settings.data?.calendar_url ?? '';
  const validCode = /^[A-Z0-9]{2,}-?[A-Z0-9]{2,}$/.test(code.trim().toUpperCase());

  const addCode = async () => {
    const { error } = await supabase.from('class_codes').insert({ code: code.trim().toUpperCase(), group_name: group });
    if (error) return toast(error.message.includes('duplicate') ? 'Esse código já existe.' : 'Não deu para criar o código.');
    setCode('');
    toast('Código criado.');
    qc.invalidateQueries({ queryKey: ['class_codes'] });
  };
  const toggle = async (c: string, active: boolean) => {
    const { error } = await supabase.from('class_codes').update({ active }).eq('code', c);
    if (error) return toast('Não deu para salvar.');
    qc.invalidateQueries({ queryKey: ['class_codes'] });
  };
  const addGroup = async () => {
    const name = newGroup.trim();
    if (!name) return;
    const palette = ['#7A4FD0', '#0E7C66', '#B5551B', '#1F5FAD', '#A23B72', '#6B7A1E'];
    const { error } = await supabase.from('groups').insert({ name, color: palette[(groups.data?.length || 0) % palette.length] });
    if (error) return toast(error.message.includes('duplicate') ? 'Já existe um grupo com esse nome.' : 'Não deu para criar o grupo.');
    setNewGroup('');
    toast('Grupo criado.');
    qc.invalidateQueries({ queryKey: ['groups'] });
  };
  const renameGroup = async () => {
    if (!renaming) return;
    const to = renaming.to.trim();
    if (!to || to === renaming.from) return setRenaming(null);
    // O nome muda em cascata nos alunos, códigos e critérios.
    const { error } = await supabase.from('groups').update({ name: to }).eq('name', renaming.from);
    if (error) return toast(error.message.includes('duplicate') ? 'Já existe um grupo com esse nome.' : 'Não deu para renomear.');
    setRenaming(null);
    toast('Grupo renomeado. Os alunos continuam com o mesmo acesso.');
    ['groups', 'class_codes', 'staff-overview'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };
  const saveCal = async () => {
    const { error } = await supabase.from('settings').upsert([
      { key: 'calendar_ics_url', value: icsVal.trim() },
      { key: 'calendar_url', value: calVal.trim() },
    ]);
    if (error) return toast('Não deu para salvar.');
    toast('Agenda atualizada. Pode levar até 10 minutos para aparecer.');
    qc.invalidateQueries({ queryKey: ['settings-all'] });
    qc.invalidateQueries({ queryKey: ['calendar'] });
  };

  return (
    <div className="page">
      <PageHead title="Configurações" sub="Códigos de turma, agenda da mentoria e equipe." />
      <div className="grid-320" style={{ alignItems: 'start' }}>
        <div className="card stack" style={{ gap: 12 }}>
          <div className="h-card">Grupos</div>
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: -6 }}>Renomear ou trocar o aluno de grupo não mexe no acesso dele.</div>
          {(groups.data || []).map((g) => (
            <div key={g.name} className="between divrow" style={{ alignItems: 'center', padding: '8px 0', gap: 8 }}>
              {renaming?.from === g.name ? (
                <>
                  <input className="input md" style={{ height: 36, flex: 1 }} autoFocus value={renaming.to} onChange={(e) => setRenaming({ ...renaming, to: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') renameGroup(); if (e.key === 'Escape') setRenaming(null); }} />
                  <button className="btn btn-primary btn-sm" onClick={renameGroup}>Salvar</button>
                </>
              ) : (
                <>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: g.color, flex: 'none' }} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>{g.count} {g.count === 1 ? 'aluno' : 'alunos'}</span>
                  </div>
                  <button className="link" style={{ fontSize: 13 }} onClick={() => setRenaming({ from: g.name, to: g.name })}>Renomear</button>
                </>
              )}
            </div>
          ))}
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <input className="input md" style={{ height: 40, flex: 1 }} placeholder="Nome do novo grupo" value={newGroup} onChange={(e) => setNewGroup(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addGroup()} />
            <button className="btn btn-primary btn-sm" disabled={!newGroup.trim()} onClick={addGroup}>Criar</button>
          </div>
        </div>

        <div className="card stack" style={{ gap: 12 }}>
          <div className="h-card">Códigos de turma</div>
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: -6 }}>O aluno usa o código só no primeiro acesso, para entrar no grupo certo. Desativar um código não tira o acesso de quem já entrou.</div>
          {(codes.data || []).map((c) => (
            <div key={c.code} className="between divrow" style={{ alignItems: 'center', padding: '8px 0' }}>
              <div>
                <div className="mono" style={{ fontWeight: 600, fontSize: 14, letterSpacing: '.06em' }}>{c.code}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>{c.group_name}</div>
              </div>
              <button role="switch" aria-checked={c.active} aria-label={`${c.active ? 'Desativar' : 'Ativar'} ${c.code}`} className={'toggle' + (c.active ? ' on' : '')} onClick={() => toggle(c.code, !c.active)}><i /></button>
            </div>
          ))}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <input className="input md" style={{ height: 40, flex: '1 1 120px', textTransform: 'uppercase', letterSpacing: '.06em' }} placeholder="Ex.: ZT-2027" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
            <select className="input md" style={{ height: 40, width: 'auto' }} value={group} onChange={(e) => setGroup(e.target.value)}>
              {(groups.data || []).map((g) => <option key={g.name}>{g.name}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" disabled={!validCode} onClick={addCode}>Criar</button>
          </div>
        </div>

        <div className="card stack" style={{ gap: 12 }}>
          <div className="h-card">Agenda da mentoria</div>
          <label className="field">
            <span>Endereço iCal do Google Agenda</span>
            <input className="input md" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={icsVal} onChange={(e) => setIcs(e.target.value)} />
            <span style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 400 }}>
              Google Agenda → Configurações da agenda → Integrar agenda → "Endereço secreto no formato iCal". Use <span className="mono">demo</span> para a agenda de demonstração.
            </span>
          </label>
          <label className="field">
            <span>Link para "Abrir no Google Agenda"</span>
            <input className="input md" placeholder="https://calendar.google.com/…" value={calVal} onChange={(e) => setCalUrl(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={saveCal}>Salvar agenda</button>
        </div>

        <div className="card stack" style={{ gap: 10 }}>
          <div className="h-card">Equipe com acesso</div>
          {(staff.data || []).map((p) => (
            <div key={p.email} className="row divrow" style={{ padding: '8px 0' }}>
              <div className="av">{initials(p.full_name)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{p.full_name}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>{p.email}</div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>Para dar acesso de equipe a alguém, a pessoa cria a conta com um código de turma e pede para quem administra o portal promover.</div>
        </div>
      </div>
    </div>
  );
}

