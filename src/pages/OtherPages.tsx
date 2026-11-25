import { PasswordFields, passwordOk } from '../components/PasswordFields';
import { InstagramAntesDepois, InstagramLink, instagramOf } from '../components/InstagramAntesDepois';
import { Avatar } from '../components/Avatar';
import { StudentInstagramReview } from '../components/InstagramIA';
import { StudentPlans } from '../components/Planos';
import { useMyEvents, useMyPlans } from '../lib/agenda';
import { safeName } from '../lib/upload';
import { useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Chip, ErrorState, PageHead, PageSkeleton, Mark } from '../components/ui';
import { useAuth, useProfile } from '../lib/auth';
import { useGami, useRedButton, type Level, type Task, useSurvey, useSetTaskStatus } from '../lib/data';
import { fmtDate, fmtDay } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';

// ---------------------------------------------------------------------
// Gamificação
// ---------------------------------------------------------------------
export function Gamificacao() {
  const g = useGami();
  const setStatus = useSetTaskStatus();
  const toast = useToast();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [sel, setSelRaw] = useState<number | null>(() => Number(params.get('nivel')) || null);
  const fixing = params.get('corrigir') === '1';
  const setSel = (n: number) => {
    setSelRaw(n);
    if (params.toString()) setParams({}, { replace: true });
  };

  if (g.isLoading) return <div className="page"><PageSkeleton /></div>;
  if (g.isError) return <div className="page"><ErrorState onRetry={g.refetch} /></div>;
  const cur = g.current;
  const shown = sel ?? cur?.n ?? 1;
  const lvl = g.levels.find((l) => l.n === shown);
  const next = g.levels.find((l) => l.n === shown + 1);
  // Principais primeiro, missões bônus no fim.
  const tasks = [...g.byLevel(shown).filter((t) => !t.bonus), ...g.byLevel(shown).filter((t) => t.bonus)];
  const states = tasks.map((t) => g.stateOf(t));
  const isMain = (i: number) => !tasks[i]!.bonus;
  const xpMax = tasks.reduce((a, t) => a + t.xp, 0);
  const xpDone = tasks.filter((_, i) => states[i]!.kind === 'feita').reduce((a, t) => a + t.xp, 0);
  const xpStarted = tasks.filter((_, i) => states[i]!.kind === 'andamento').reduce((a, t) => a + t.xp, 0);
  const done = states.filter((s, i) => isMain(i) && s.kind === 'feita').length;
  const started = states.filter((s, i) => isMain(i) && s.kind === 'andamento').length;
  const mainCount = tasks.filter((t) => !t.bonus).length;
  const left = mainCount - done;
  const isPast = cur && shown < cur.n;
  const isFuture = cur && shown > cur.n;
  // Próximo passo: a primeira em andamento; se não houver, a primeira pendente.
  const firstMain = (k: string) => states.findIndex((s, i) => isMain(i) && s.kind === k);
  const nextIdx = firstMain('andamento') >= 0 ? firstMain('andamento') : firstMain('pendente');
  const nextTask = nextIdx >= 0 ? tasks[nextIdx] : null;

  const set = (taskId: number, status: 'pendente' | 'andamento' | 'feita') =>
    setStatus.mutate({ taskId, status }, { onError: (e) => toast((e as Error).message) });
  const pct = (n: number) => (xpMax ? (n / xpMax) * 100 : 0);

  return (
    <div className="page">
      <PageHead title="Gamificação" sub="Marque suas tarefas e acompanhe seu XP. Ao concluir todas as tarefas principais do seu nível, você sobe automaticamente para o próximo." />
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', borderBottom: '1px solid var(--b-card)' }} role="tablist">
        {g.levels.map((l) => {
          const on = l.n === shown;
          return (
            <button key={l.n} role="tab" aria-selected={on} onClick={() => setSel(l.n)} style={{ padding: '12px 14px', fontSize: 15, fontWeight: on ? 700 : 500, whiteSpace: 'nowrap', color: on ? 'var(--ac)' : 'var(--t3)', borderBottom: on ? '3px solid var(--ac)' : '3px solid transparent', marginBottom: -1 }}>
              {l.n}. {l.name}
              {l.n === cur?.n ? <span style={{ marginLeft: 6, display: 'inline-flex', color: 'var(--gold)' }}><Mark m="★" size={12} /></span> : null}
            </button>
          );
        })}
      </div>
      {isFuture && lvl ? (
        <LevelFuture lvl={lvl} unlockAfter={g.levels.find((l) => l.n === shown - 1)?.name ?? cur!.name} tasks={tasks} />
      ) : isPast && lvl ? (
        <LevelPast lvl={lvl} tasks={tasks} g={g} fixing={fixing} onSet={set} />
      ) : tasks.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>
          As tarefas deste nível ainda não foram cadastradas pela equipe.
        </div>
      ) : (
        <>
          {nextTask && !isPast && (
            <div className="hero" style={{ padding: '20px 22px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div className="label" style={{ color: 'var(--gold)' }}>Seu próximo passo</div>
                <div style={{ fontWeight: 600, fontSize: 20, marginTop: 6 }}>{nextTask.title}</div>
                <div style={{ fontSize: 14, color: '#A9AFB9', marginTop: 4 }}>
                  {left === 1 ? 'Última tarefa' : `Faltam ${left} tarefas`}
                  {next ? ` para chegar a ${next.name}` : ' para fechar este nível'}
                  {started > 0 ? ` · ${started} em andamento` : ''}
                </div>
              </div>
              {nextTask.auto_slot ? (
                <button className="btn btn-gold" onClick={() => nav(states[nextIdx]!.href!)}>
                  {states[nextIdx]!.kind === 'pendente' ? 'Enviar documento' : 'Ver documento'}
                </button>
              ) : states[nextIdx]!.kind === 'pendente' ? (
                <button className="btn btn-gold" onClick={() => set(nextTask.id, 'andamento')}><Mark m="▶" size={12} /> Começar agora</button>
              ) : (
                <button className="btn btn-gold" onClick={() => set(nextTask.id, 'feita')}><Mark m="✓" size={13} /> Marcar como feita</button>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            <div className="card">
              <div className="label">XP neste nível</div>
              <div style={{ fontWeight: 600, fontSize: 28, marginTop: 8 }}>
                {xpDone} <span style={{ fontSize: 15, color: 'var(--t3)', fontWeight: 600 }}>/ {xpMax}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--alt3)', overflow: 'hidden', marginTop: 10, display: 'flex' }}>
                <div style={{ width: pct(xpDone) + '%', height: '100%', background: 'var(--ac)', transition: 'width .4s' }} />
                <div style={{ width: pct(xpStarted) + '%', height: '100%', background: 'repeating-linear-gradient(45deg, color-mix(in oklab, var(--ac) 45%, #fff) 0 6px, color-mix(in oklab, var(--ac) 30%, #fff) 6px 12px)', transition: 'width .4s' }} />
              </div>
              {xpStarted > 0 && <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 6 }}>+{xpStarted} XP em andamento</div>}
            </div>
            <div className="card">
              <div className="label">Tarefas principais</div>
              <div style={{ fontWeight: 600, fontSize: 28, marginTop: 8 }}>
                {done} <span style={{ fontSize: 15, color: 'var(--t3)', fontWeight: 600 }}>/ {mainCount}</span>
              </div>
              <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4 }}>
                {started > 0 ? `${started} em andamento` : lvl?.goal ? `Meta de faturamento: ${lvl.goal}` : 'Comece por uma tarefa'}
              </div>
            </div>
            <div className="card">
              <div className="label">XP total conquistado</div>
              <div style={{ fontWeight: 600, fontSize: 28, marginTop: 8 }}>{g.xpTotal}</div>
              <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4 }}>Somando todos os níveis</div>
            </div>
          </div>

          <div className="card" style={{ padding: '20px 20px 6px' }}>
            <div className="h-card">
              Nível {lvl?.n} · {lvl?.name}
            </div>
            {lvl?.tagline && <div style={{ fontSize: 15, color: 'var(--t3)', marginTop: 2 }}>{lvl.tagline}</div>}
            <div className="task-hint">
              Em cada tarefa, toque na situação: <b>A fazer</b>, <b>Fazendo</b> ou <b>Feita</b>. Só <b>Feita</b> soma XP.
            </div>
            {tasks.map((t, i) => {
              const st = states[i]!;
              const on = st.kind === 'feita';
              const bonusHeader = t.bonus && (i === 0 || !tasks[i - 1]!.bonus);
              const going = st.kind === 'andamento';
              return (
                <Fragment key={t.id}>
                {bonusHeader && (
                  <div style={{ padding: '18px 0 8px', borderTop: '1px solid var(--b-div)' }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ color: 'var(--gold)', display: 'flex' }}><Mark m="★" size={15} /></span>
                      <span className="h-card" style={{ fontSize: 15 }}>Missões bônus</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>Somam XP, mas não contam para subir de nível.</div>
                  </div>
                )}
                <div className={'task-row' + (going ? ' going' : '') + (on ? ' done' : '')}>
                  <div className="task-num">{t.position}</div>
                  <div className="task-main">
                    <div className="task-title">{t.title}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--t3)' }}>
                      {t.description}
                      {t.category ? ' · ' + t.category : ''}
                      <span className="mono" style={{ marginLeft: 6, color: going ? 'var(--ac)' : on ? 'var(--ok-t)' : 'var(--t2)', fontWeight: 600 }}>+{t.xp} XP</span>
                    </div>
                    {t.auto_slot && (
                      <button onClick={() => nav(st.href!)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--ac)', marginTop: 4 }}>
                        {st.note} →
                      </button>
                    )}
                  </div>
                  {t.auto_slot ? (
                    <Chip tone={on ? 'ok' : going ? 'soft' : 'none'}>{on ? 'Feita' : going ? 'Fazendo' : 'A fazer'}</Chip>
                  ) : (
                    <TaskPicker t={t} kind={st.kind} onSet={(k) => set(t.id, k)} />
                  )}
                </div>
                </Fragment>
              );
            })}
          </div>
          <Achievements g={g} />
        </>
      )}
    </div>
  );
}


