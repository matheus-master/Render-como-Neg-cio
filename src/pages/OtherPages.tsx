import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chip, ErrorState, PageHead, PageSkeleton, Mark } from '../components/ui';
import { useAuth, useProfile } from '../lib/auth';
import { useGami, useRedButton, type Level, type Task, useSetting, useSurvey, useSetTaskStatus } from '../lib/data';
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
  const [sel, setSel] = useState<number | null>(null);

  if (g.isLoading) return <div className="page"><PageSkeleton /></div>;
  if (g.isError) return <div className="page"><ErrorState onRetry={g.refetch} /></div>;
  const cur = g.current;
  const shown = sel ?? cur?.n ?? 1;
  const lvl = g.levels.find((l) => l.n === shown);
  const next = g.levels.find((l) => l.n === shown + 1);
  const tasks = g.byLevel(shown);
  const states = tasks.map((t) => g.stateOf(t));
  const xpMax = tasks.reduce((a, t) => a + t.xp, 0);
  const xpDone = tasks.filter((_, i) => states[i]!.kind === 'feita').reduce((a, t) => a + t.xp, 0);
  const xpStarted = tasks.filter((_, i) => states[i]!.kind === 'andamento').reduce((a, t) => a + t.xp, 0);
  const done = states.filter((s) => s.kind === 'feita').length;
  const started = states.filter((s) => s.kind === 'andamento').length;
  const left = tasks.length - done;
  const isPast = cur && shown < cur.n;
  const isFuture = cur && shown > cur.n;
  // Próximo passo: a primeira em andamento; se não houver, a primeira pendente.
  const nextIdx = states.findIndex((s) => s.kind === 'andamento') >= 0 ? states.findIndex((s) => s.kind === 'andamento') : states.findIndex((s) => s.kind === 'pendente');
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
        <LevelPast lvl={lvl} tasks={tasks} g={g} />
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
                {done} <span style={{ fontSize: 15, color: 'var(--t3)', fontWeight: 600 }}>/ {tasks.length}</span>
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
            {lvl?.tagline && <div style={{ fontSize: 15, color: 'var(--t3)', marginTop: 2, marginBottom: 8 }}>{lvl.tagline}</div>}
            {tasks.map((t, i) => {
              const st = states[i]!;
              const on = st.kind === 'feita';
              const going = st.kind === 'andamento';
              return (
                <div key={t.id} className="row" style={{ padding: '14px 0', borderTop: '1px solid var(--b-div)', alignItems: 'center', background: going ? 'linear-gradient(90deg, var(--ac-soft), transparent 70%)' : undefined, margin: going ? '0 -20px' : undefined, paddingLeft: going ? 20 : 0, paddingRight: going ? 20 : 0 }}>
                  <div style={{ width: 22, fontWeight: 600, color: going ? 'var(--ac)' : 'var(--t4)', flex: 'none' }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: on ? 'var(--t3)' : 'var(--t)', textDecoration: on ? 'line-through' : 'none' }}>{t.title}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--t3)' }}>
                      {t.description}
                      {t.category ? ' · ' + t.category : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
                      {going && <Chip tone="soft" live>Em andamento</Chip>}
                      {on && <Chip tone="ok">Feita</Chip>}
                      {t.auto_slot ? (
                        <button onClick={() => nav(st.href!)} style={{ fontSize: 12, fontWeight: 600, color: 'var(--ac)' }}>
                          {st.note} →
                        </button>
                      ) : st.kind === 'pendente' ? (
                        <button onClick={() => set(t.id, 'andamento')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--ac)', border: '1px solid var(--ac)', borderRadius: 8, padding: '3px 8px' }}>
                          <Mark m="▶" size={12} /> Começar
                        </button>
                      ) : going ? (
                        <button onClick={() => set(t.id, 'pendente')} style={{ fontSize: 12, fontWeight: 600, color: 'var(--t3)' }}>
                          Ainda não comecei
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', color: going ? 'var(--ac)' : undefined }}>+{t.xp} XP</div>
                  <button
                    role="checkbox"
                    aria-checked={on}
                    aria-label={on ? 'Desmarcar ' + t.title : 'Marcar como feita: ' + t.title}
                    disabled={!!t.auto_slot}
                    onClick={() => set(t.id, on ? 'andamento' : 'feita')}
                    style={{ width: 28, height: 28, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 15, fontWeight: 600, background: on ? 'var(--ok)' : going ? 'var(--ac-soft)' : '#fff', border: on ? 'none' : going ? '2px solid var(--ac)' : '2px solid var(--b-dash)', cursor: t.auto_slot ? 'default' : 'pointer' }}
                  >
                    {on ? <Mark m="✓" /> : going ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ac)' }} /> : ''}
                  </button>
                </div>
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

function TaskRowStatic({ n, t, mode, date }: { n: number; t: Task; mode: 'done' | 'missed' | 'locked'; date?: string | null }) {
  return (
    <div className="row" style={{ padding: '14px 0', borderTop: '1px solid var(--b-div)' }}>
      <div style={{ width: 22, fontWeight: 600, color: 'var(--t4)', flex: 'none' }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, color: mode === 'locked' ? 'var(--t3)' : 'var(--t)' }}>{t.title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--t3)' }}>
          {t.description}
          {t.category ? ' · ' + t.category : ''}
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

function LevelPast({ lvl, tasks, g }: { lvl: Level; tasks: Task[]; g: Gami }) {
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
            {tasks.filter(g.isDone).length} de {tasks.length} tarefas principais
          </div>
          {tasks.map((t, i) => (
            <TaskRowStatic key={t.id} n={i + 1} t={t} mode={g.isDone(t) ? 'done' : 'missed'} date={g.doneAt(t)} />
          ))}
        </div>
      ) : (
        <div className="card" style={{ padding: 22, fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>
          As tarefas deste nível ainda não foram cadastradas no portal. Quando a equipe cadastrar, o que você fez aparece aqui.
        </div>
      )}
    </>
  );
}

function LevelFuture({ lvl, unlockAfter, tasks }: { lvl: Level; unlockAfter: string; tasks: Task[] }) {
  const xp = tasks.reduce((a, t) => a + t.xp, 0);
  return (
    <>
      <div style={{ background: '#fff', border: '1.5px dashed var(--b-dash)', borderRadius: 12, padding: '20px 22px', display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--alt2)', display: 'grid', placeItems: 'center', fontSize: 20, flex: 'none' }}>🔒</div>
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
          {tasks.map((t, i) => (
            <TaskRowStatic key={t.id} n={i + 1} t={t} mode="locked" />
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
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const used = !!red.data;

  const go = async () => {
    setConfirm(false);
    const { error } = await supabase.from('red_button').insert({});
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
              <span className="chip chip-none">Disponível</span>
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>Sessão individual com a Taty para montar seu plano de ação personalizado.</div>
          </div>
          <div className="card stack" style={{ gap: 12 }}>
            <div className="between" style={{ alignItems: 'center' }}>
              <div className="h-card">Botão Vermelho</div>
              {red.isLoading ? null : used ? <span className="chip" style={{ background: 'var(--err-bg)', color: '#7A1A14' }}>Usado</span> : <span className="chip chip-none">Disponível</span>}
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
                Acionado {fmtDay(red.data!.used_at)}. A Taty entra em contato pelo WhatsApp em até 1 dia útil.
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ fontWeight: 600, fontSize: 20, marginTop: 6 }}>Plano de ação</div>
      <div className="dashed" style={{ padding: '28px 20px', fontSize: 15, color: 'var(--t3)' }}>
        Seu plano de ação aparece aqui depois da sessão de direcionamento.
      </div>
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 20, lineHeight: 1.25 }}>Acionar o Botão Vermelho?</div>
            <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>Ele só pode ser usado uma vez. A Taty recebe o aviso e marca uma sessão de emergência com você.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 6 }}>
              <button className="btn btn-secondary" style={{ height: 50 }} onClick={() => setConfirm(false)}>
                Agora não
              </button>
              <button className="btn btn-danger" style={{ height: 50 }} onClick={go}>
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
// Calendário
// ---------------------------------------------------------------------
export function Calendario() {
  const url = useSetting('calendar_url');
  return (
    <div className="page">
      <PageHead title="Calendário" sub="Aulas ao vivo, Laboratórios RCN, Mão na Massa e datas importantes da mentoria." />
      <div className="hero" style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: 26 }}>Calendário do mês</div>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: '#A9AFB9', maxWidth: 460 }}>Confira as aulas ao vivo, Laboratórios RCN, Mão na Massa e todas as datas do mês.</div>
        <a href={url.data || '#'} target="_blank" rel="noreferrer" className="btn btn-gold btn-md" style={{ marginTop: 10, padding: '0 24px' }}>
          Abrir calendário ↗
        </a>
      </div>
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
  const [q1, setQ1] = useState<number | null>(null);
  const [q2, setQ2] = useState<number | null>(null);
  const [q3, setQ3] = useState<number | null>(null);
  const [q4, setQ4] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = q1 !== null && q2 !== null && q3 !== null && q4.trim().length > 0;

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const { error } = await supabase.from('survey_responses').insert({ time_in_mentoring: Q1[q1!], satisfaction: q2, contribution: q3, transformation: q4.trim() });
    setBusy(false);
    if (error) return toast('As respostas não foram enviadas. Tente de novo.');
    qc.invalidateQueries({ queryKey: ['survey'] });
  };

  return (
    <div className="page">
      <PageHead
        title="Feedback e Evolução da Mentoria RCN"
        sub="Este formulário não é uma avaliação sua. É uma forma de construirmos juntos a próxima versão da RCN: o que está funcionando, o que precisa melhorar e o que você quer da mentoria daqui pra frente. Seja sincero(a)!"
      />
      {survey.isLoading ? (
        <div className="skel-card" style={{ height: 400 }} />
      ) : survey.isError ? (
        <ErrorState onRetry={survey.refetch} />
      ) : survey.data ? (
        <div className="card" style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--ok-bg)', color: 'var(--ok)', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 600 }}><Mark m="✓" size={13} /></div>
          <div style={{ fontWeight: 600, fontSize: 20 }}>Obrigado pelas respostas</div>
          <div style={{ fontSize: 15, color: 'var(--t2)' }}>A equipe lê cada uma delas.</div>
        </div>
      ) : (
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
          <div className="stack" style={{ padding: '18px 0', gap: 12 }}>
            <Q n={4}>Qual foi a principal transformação que a mentoria trouxe para você até agora? *</Q>
            <textarea className="textarea" style={{ minHeight: 110 }} value={q4} onChange={(e) => setQ4(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-md" style={{ marginTop: 8 }} disabled={!ok || busy} onClick={submit}>
            Enviar respostas
          </button>
          <div style={{ fontSize: 13, color: 'var(--t3)', textAlign: 'center', marginTop: 8 }}>{ok ? 'Tudo certo para enviar.' : 'Responda as 4 perguntas para enviar.'}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------
export function Perfil() {
  const profile = useProfile();
  const { reloadProfile, signOut } = useAuth();
  const g = useGami();
  const toast = useToast();
  const nav = useNavigate();
  const [form, setForm] = useState({ full_name: profile.full_name, studio: profile.studio, city: profile.city, whatsapp: profile.whatsapp, instagram: profile.instagram });
  const [pass, setPass] = useState('');
  const [notify, setNotify] = useState(profile.email_notify);
  useEffect(() => setNotify(profile.email_notify), [profile.email_notify]);

  const save = async () => {
    const { error } = await supabase.from('profiles').update(form).eq('id', profile.id);
    if (error) return toast('Não deu para salvar. Tente de novo.');
    reloadProfile();
    toast('Dados salvos.');
  };
  const savePass = async () => {
    if (pass.length < 8) return;
    const { error } = await supabase.auth.updateUser({ password: pass });
    if (error) return toast('Não deu para trocar a senha. Tente de novo.');
    setPass('');
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
    ['instagram', 'Instagram', '@seustudio'],
  ];

  return (
    <div className="page">
      <PageHead title="Meu perfil" sub={profile.email} />
      <div className="grid-300">
        <div className="card stack" style={{ gap: 14 }}>
          <div className="h-card">Dados</div>
          {fields.map(([k, label, ph]) => (
            <label key={k} className="field">
              <span>{label}</span>
              <input className="input md" placeholder={ph} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </label>
          ))}
          <button className="btn btn-primary btn-md" onClick={save}>
            Salvar
          </button>
        </div>
        <div className="card stack" style={{ gap: 14 }}>
          <div className="h-card">Trocar senha</div>
          <label className="field">
            <span>Nova senha</span>
            <input className="input md" type="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-md" disabled={pass.length < 8} onClick={savePass}>
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
    </div>
  );
}
