import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { planStatus, STALE_DAYS, usePlans, useMyPlans, useToggleItem, whatsappLink, type ActionPlan } from '../lib/agenda';
import { fmtDay } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Avatar } from './Avatar';
import { Mark } from './ui';

const days = (n: number) => (n === 0 ? 'hoje' : n === 1 ? 'há 1 dia' : `há ${n} dias`);

function Progress({ p }: { p: ActionPlan }) {
  const st = planStatus(p);
  return (
    <div>
      <div className="between" style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 6 }}>
        <span>{st.done} de {st.total} feitos</span>
        <span>{st.complete ? 'Plano concluído' : st.lastDone ? `último avanço ${days(Math.floor((Date.now() - new Date(st.lastDone).getTime()) / 86_400_000))}` : 'ainda sem avanço'}</span>
      </div>
      <div className="track" style={{ height: 6 }}><i style={{ width: st.pct + '%', background: st.complete ? 'var(--ok)' : undefined }} /></div>
    </div>
  );
}

function Checklist({ p, editable }: { p: ActionPlan; editable: boolean }) {
  const toggle = useToggleItem();
  const toast = useToast();
  return (
    <div className="plan-list">
      {p.items.map((it) => {
        const done = !!it.done_at;
        return (
          <label key={it.id} className={'plan-item' + (done ? ' done' : '')}>
            <input
              type="checkbox"
              checked={done}
              disabled={!editable}
              onChange={() => toggle.mutate({ id: it.id, done: !done }, { onError: () => toast('Não deu para salvar. Tente de novo.') })}
            />
            <span className="plan-box" aria-hidden>{done && <Mark m="✓" size={12} />}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="plan-text">{it.text}</span>
              <span className="plan-meta">
                {it.due_date && `até ${fmtDay(it.due_date + 'T12:00:00Z', false)}`}
                {it.due_date && done && ' · '}
                {done && `feito ${fmtDay(it.done_at!, false)}`}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** Aluno: planos de ação ativos, para ir marcando. */
export function StudentPlans() {
  const q = useMyPlans();
  if (q.isLoading) return <div className="skel-card" style={{ height: 180 }} />;
  const plans = q.data || [];
  if (!plans.length)
    return (
      <div className="dashed" style={{ padding: '28px 20px', fontSize: 15, color: 'var(--t3)' }}>
        Seu plano de ação aparece aqui depois da sessão de direcionamento. Você vai marcando cada passo, e a equipe acompanha.
      </div>
    );
  return (
    <>
      {plans.map((p) => (
        <div key={p.id} className="card stack" style={{ gap: 14 }}>
          <div>
            <div className="h-card">{p.title}</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>Criado {fmtDay(p.created_at, false)} · marque cada passo quando fizer. A equipe acompanha.</div>
          </div>
          <Progress p={p} />
          <Checklist p={p} editable />
        </div>
      ))}
    </>
  );
}

/** Equipe, na ficha do aluno: criar, acompanhar e cobrar. */
export function StaffPlans({ studentId, name, phone }: { studentId: string; name: string; phone: string }) {
  const q = usePlans(studentId);
  const qc = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('Plano de ação · direcionamento');
  const [text, setText] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['plans-staff'] });

  const create = async () => {
    const lines = text.split('\n').map((l) => l.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    if (!lines.length) return toast('Escreva pelo menos um passo.');
    const { data, error } = await supabase.from('action_plans').insert({ student_id: studentId, title: title.trim() || 'Plano de ação' }).select('id').single();
    if (error) return toast('Não deu para criar o plano.');
    const r = await supabase.from('action_items').insert(lines.map((t, i) => ({ plan_id: data.id, position: i, text: t })));
    if (r.error) return toast('O plano foi criado, mas os passos não salvaram.');
    setCreating(false);
    setText('');
    refresh();
    toast(`Plano enviado para ${name.split(' ')[0]}. Ele aparece em Sessões.`);
  };
  const archive = async (p: ActionPlan) => {
    await supabase.from('action_plans').update({ archived: !p.archived }).eq('id', p.id);
    refresh();
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div className="h-card">Planos de ação</div>
          <div style={{ fontSize: 14, color: 'var(--t3)' }}>O aluno marca os passos em Sessões. Sem avanço há {STALE_DAYS} dias ou mais, o plano aparece como parado no Painel.</div>
        </div>
        {!creating && <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Mark m="+" size={13} /> Novo plano</button>}
      </div>
      {creating && (
        <div className="card stack" style={{ gap: 12 }}>
          <label className="field"><span>Título</span><input className="input md" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label className="field">
            <span>Passos <small style={{ fontWeight: 400, color: 'var(--t3)' }}>(um por linha)</small></span>
            <textarea className="textarea" style={{ minHeight: 150 }} autoFocus placeholder={'Ex.:\nMandar 20 mensagens de prospecção para construtoras\nRefazer a capa do portfólio com a fachada mais forte\nEnviar a proposta revisada para o cliente X'} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-md" onClick={() => setCreating(false)}>Cancelar</button>
            <button className="btn btn-primary btn-md" style={{ flex: 1 }} disabled={!text.trim()} onClick={create}>Enviar para {name.split(' ')[0]}</button>
          </div>
        </div>
      )}
      {(q.data || []).length === 0 && !creating && <div className="dashed">{name.split(' ')[0]} ainda não tem plano de ação.</div>}
      {(q.data || []).map((p) => {
        const st = planStatus(p);
        const stale = !p.archived && !st.complete && st.idle >= STALE_DAYS;
        return (
          <div key={p.id} className="card stack" style={{ gap: 12, opacity: p.archived ? 0.6 : 1, borderColor: stale ? 'var(--warn)' : undefined }}>
            <div className="between" style={{ alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div className="h-card">{p.title}</div>
                <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>
                  Criado {fmtDay(p.created_at, false)}
                  {stale && <b style={{ color: 'var(--warn-t)', fontWeight: 600 }}> · parado há {st.idle} dias</b>}
                  {st.lastNudge && ` · cobrado ${fmtDay(st.lastNudge, false)}`}
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {!p.archived && !st.complete && <NudgeButton plan={p} name={name} phone={phone} />}
                <button className="btn btn-secondary btn-sm" onClick={() => archive(p)}>{p.archived ? 'Reativar' : 'Arquivar'}</button>
              </div>
            </div>
            <Progress p={p} />
            <Checklist p={p} editable={false} />
          </div>
        );
      })}
    </div>
  );
}

/** Abre o WhatsApp com a mensagem pronta e registra a cobrança. */
function NudgeButton({ plan, name, phone, small }: { plan: ActionPlan; name: string; phone: string; small?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const st = planStatus(plan);
  const next = plan.items.find((i) => !i.done_at);
  const msg = `Oi, ${name.split(' ')[0]}! Tudo bem? Passando para saber como está o seu plano de ação. Você já fez ${st.done} de ${st.total} passos${next ? ` — o próximo é "${next.text}"` : ''}. Está conseguindo aplicar? Se travou em algo, me conta que a gente te ajuda.`;
  const link = whatsappLink(phone, msg);
  const go = async () => {
    await supabase.from('plan_nudges').insert({ plan_id: plan.id, channel: link ? 'whatsapp' : 'manual' });
    qc.invalidateQueries({ queryKey: ['plans-staff'] });
    if (link) window.open(link, '_blank');
    else {
      await navigator.clipboard?.writeText(msg).catch(() => undefined);
      toast('Aluno sem WhatsApp no perfil. A mensagem foi copiada e a cobrança registrada.');
    }
  };
  return (
    <button className={'btn btn-sm ' + (small ? 'btn-secondary' : 'btn-primary')} onClick={go} title={msg}>
      <MessageCircle size={14} aria-hidden /> Cobrar
    </button>
  );
}

/** Painel: quem recebeu plano e não avança há STALE_DAYS dias ou mais. */
export function StalePlansCard({ students }: { students: { id: string; full_name: string; whatsapp: string; avatar_path: string | null; status: string }[] }) {
  const q = usePlans();
  const plans = (q.data || []).filter((p) => !p.archived);
  const rows = plans
    .map((p) => ({ p, st: planStatus(p), s: students.find((x) => x.id === p.student_id) }))
    .filter((r) => r.s && r.s.status !== 'encerrado' && !r.st.complete && r.st.idle >= STALE_DAYS)
    .sort((a, b) => b.st.idle - a.st.idle);
  const active = plans.filter((p) => !planStatus(p).complete).length;
  if (q.isLoading) return null;
  return (
    <div className="card" style={{ padding: '18px 20px' }}>
      <div className="between" style={{ alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <div className="h-card">Planos de ação parados</div>
        <span className="label">{rows.length} de {active} em andamento</span>
      </div>
      <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 2, marginBottom: 6 }}>Sem nenhum passo marcado há {STALE_DAYS} dias ou mais. Uma mensagem agora vale mais que uma sessão depois.</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--ok-t)', padding: '10px 0' }}>{active ? 'Todo mundo avançando. ✓' : 'Nenhum plano de ação em andamento ainda.'}</div>
      ) : (
        rows.map(({ p, st, s }) => (
          <div key={p.id} className="stale-row">
            <Avatar path={s!.avatar_path} name={s!.full_name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link to={`/equipe/aluno/${s!.id}?aba=sessoes`} className="stale-name">{s!.full_name}</Link>
              <div style={{ fontSize: 13, color: 'var(--t3)' }}>
                {st.done}/{st.total} passos · <b style={{ color: 'var(--warn-t)', fontWeight: 600 }}>parado há {st.idle} dias</b>
                {st.nudgedAfter ? ` · cobrado ${fmtDay(st.lastNudge!, false)}` : ' · ainda não cobrado'}
              </div>
            </div>
            <NudgeButton plan={p} name={s!.full_name} phone={s!.whatsapp} small />
          </div>
        ))
      )}
    </div>
  );
}