type Gami = ReturnType<typeof useGami>;
type Kind = 'pendente' | 'andamento' | 'feita';

/** Seletor de situação da tarefa: um toque leva direto para a situação escolhida. */
function TaskPicker({ t, kind, onSet }: { t: Task; kind: Kind; onSet: (k: Kind) => void }) {
  return (
    <div className="task-state" role="radiogroup" aria-label={`Situação de ${t.title}`}>
      {([['pendente', 'A fazer'], ['andamento', 'Fazendo'], ['feita', 'Feita']] as const).map(([k, label]) => (
        <button key={k} role="radio" aria-checked={kind === k} className={'ts-' + k + (kind === k ? ' on' : '')} onClick={() => kind !== k && onSet(k)}>
          {k === 'feita' && <Mark m="✓" size={12} />}
          {k === 'andamento' && <span className="ts-dot" />}
          {label}
        </button>
      ))}
    </div>
  );
}

function TaskRowStatic({ n, t, mode, date }: { n: number; t: Task; mode: 'done' | 'missed' | 'locked'; date?: string | null }) {
  return (
    <div className="row" style={{ padding: '14px 0', borderTop: '1px solid var(--b-div)' }}>
      <div style={{ width: 22, fontWeight: 600, color: 'var(--t4)', flex: 'none' }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: mode === 'locked' ? 'var(--t3)' : 'var(--t)' }}>{t.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--t3)' }}>
          {t.description}
          {t.category ? ' · ' + t.category : ''}
          {t.bonus ? ' · missão bônus' : ''}
          {date ? ' · concluída em ' + fmtDay(date, false) : ''}
        </div>
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', color: mode === 'locked' ? 'var(--t4)' : undefined }}>+{t.xp} XP</div>
      <div
        aria-label={mode === 'done' ? 'Feita' : mode === 'locked' ? 'Bloqueada' : 'Não feita'}
        style={{ width: 28, height: 28, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 600, color: mode === 'done' ? '#fff' : 'var(--t4)', background: mode === 'done' ? 'var(--ok)' : 'var(--alt2)' }}
      >
        {mode === 'done' ? <Mark m="✓" /> : mode === 'locked' ? <Mark m="🔒" /> : ''}
      </div>
    </div>
  );
}

