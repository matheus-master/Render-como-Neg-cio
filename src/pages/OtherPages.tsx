import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BackLink, ErrorState, PageHead, PageSkeleton } from '../components/ui';
import { useAuth, useProfile } from '../lib/auth';
import { useGami, useRedButton, useReports, useSetting, useSurvey, useToggleTask } from '../lib/data';
import { fmtBRL, fmtDate, fmtDay, fmtPeriod } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';

// ---------------------------------------------------------------------
// Gamificação
// ---------------------------------------------------------------------
export function Gamificacao() {
  const g = useGami();
  const toggle = useToggleTask();
  const nav = useNavigate();
  const [sel, setSel] = useState<number | null>(null);

  if (g.isLoading) return <div className="page"><PageSkeleton /></div>;
  if (g.isError) return <div className="page"><ErrorState onRetry={g.refetch} /></div>;
  const cur = g.current;
  const shown = sel ?? cur?.n ?? 1;
  const lvl = g.levels.find((l) => l.n === shown);
  const tasks = g.byLevel(shown);
  const xpMax = tasks.reduce((a, t) => a + t.xp, 0);
  const xpLevel = tasks.filter(g.isDone).reduce((a, t) => a + t.xp, 0);
  const done = tasks.filter(g.isDone).length;
  const isPast = cur && shown < cur.n;
  const isFuture = cur && shown > cur.n;

  return (
    <div className="page">
      <PageHead title="Gamificação" sub="Marque suas tarefas e acompanhe seu XP. Ao concluir todas as tarefas principais do seu nível, você sobe automaticamente para o próximo." />
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', borderBottom: '1px solid var(--b-card)' }} role="tablist">
        {g.levels.map((l) => {
          const on = l.n === shown;
          return (
            <button key={l.n} role="tab" aria-selected={on} onClick={() => setSel(l.n)} style={{ padding: '12px 14px', fontSize: 15, fontWeight: on ? 700 : 500, whiteSpace: 'nowrap', color: on ? 'var(--ac)' : 'var(--t3)', borderBottom: on ? '3px solid var(--ac)' : '3px solid transparent', marginBottom: -1 }}>
              {l.n}. {l.name}
              {l.n === cur?.n ? ' ★' : ''}
            </button>
          );
        })}
      </div>
      {isFuture ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>
          Este nível abre quando você concluir as tarefas principais do {cur!.name}.
        </div>
      ) : tasks.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', fontSize: 15, lineHeight: 1.5, color: 'var(--t2)' }}>
          {isPast ? `${lvl?.name} concluído.` : 'As tarefas deste nível ainda não foram cadastradas pela equipe.'}
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
            <div className="card">
              <div className="label">XP neste nível</div>
              <div style={{ fontWeight: 700, fontSize: 28, marginTop: 8 }}>
                {xpLevel} <span style={{ fontSize: 15, color: 'var(--t3)', fontWeight: 600 }}>/ {xpMax}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--alt3)', overflow: 'hidden', marginTop: 10 }}>
                <div style={{ width: (xpMax ? (xpLevel / xpMax) * 100 : 0) + '%', height: '100%', borderRadius: 4, background: 'var(--ac)' }} />
              </div>
            </div>
            <div className="card">
              <div className="label">Tarefas principais</div>
              <div style={{ fontWeight: 700, fontSize: 28, marginTop: 8 }}>
                {done} <span style={{ fontSize: 15, color: 'var(--t3)', fontWeight: 600 }}>/ {tasks.length}</span>
              </div>
              {lvl?.goal && <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4 }}>Meta de faturamento: {lvl.goal}</div>}
            </div>
            <div className="card">
              <div className="label">XP total conquistado</div>
              <div style={{ fontWeight: 700, fontSize: 28, marginTop: 8 }}>{g.xpTotal}</div>
              <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 4 }}>Somando todos os níveis</div>
            </div>
          </div>
          <div className="card" style={{ padding: '20px 20px 6px' }}>
            <div className="h-card">
              Nível {lvl?.n} · {lvl?.name}
            </div>
            {lvl?.tagline && <div style={{ fontSize: 15, color: 'var(--t3)', marginTop: 2, marginBottom: 8 }}>{lvl.tagline}</div>}
            {tasks.map((t, i) => {
              const on = g.isDone(t);
              const click = () => (t.auto_slot ? nav(`/documentos/${t.auto_slot}/devolutiva`) : toggle.mutate({ taskId: t.id, done: !on }));
              return (
                <button key={t.id} onClick={click} role={t.auto_slot ? undefined : 'checkbox'} aria-checked={t.auto_slot ? undefined : on} className="row" style={{ padding: '14px 0', borderTop: '1px solid var(--b-div)', width: '100%' }}>
                  <div style={{ width: 22, fontWeight: 700, color: 'var(--t4)', flex: 'none' }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: on ? 'var(--t3)' : 'var(--t)' }}>{t.title}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--t3)' }}>
                      {t.description}
                      {t.category ? ' · ' + t.category : ''}
                    </div>
                    {t.auto_slot && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ac)', marginTop: 2 }}>
                        {on ? 'Concluída pela devolutiva' : 'Conclui sozinha quando a devolutiva vier Aprovado'}
                      </div>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>+{t.xp} XP</div>
                  <div style={{ width: 28, height: 28, borderRadius: 8, flex: 'none', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 15, fontWeight: 700, background: on ? 'var(--ok)' : '#fff', border: on ? 'none' : '2px solid var(--b-dash)' }}>{on ? '✓' : ''}</div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------
export function Relatorios() {
  const q = useReports();
  return (
    <div className="page">
      <PageHead
        title="Relatórios quinzenais"
        sub="Seu histórico de evolução, quinzena a quinzena."
        right={
          <Link to="/relatorios/novo" className="btn btn-primary">
            <span className="plus">+</span>Novo relatório
          </Link>
        }
      />
      {q.isLoading ? (
        <div className="skel-card" style={{ height: 180 }} />
      ) : q.isError ? (
        <ErrorState onRetry={q.refetch} />
      ) : q.data!.length === 0 ? (
        <div className="dashed" style={{ gap: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 17 }}>Nenhum relatório ainda</div>
          <div style={{ fontSize: 15, color: 'var(--t3)', lineHeight: 1.45, maxWidth: 420 }}>A cada quinzena, registre faturamento e prospecção. Seus números aparecem aqui e no Início.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: '0 20px' }}>
          {q.data!.map((r) => (
            <div key={r.id} className="divrow" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '8px 16px', padding: '18px 0', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{fmtPeriod(r.period_start, r.period_end)}</div>
                <div style={{ fontSize: 13, color: 'var(--t3)' }}>Enviado {fmtDay(r.created_at, false)}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'var(--t3)' }}>Faturamento</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>{fmtBRL(r.revenue)}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'var(--t3)' }}>Prospecção</div>
                <div style={{ fontSize: 15 }}>
                  {r.contacts} contatos · {r.proposals} propostas · {r.closed} fechada{r.closed === 1 ? '' : 's'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Quinzena anterior à data de hoje: 1–15 ou 16–fim do mês. */
function lastFortnight(): [string, string] {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  if (d > 15) return [iso(new Date(Date.UTC(y, m, 1))), iso(new Date(Date.UTC(y, m, 15)))];
  return [iso(new Date(Date.UTC(y, m - 1, 16))), iso(new Date(Date.UTC(y, m, 0)))];
}

export function NovoRelatorio() {
  const [a, b] = lastFortnight();
  const [start, setStart] = useState(a);
  const [end, setEnd] = useState(b);
  const [revenue, setRevenue] = useState('');
  const [contacts, setContacts] = useState('');
  const [proposals, setProposals] = useState('');
  const [closed, setClosed] = useState('');
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  const ok = start && end && end >= start && revenue.trim() !== '';

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const { error } = await supabase.from('reports').insert({ period_start: start, period_end: end, revenue: num(revenue), contacts: num(contacts), proposals: num(proposals), closed: num(closed) });
    setBusy(false);
    if (error) return toast('O relatório não foi enviado. Tente de novo.');
    await qc.invalidateQueries({ queryKey: ['reports'] });
    toast('Relatório enviado.');
    nav('/relatorios');
  };

  const F = ({ label, v, set, ph, mode = 'numeric' }: { label: string; v: string; set: (s: string) => void; ph?: string; mode?: 'numeric' | 'decimal' }) => (
    <label className="field">
      <span>{label}</span>
      <input className="input md" inputMode={mode} placeholder={ph} value={v} onChange={(e) => set(e.target.value)} />
    </label>
  );

  return (
    <div className="page">
      <div className="flow">
        <BackLink to="/relatorios">Relatórios</BackLink>
        <h1 style={{ fontWeight: 700, fontSize: 28, marginTop: -12 }}>Relatório quinzenal</h1>
        <div className="card stack" style={{ gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label className="field">
              <span>De</span>
              <input className="input md" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field">
              <span>Até</span>
              <input className="input md" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          {F({ label: 'Faturamento na quinzena (R$)', v: revenue, set: setRevenue, ph: 'Ex.: 3.150', mode: 'decimal' })}
          {F({ label: 'Contatos de prospecção', v: contacts, set: setContacts, ph: '0' })}
          {F({ label: 'Propostas enviadas', v: proposals, set: setProposals, ph: '0' })}
          {F({ label: 'Propostas fechadas', v: closed, set: setClosed, ph: '0' })}
          <button className="btn btn-primary btn-md" disabled={!ok || busy} onClick={save}>
            {busy ? 'Enviando…' : 'Enviar relatório'}
          </button>
        </div>
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
              <div style={{ background: 'var(--err-bg)', borderRadius: 12, padding: '12px 14px', fontSize: 15, lineHeight: 1.45, color: '#7A1A14' }}>
                Acionado {fmtDay(red.data!.used_at)}. A Taty entra em contato pelo WhatsApp em até 1 dia útil.
              </div>
            )}
          </div>
        </div>
      )}
      <div style={{ fontWeight: 700, fontSize: 20, marginTop: 6 }}>Plano de ação</div>
      <div className="dashed" style={{ padding: '28px 20px', fontSize: 15, color: 'var(--t3)' }}>
        Seu plano de ação aparece aqui depois da sessão de direcionamento.
      </div>
      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(false)}>
          <div className="modal" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.25 }}>Acionar o Botão Vermelho?</div>
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
      <div style={{ background: 'var(--ac)', color: '#fff', borderRadius: 18, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 26 }}>Calendário do mês</div>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: '#D5DCEA', maxWidth: 460 }}>Confira as aulas ao vivo, Laboratórios RCN, Mão na Massa e todas as datas do mês.</div>
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
        <button key={n} role="radio" aria-checked={v === n} onClick={() => set(n)} style={{ height: 44, borderRadius: 10, display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 15, textAlign: 'center', background: v === n ? 'var(--ac)' : '#fff', color: v === n ? '#fff' : 'var(--t)', border: v === n ? 'none' : '1px solid var(--b-input)' }}>
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
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--ok-bg)', color: 'var(--ok)', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700 }}>✓</div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>Obrigado pelas respostas</div>
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