function LevelPast({ lvl, tasks: raw, g, fixing: fix0, onSet }: { lvl: Level; tasks: Task[]; g: Gami; fixing: boolean; onSet: (id: number, k: Kind) => void }) {
  const [fixing, setFixing] = useState(fix0);
  const tasks = [...raw.filter((t) => !t.bonus), ...raw.filter((t) => t.bonus)];
  const xp = tasks.filter(g.isDone).reduce((a, t) => a + t.xp, 0);
  const dates = tasks.map(g.doneAt).filter(Boolean).sort() as string[];
  const last = dates[dates.length - 1];
  return (
    <>
      <div style={{ background: 'var(--ok-bg)', color: '#0F4A2C', borderRadius: 12, padding: '20px 22px', display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--ok)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 600, flex: 'none' }}><Mark m="✓" size={13} /></div>
        <div>
          <div className="label" style={{ color: 'var(--ok-t)' }}>Nível concluído</div>
          <div style={{ fontWeight: 600, fontSize: 22 }}>{lvl.name}</div>
          <div style={{ fontSize: 15, marginTop: 2 }}>
            {tasks.length ? `${xp} XP conquistados` : 'Etapa vencida'}
            {last ? ` · concluído em ${fmtDay(last, false)}` : ''}
            {lvl.tagline ? ` · ${lvl.tagline}` : ''}
          </div>
        </div>
      </div>
      {tasks.length > 0 ? (
        <div className="card" style={{ padding: '20px 20px 6px' }}>
          <div className="h-card">O que você fez neste nível</div>
          <div style={{ fontSize: 15, color: 'var(--t3)', marginTop: 2, marginBottom: 8 }}>
            {tasks.filter((t) => !t.bonus && g.isDone(t)).length} de {tasks.filter((t) => !t.bonus).length} tarefas principais
            {tasks.some((t) => t.bonus) && ' · as missões bônus continuam abertas: dá para marcar quando quiser'}
          </div>
          {fixing ? (
            <div className="fix-bar">
              <span>Marcou alguma tarefa sem querer? Volte ela para <b>A fazer</b> ou <b>Fazendo</b>. Se for uma tarefa principal, você volta para o {lvl.name} até concluí-la.</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setFixing(false)}>Pronto</button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 6 }}>
              Marcou algo sem querer?{' '}
              <button className="link" style={{ fontSize: 13 }} onClick={() => setFixing(true)}>Corrigir tarefas deste nível</button>
            </div>
          )}
          {tasks.map((t) =>
            (fixing || t.bonus) && !t.auto_slot ? (
              <div key={t.id} className={'task-row' + (g.isDone(t) ? ' done' : g.stateOf(t).kind === 'andamento' ? ' going' : '')}>
                <div className="task-num">{t.position}</div>
                <div className="task-main">
                  <div className="task-title">{t.title}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--t3)' }}>
                    {t.description}
                    {t.bonus ? ' · missão bônus' : ''}
                    <span className="mono" style={{ marginLeft: 6, fontWeight: 600 }}>+{t.xp} XP</span>
                  </div>
                </div>
                <TaskPicker t={t} kind={g.stateOf(t).kind} onSet={(k) => onSet(t.id, k)} />
              </div>
            ) : (
              <TaskRowStatic key={t.id} n={t.position} t={t} mode={g.isDone(t) ? 'done' : 'missed'} date={g.doneAt(t)} />
            ),
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 22, fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>
          As tarefas deste nível ainda não foram cadastradas no portal. Quando a equipe cadastrar, o que você fez aparece aqui.
        </div>
      )}
    </>
  );
}

function LevelFuture({ lvl, unlockAfter, tasks: raw }: { lvl: Level; unlockAfter: string; tasks: Task[] }) {
  const tasks = [...raw.filter((t) => !t.bonus), ...raw.filter((t) => t.bonus)];
  const xp = tasks.reduce((a, t) => a + t.xp, 0);
  return (
    <>
      <div style={{ background: '#fff', border: '1.5px dashed var(--b-dash)', borderRadius: 12, padding: '20px 22px', display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--alt2)', display: 'grid', placeItems: 'center', fontSize: 20, flex: 'none' }}><Mark m="🔒" size={20} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="label">O que você vai conquistar</div>
          <div style={{ fontWeight: 600, fontSize: 22 }}>Nível {lvl.n} · {lvl.name}</div>
          <div style={{ fontSize: 15, color: 'var(--t2)', marginTop: 2 }}>
            {[lvl.tagline, lvl.goal ? `Meta de faturamento: ${lvl.goal}` : null, xp ? `${xp} XP disponíveis` : null].filter(Boolean).join(' · ') || 'Próxima etapa da sua jornada.'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 6 }}>Abre quando você concluir as tarefas principais do {unlockAfter}.</div>
        </div>
      </div>
      {tasks.length > 0 ? (
        <div className="card" style={{ padding: '20px 20px 6px' }}>
          <div className="h-card">Tarefas deste nível</div>
          <div style={{ fontSize: 15, color: 'var(--t3)', marginTop: 2, marginBottom: 8 }}>Uma prévia do que vem pela frente.</div>
          {tasks.map((t) => (
            <TaskRowStatic key={t.id} n={t.position} t={t} mode="locked" />
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 22, fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>
          As tarefas deste nível serão liberadas pela equipe.
        </div>
      )}
    </>
  );
}

/** Linha do tempo do que o aluno já concluiu, em todos os níveis. */
function Achievements({ g }: { g: Gami }) {
  const items = g.tasks
    .filter(g.isDone)
    .map((t) => ({ t, at: g.doneAt(t), lvl: g.levels.find((l) => l.n === t.level) }))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  if (!items.length) return null;
  return (
    <div className="card" style={{ padding: '20px 20px 6px' }}>
      <div className="between" style={{ alignItems: 'baseline' }}>
        <div className="h-card">Suas conquistas</div>
        <div style={{ fontSize: 14, color: 'var(--t3)' }}>{g.xpTotal} XP no total</div>
      </div>
      <div style={{ marginTop: 10 }}>
        {items.map(({ t, at, lvl }, i) => (
          <div key={t.id} style={{ display: 'flex', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--ok)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 600, flex: 'none' }}><Mark m="✓" size={13} /></div>
              <div style={{ width: 2, flex: 1, background: i === items.length - 1 ? 'transparent' : '#DCDFE3', margin: '4px 0' }} />
            </div>
            <div style={{ paddingBottom: 16, flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{t.title}</div>
              <div style={{ fontSize: 13, color: 'var(--t3)' }}>
                {[lvl ? `Nível ${lvl.n} · ${lvl.name}` : null, at ? fmtDay(at) : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--ok)', whiteSpace: 'nowrap' }}>+{t.xp} XP</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Sessões
// ---------------------------------------------------------------------
export function Sessoes() {
  const red = useRedButton();
  const plans = useMyPlans();
  const events = useMyEvents();
  const dirEvent = (events.data || []).filter((e) => e.kind === 'direcionamento' && !e.canceled).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const dirNext = dirEvent.find((e) => new Date(e.ends_at).getTime() > Date.now());
  const dirDone = (plans.data || []).length > 0 || dirEvent.some((e) => new Date(e.ends_at).getTime() <= Date.now());
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const used = !!red.data;

  const go = async () => {
    if (reason.trim().length < 10) return;
    setConfirm(false);
    const { error } = await supabase.from('red_button').insert({ reason: reason.trim() });
    if (error) return toast('Não deu para acionar. Tente de novo.');
    qc.invalidateQueries({ queryKey: ['red_button'] });
  };

  return (
    <div className="page">
      <PageHead title="Sessões individuais" sub="Suas duas sessões individuais com a Taty." />
      {red.isError ? (
        <ErrorState onRetry={red.refetch} />
      ) : (
        <div className="grid-300">
          <div className="card stack" style={{ gap: 8 }}>
            <div className="between" style={{ alignItems: 'center' }}>
              <div className="h-card">Direcionamento inicial</div>
              {dirNext ? <Chip tone="soft">Agendado</Chip> : dirDone ? <Chip tone="ok">Realizado</Chip> : <span className="chip chip-none">Disponível</span>}
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>
              {dirNext
                ? `Marcado para ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(dirNext.starts_at))}. Os detalhes e o link estão no Calendário.`
                : dirDone
                  ? 'Sessão feita. Seu plano de ação está logo abaixo: marque cada passo quando fizer.'
                  : 'Sessão individual com a Taty para montar seu plano de ação personalizado. A equipe marca a data com você.'}
            </div>
          </div>
          <div className="card stack" style={{ gap: 12 }}>
            <div className="between" style={{ alignItems: 'center' }}>
              <div className="h-card">Botão Vermelho</div>
              {red.isLoading ? null : used ? <Chip tone={red.data!.staff_status === 'realizado' ? 'ok' : red.data!.staff_status === 'agendado' ? 'soft' : 'err'}>{red.data!.staff_status === 'realizado' ? 'Realizado' : red.data!.staff_status === 'agendado' ? 'Agendado' : 'Solicitado'}</Chip> : <span className="chip chip-none">Disponível</span>}
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>Sessão de emergência, para usar em último caso quando você travar nas tarefas. Só pode ser usada uma vez.</div>
            {!red.isLoading && !used && (
              <button className="btn btn-danger btn-md" style={{ alignSelf: 'flex-start', gap: 10, padding: '0 22px' }} onClick={() => setConfirm(true)}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#fff' }} />
                Acionar Botão Vermelho
              </button>
            )}
            {used && (
              <div style={{ background: 'var(--err-bg)', borderRadius: 8, padding: '12px 14px', fontSize: 15, lineHeight: 1.45, color: '#7A1A14' }}>
                Acionado {fmtDay(red.data!.used_at)}.{' '}
                {red.data!.staff_status === 'solicitado' ? 'A Taty entra em contato pelo WhatsApp em até 1 dia útil.' : red.data!.staff_status === 'agendado' ? 'Sessão agendada.' : 'Sessão realizada.'}
                {red.data!.reason && <div style={{ marginTop: 8, fontSize: 14, color: 'var(--t2)' }}><b>Seu motivo:</b> {red.data!.reason}</div>}
                {red.data!.staff_notes && <div style={{ marginTop: 6, fontSize: 14, color: 'var(--t2)' }}><b>Equipe:</b> {red.data!.staff_notes}</div>}
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ fontWeight: 600, fontSize: 20, marginTop: 6 }}>Plano de ação</div>
      <StudentPlans />
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 20, lineHeight: 1.25 }}>Acionar o Botão Vermelho?</div>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>Ele só pode ser usado uma vez. A Taty recebe o aviso e marca uma sessão de emergência com você.</div>
            <label className="field">
              <span>Onde você travou?</span>
              <textarea className="textarea" autoFocus placeholder="Conte em poucas linhas o que está te travando, para a Taty já chegar preparada." value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
              <button className="btn btn-secondary" style={{ height: 50 }} onClick={() => setConfirm(false)}>
                Agora não
              </button>
              <button className="btn btn-danger" style={{ height: 50 }} onClick={go} disabled={reason.trim().length < 10}>
                Acionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Feedback da mentoria (pesquisa)
// ---------------------------------------------------------------------
const Q1 = ['Menos de 3 meses', '3 a 6 meses', '6 a 12 meses', 'Mais de 12 meses'];

function Scale({ v, set }: { v: number | null; set: (n: number) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(44px,1fr))', gap: 6, maxWidth: 560 }} role="radiogroup">
      {Array.from({ length: 11 }, (_, n) => (
        <button key={n} role="radio" aria-checked={v === n} onClick={() => set(n)} style={{ height: 44, borderRadius: 8, display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 15, textAlign: 'center', background: v === n ? 'var(--ac)' : '#fff', color: v === n ? '#fff' : 'var(--t)', border: v === n ? 'none' : '1px solid var(--b-input)' }}>
          {n}
        </button>
      ))}
    </div>
  );
}
function Q({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.4 }}>
      <span style={{ color: '#B07800', marginRight: 8 }}>{n}</span>
      {children}
    </div>
  );
}

export function FeedbackMentoria() {
  const survey = useSurvey();
  const qc = useQueryClient();
  const toast = useToast();
  const [writing, setWriting] = useState(false);
  const [q1, setQ1] = useState<number | null>(null);
  const [q2, setQ2] = useState<number | null>(null);
  const [q3, setQ3] = useState<number | null>(null);
  const [q4, setQ4] = useState('');
  const [q5, setQ5] = useState('');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = survey.data || [];
  const ok = q1 !== null && q2 !== null && q3 !== null && q4.trim().length > 0;

  const start = () => {
    // Já começa com o tempo de mentoria da última resposta; o resto em branco.
    const prev = list[0] ? Q1.indexOf(list[0].time_in_mentoring) : -1;
    setQ1(prev >= 0 ? prev : null);
    setQ2(null); setQ3(null); setQ4(''); setQ5('');
    setWriting(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const close = () => setWriting(false);
  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const { error } = await supabase
      .from('survey_responses')
      .insert({ time_in_mentoring: Q1[q1!], satisfaction: q2, contribution: q3, transformation: q4.trim(), suggestion: q5.trim() });
    setBusy(false);
    if (error) return toast('As respostas não foram enviadas. Tente de novo.');
    await qc.invalidateQueries({ queryKey: ['survey'] });
    setWriting(false);
    toast('Obrigado! A equipe lê cada feedback.');
  };
  const showForm = writing || (!survey.isLoading && !survey.isError && list.length === 0);

  return (
    <div className="page">
      <PageHead
        title="Feedback e Evolução da Mentoria RCN"
        sub="Este formulário não é uma avaliação sua. É uma forma de construirmos juntos a próxima versão da RCN: o que está funcionando, o que precisa melhorar e o que você quer da mentoria daqui pra frente. Seja sincero(a)!"
        right={!showForm && list.length > 0 ? <button className="btn btn-primary" onClick={start}><Mark m="+" size={15} /> Mandar novo feedback</button> : undefined}
      />
      {survey.isLoading ? (
        <div className="skel-card" style={{ height: 400 }} />
      ) : survey.isError ? (
        <ErrorState onRetry={survey.refetch} />
      ) : (
        <>
          {showForm && (
            <>
              {list.length > 0 && <div className="h-card">Novo feedback</div>}
          <div className="card stack" style={{ padding: '8px 20px 20px' }}>
            <div className="divrow stack" style={{ padding: '18px 0', gap: 10 }}>
              <Q n={1}>Há quanto tempo você está na mentoria? *</Q>
              <div role="radiogroup">
                {Q1.map((label, i) => (
                  <button key={label} role="radio" aria-checked={q1 === i} onClick={() => setQ1(i)} className="row" style={{ minHeight: 44, width: '100%' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: q1 === i ? 'var(--ac)' : '#fff', border: q1 === i ? 'none' : '2px solid var(--b-btn)' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
                    </div>
                    <div style={{ fontSize: 15 }}>{label}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="divrow stack" style={{ padding: '18px 0', gap: 12 }}>
              <Q n={2}>De 0 a 10, quanto você está satisfeito(a) com a mentoria atualmente? *</Q>
              <Scale v={q2} set={setQ2} />
            </div>
            <div className="divrow stack" style={{ padding: '18px 0', gap: 12 }}>
              <Q n={3}>De 0 a 10, o quanto você sente que a mentoria está contribuindo para o crescimento do seu negócio/carreira? *</Q>
              <Scale v={q3} set={setQ3} />
            </div>
            <div className="divrow stack" style={{ padding: '18px 0', gap: 12 }}>
              <Q n={4}>Qual foi a principal transformação que a mentoria trouxe para você até agora? *</Q>
              <textarea className="textarea" style={{ minHeight: 110 }} value={q4} onChange={(e) => setQ4(e.target.value)} />
            </div>
            <div className="stack" style={{ padding: '18px 0', gap: 12 }}>
              <Q n={5}>Tem alguma sugestão ou pedido para a equipe? <span style={{ fontWeight: 400, color: 'var(--t3)' }}>(opcional)</span></Q>
              <textarea className="textarea" style={{ minHeight: 90 }} placeholder="Ex.: uma aula sobre contrato, mais exemplos de proposta…" value={q5} onChange={(e) => setQ5(e.target.value)} />
            </div>
            <div className="row" style={{ gap: 10, marginTop: 8 }}>
              {list.length > 0 && <button className="btn btn-secondary btn-md" onClick={close}>Cancelar</button>}
              <button className="btn btn-primary btn-md" style={{ flex: 1 }} disabled={!ok || busy} onClick={submit}>
                {busy ? 'Enviando…' : 'Enviar respostas'}
              </button>
            </div>
            <div style={{ fontSize: 13, color: 'var(--t3)', textAlign: 'center', marginTop: 8 }}>{ok ? 'Tudo certo para enviar.' : 'Responda as perguntas 1 a 4 para enviar.'}</div>
          </div>
            </>
          )}
          {list.length > 0 && (
            <div className="card" style={{ padding: '20px 20px 6px' }}>
              <div className="between" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <div className="h-card">Seus feedbacks</div>
                <span className="label">{list.length === 1 ? '1 enviado' : `${list.length} enviados`}</span>
              </div>
              <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 2, marginBottom: 8 }}>Do mais recente para o mais antigo. Toque para ver as respostas.</div>
              {list.map((r, i) => {
                const open = openId === r.id || (openId === null && i === 0);
                return (
                  <div key={r.id} style={{ borderTop: '1px solid var(--b-div)' }}>
                    <button className="fb-head" aria-expanded={open} onClick={() => setOpenId(open ? '' : r.id)}>
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(r.created_at))}</div>
                        <div style={{ fontSize: 13, color: 'var(--t3)' }}>{i === 0 ? 'Mais recente · ' : ''}{r.time_in_mentoring} de mentoria</div>
                      </div>
                      <span className="chip chip-soft mono">Satisfação {r.satisfaction}/10</span>
                      <span className="chip chip-soft mono">Contribuição {r.contribution}/10</span>
                      <span style={{ color: 'var(--t4)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s', display: 'flex' }}><Mark m="›" size={18} /></span>
                    </button>
                    {open && (
                      <div className="stack" style={{ gap: 12, padding: '0 0 18px' }}>
                        <div>
                          <div className="label">Principal transformação</div>
                          <div style={{ fontSize: 15, lineHeight: 1.55, marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.transformation}</div>
                        </div>
                        {r.suggestion && (
                          <div>
                            <div className="label">Sugestão para a equipe</div>
                            <div style={{ fontSize: 15, lineHeight: 1.55, marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.suggestion}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------
/** Foto de perfil: aparece no menu, no perfil e para a equipe. */
function PhotoField() {
  const profile = useProfile();
  const { reloadProfile } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Escolha uma imagem (JPG ou PNG).');
    if (f.size > 8 * 1024 * 1024) return toast('A foto passa de 8 MB. Escolha uma menor.');
    setBusy(true);
    const path = `${profile.id}/avatar/${Date.now()}_${safeName(f.name)}`;
    const up = await supabase.storage.from('files').upload(path, f, { contentType: f.type });
    if (up.error) { setBusy(false); return toast('Não deu para enviar a foto. Tente de novo.'); }
    const old = profile.avatar_path;
    const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', profile.id);
    if (!error && old) await supabase.storage.from('files').remove([old]);
    setBusy(false);
    if (error) return toast('Não deu para salvar a foto.');
    qc.invalidateQueries({ queryKey: ['staff-overview'] });
    reloadProfile();
    toast('Foto atualizada.');
  };
  const remove = async () => {
    const old = profile.avatar_path;
    if (!old) return;
    await supabase.from('profiles').update({ avatar_path: null }).eq('id', profile.id);
    await supabase.storage.from('files').remove([old]);
    reloadProfile();
  };
  return (
    <div className="row" style={{ gap: 14 }}>
      <Avatar path={profile.avatar_path} name={profile.full_name} className="avatar-btn" size={64} style={{ fontSize: 18 }} />
      <div className="stack" style={{ gap: 6 }}>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? 'Enviando…' : profile.avatar_path ? 'Trocar foto' : 'Adicionar foto'}
          </button>
          {profile.avatar_path && !busy && <button className="link" style={{ fontSize: 13 }} onClick={remove}>Remover</button>}
        </div>
        <span style={{ fontSize: 12, color: 'var(--t3)' }}>Aparece para a equipe RCN.</span>
      </div>
    </div>
  );
}
export function Perfil() {
  const profile = useProfile();
  const { reloadProfile, signOut } = useAuth();
  const g = useGami();
  const toast = useToast();
  const nav = useNavigate();
  const [form, setForm] = useState({ full_name: profile.full_name, studio: profile.studio, city: profile.city, whatsapp: profile.whatsapp, instagram: profile.instagram });
  // Começa em leitura quando o perfil já tem dados; em edição se ainda está vazio.
  const [editing, setEditing] = useState(!profile.studio && !profile.city && !profile.whatsapp && !profile.instagram);
  const [savingData, setSavingData] = useState(false);
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notify, setNotify] = useState(profile.email_notify);
  useEffect(() => setNotify(profile.email_notify), [profile.email_notify]);

  const save = async () => {
    if (!form.full_name.trim()) return toast('O nome completo não pode ficar vazio.');
    setSavingData(true);
    const clean = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as typeof form;
    // Instagram: aceita @, nome ou link; guarda como @perfil.
    if (clean.instagram) {
      const ig = instagramOf(clean.instagram);
      if (!ig) return toast('Não reconhecemos esse Instagram. Use @seustudio ou o link do perfil.');
      clean.instagram = '@' + ig.handle;
    }
    const { error } = await supabase.from('profiles').update(clean).eq('id', profile.id);
    setSavingData(false);
    if (error) return toast('Não deu para salvar. Tente de novo.');
    setForm(clean);
    reloadProfile();
    setEditing(false);
    toast('Dados salvos.');
  };
  const cancel = () => {
    setForm({ full_name: profile.full_name, studio: profile.studio, city: profile.city, whatsapp: profile.whatsapp, instagram: profile.instagram });
    setEditing(false);
  };
  const savePass = async () => {
    if (!passwordOk(pass, confirm)) return;
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) return toast('Não deu para trocar a senha. Tente de novo.');
    setPass('');
    setConfirm('');
    toast('Senha alterada.');
  };
  const toggleNotify = async () => {
    const v = !notify;
    setNotify(v);
    const { error } = await supabase.from('profiles').update({ email_notify: v }).eq('id', profile.id);
    if (error) {
      setNotify(!v);
      return toast('Não deu para salvar. Tente de novo.');
    }
    reloadProfile();
  };
  const fields: [keyof typeof form, string, string][] = [
    ['full_name', 'Nome completo', ''],
    ['studio', 'Studio', ''],
    ['city', 'Cidade', 'Ex.: Curitiba, PR'],
    ['whatsapp', 'WhatsApp', '(41) 99999-0000'],
    ['instagram', 'Instagram', '@seustudio ou link do perfil'],
  ];

  return (
    <div className="page">
      <PageHead title="Meu perfil" sub={profile.email} />
      <div className="grid-300">
        <div className="card stack" style={{ gap: 14 }}>
          <div className="between" style={{ alignItems: 'center' }}>
            <div className="h-card">Dados</div>
            {!editing && (
              <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                <Pencil size={14} aria-hidden />
                Editar dados
              </button>
            )}
          </div>
          <PhotoField />
          {editing ? (
            <>
              {fields.map(([k, label, ph]) => (
                <label key={k} className="field">
                  <span>{label}</span>
                  <input className="input md" placeholder={ph} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </label>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: profile.full_name ? '1fr 2fr' : '1fr', gap: 10 }}>
                {profile.full_name && (
                  <button className="btn btn-secondary btn-md" onClick={cancel} disabled={savingData}>
                    Cancelar
                  </button>
                )}
                <button className="btn btn-primary btn-md" onClick={save} disabled={savingData}>
                  {savingData ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </>
          ) : (
            <dl style={{ margin: 0, display: 'flex', flexDirection: 'column' }}>
              {fields.map(([k, label]) => (
                <div key={k} className="between divrow" style={{ padding: '11px 0', alignItems: 'baseline', gap: 16 }}>
                  <dt className="label" style={{ flex: 'none' }}>{label}</dt>
                  <dd style={{ margin: 0, fontSize: 15, fontWeight: 500, textAlign: 'right', overflowWrap: 'anywhere', color: profile[k] ? 'var(--t)' : 'var(--t4)' }}>
                    {k === 'instagram' ? <InstagramLink value={profile.instagram} /> : profile[k] || 'Não informado'}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        <div className="card stack" style={{ gap: 14 }}>
          <div className="h-card">Trocar senha</div>
          <PasswordFields pass={pass} setPass={setPass} confirm={confirm} setConfirm={setConfirm} size="md" />
          <button className="btn btn-primary btn-md" disabled={!passwordOk(pass, confirm)} onClick={savePass}>
            Alterar senha
          </button>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--t3)' }}>
            Grupo: <b style={{ color: 'var(--t)' }}>{profile.group_name || '—'}</b> · Nível: <b style={{ color: 'var(--t)' }}>{g.current?.name || '—'}</b> · Desde {fmtDate(profile.created_at)}
            <br />
            Esses dados são atualizados pela equipe RCN.
          </div>
        </div>
        <div className="card stack" style={{ gap: 16 }}>
          <div className="h-card">Avisos e conta</div>
          <button role="switch" aria-checked={notify} onClick={toggleNotify} className="between" style={{ alignItems: 'center', width: '100%' }}>
            <div>
              <div style={{ fontSize: 16 }}>Avisar por e-mail</div>
              <div style={{ fontSize: 14, color: 'var(--t3)' }}>Quando uma devolutiva for liberada</div>
            </div>
            <div className={'toggle' + (notify ? ' on' : '')}>
              <i />
            </div>
          </button>
          <button
            className="btn btn-secondary btn-md"
            style={{ height: 50, color: 'var(--err-t)' }}
            onClick={async () => {
              await signOut();
              nav('/login');
            }}
          >
            Sair da conta
          </button>
        </div>
      </div>
      <StudentInstagramReview />
      <InstagramAntesDepois studentId={profile.id} instagram={profile.instagram} />
    </div>
  );
}
