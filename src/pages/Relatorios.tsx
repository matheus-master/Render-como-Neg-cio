import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { BackLink, ErrorState, PageHead } from '../components/ui';
import { useReports, type Report } from '../lib/data';
import { fmtBRL, fmtDay, fmtPeriod } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';

const closedLabel = (n: number) => `${n} fechada${n === 1 ? '' : 's'}`;
const prospection = (r: Report) => `${r.contacts} contatos · ${r.proposals} propostas · ${closedLabel(r.closed)}`;

// ---------------------------------------------------------------------
// Lista + evolução
// ---------------------------------------------------------------------
export function Relatorios() {
  const q = useReports();
  const reps = q.data || [];
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
        <>
          <div className="skel-card" style={{ height: 220 }} />
          <div className="skel-card" style={{ height: 180 }} />
        </>
      ) : q.isError ? (
        <ErrorState onRetry={q.refetch} />
      ) : reps.length === 0 ? (
        <div className="dashed" style={{ gap: 6 }}>
          <div style={{ fontWeight: 600, fontSize: 17 }}>Nenhum relatório ainda</div>
          <div style={{ fontSize: 15, color: 'var(--t3)', lineHeight: 1.45, maxWidth: 420 }}>
            A cada quinzena, registre faturamento, prospecção, conquistas e dificuldades. Sua evolução aparece aqui e no Início.
          </div>
          <Link to="/relatorios/novo" className="btn btn-primary" style={{ marginTop: 8 }}>
            Enviar primeiro relatório
          </Link>
        </div>
      ) : (
        <>
          <Evolution reps={reps} />
          <div className="card" style={{ padding: '4px 20px' }}>
            {reps.map((r) => (
              <Link key={r.id} to={`/relatorios/${r.id}`} className="divrow" style={{ display: 'block', padding: '18px 0', color: 'inherit', textDecoration: 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: '8px 16px', alignItems: 'center' }}>
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
                    <div style={{ fontSize: 15 }}>{prospection(r)}</div>
                  </div>
                </div>
                {r.wins && (
                  <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.45, color: 'var(--t2)', display: 'flex', gap: 8 }}>
                    <span style={{ color: 'var(--ok)', fontWeight: 700 }}>★</span>
                    <span style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.wins}</span>
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: 'var(--ac)' }}>Ver relatório ›</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Evolution({ reps }: { reps: Report[] }) {
  const chrono = [...reps].reverse().slice(-8);
  const max = Math.max(...chrono.map((r) => r.revenue), 1);
  const last = reps[0]!, prev = reps[1];
  const delta = prev && prev.revenue > 0 ? Math.round(((last.revenue - prev.revenue) / prev.revenue) * 100) : null;
  const total = reps.reduce((a, r) => a + r.revenue, 0);
  const avg = total / reps.length;
  const closed = reps.reduce((a, r) => a + r.closed, 0);

  return (
    <div className="card stack" style={{ gap: 18 }}>
      <div className="between" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div className="h-card">Sua evolução</div>
        {delta !== null && (
          <span className="chip" style={{ background: delta >= 0 ? 'var(--ok-bg)' : 'var(--err-bg)', color: delta >= 0 ? 'var(--ok-t)' : 'var(--err-t)' }}>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% vs. quinzena anterior
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {[
          ['Total registrado', fmtBRL(total)],
          ['Média por quinzena', fmtBRL(avg)],
          ['Propostas fechadas', String(closed)],
        ].map(([l, v]) => (
          <div key={l} style={{ background: 'var(--alt)', borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
            <div style={{ fontSize: 12, color: 'var(--t3)', fontWeight: 600 }}>{l}</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginTop: 2, whiteSpace: 'nowrap' }}>{v}</div>
          </div>
        ))}
      </div>
      {chrono.length > 1 && (
        <div role="img" aria-label={'Faturamento por quinzena: ' + chrono.map((r) => `${fmtPeriod(r.period_start, r.period_end)} ${fmtBRL(r.revenue)}`).join(', ')}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
            {chrono.map((r, i) => {
              const isLast = i === chrono.length - 1;
              return (
                <div key={r.id} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isLast ? 'var(--ac)' : 'var(--t3)', whiteSpace: 'nowrap' }}>{r.revenue >= 1000 ? (r.revenue / 1000).toFixed(1).replace('.', ',') + 'k' : r.revenue}</div>
                  <div style={{ width: '100%', maxWidth: 48, height: Math.max(4, (r.revenue / max) * 110), borderRadius: '6px 6px 2px 2px', background: isLast ? 'var(--ac)' : 'color-mix(in oklab, var(--ac) 35%, #fff)' }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {chrono.map((r) => (
              <div key={r.id} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 11, color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fmtPeriod(r.period_start, r.period_end)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Relatório enviado (só leitura)
// ---------------------------------------------------------------------
export function RelatorioDetalhe() {
  const { id } = useParams();
  const q = useReports();
  if (q.isLoading) return <div className="page"><div className="flow"><div className="skel-card" style={{ height: 400 }} /></div></div>;
  if (q.isError) return <div className="page"><ErrorState onRetry={q.refetch} /></div>;
  const reps = q.data || [];
  const i = reps.findIndex((r) => r.id === id);
  if (i < 0) return <Navigate to="/relatorios" replace />;
  const r = reps[i]!, prev = reps[i + 1];
  const delta = prev && prev.revenue > 0 ? Math.round(((r.revenue - prev.revenue) / prev.revenue) * 100) : null;

  const Text = ({ icon, color, title, body }: { icon: string; color: string; title: string; body: string }) => (
    <div className="card stack" style={{ gap: 8 }}>
      <div className="row" style={{ gap: 10 }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 700, flex: 'none' }}>{icon}</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: body ? 'var(--t)' : 'var(--t3)', whiteSpace: 'pre-wrap' }}>{body || 'Não preenchido neste relatório.'}</div>
    </div>
  );

  return (
    <div className="page">
      <div className="flow">
        <BackLink to="/relatorios">Relatórios</BackLink>
        <div style={{ marginTop: -10 }}>
          <div style={{ fontSize: 14, color: 'var(--t3)' }}>Relatório quinzenal</div>
          <div className="h-flow">{fmtPeriod(r.period_start, r.period_end)}</div>
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 2 }}>Enviado {fmtDay(r.created_at, false)} · só leitura</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="label">Faturamento</div>
            <div style={{ fontWeight: 700, fontSize: 24, marginTop: 6 }}>{fmtBRL(r.revenue)}</div>
            {delta !== null && (
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, color: delta >= 0 ? 'var(--ok-t)' : 'var(--err-t)' }}>
                {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% vs. anterior
              </div>
            )}
          </div>
          <div className="card" style={{ padding: 16 }}>
            <div className="label">Prospecção</div>
            <div style={{ fontSize: 15, lineHeight: 1.6, marginTop: 6 }}>
              <b>{r.contacts}</b> contatos
              <br />
              <b>{r.proposals}</b> propostas enviadas
              <br />
              <b>{r.closed}</b> {r.closed === 1 ? 'fechada' : 'fechadas'}
            </div>
          </div>
        </div>
        <Text icon="★" color="var(--ok)" title="Maiores conquistas" body={r.wins} />
        <Text icon="!" color="var(--warn)" title="Maiores dificuldades" body={r.struggles} />
        <Text icon="→" color="var(--ac)" title="Foco da próxima quinzena" body={r.next_focus} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Novo relatório
// ---------------------------------------------------------------------
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
  const [f, setF] = useState({ start: a, end: b, revenue: '', contacts: '', proposals: '', closed: '', wins: '', struggles: '', next_focus: '' });
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.')) || 0;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const ok = f.start && f.end && f.end >= f.start && f.revenue.trim() !== '' && f.wins.trim() !== '' && f.struggles.trim() !== '';

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    const { error } = await supabase.from('reports').insert({
      period_start: f.start,
      period_end: f.end,
      revenue: num(f.revenue),
      contacts: num(f.contacts),
      proposals: num(f.proposals),
      closed: num(f.closed),
      wins: f.wins.trim(),
      struggles: f.struggles.trim(),
      next_focus: f.next_focus.trim(),
    });
    setBusy(false);
    if (error) return toast('O relatório não foi enviado. Tente de novo.');
    await qc.invalidateQueries({ queryKey: ['reports'] });
    toast('Relatório enviado.');
    nav('/relatorios');
  };

  const numField = (k: 'revenue' | 'contacts' | 'proposals' | 'closed', label: string, ph: string, mode: 'numeric' | 'decimal' = 'numeric') => (
    <label className="field" style={{ minWidth: 0 }}>
      <span>{label}</span>
      <input className="input md" inputMode={mode} placeholder={ph} value={f[k]} onChange={set(k)} />
    </label>
  );
  const textField = (k: 'wins' | 'struggles' | 'next_focus', label: string, ph: string, required: boolean) => (
    <label className="field">
      <span>
        {label}
        {!required && <span style={{ fontWeight: 400, color: 'var(--t3)' }}> (opcional)</span>}
      </span>
      <textarea className="textarea" placeholder={ph} value={f[k]} onChange={set(k)} />
    </label>
  );

  return (
    <div className="page">
      <div className="flow">
        <BackLink to="/relatorios">Relatórios</BackLink>
        <h1 style={{ fontWeight: 700, fontSize: 28, marginTop: -12 }}>Relatório quinzenal</h1>

        <div className="card stack" style={{ gap: 14 }}>
          <div className="h-card">Período e números</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            <label className="field" style={{ minWidth: 0 }}>
              <span>De</span>
              <input className="input md" style={{ minWidth: 0, padding: '0 10px' }} type="date" value={f.start} onChange={set('start')} />
            </label>
            <label className="field" style={{ minWidth: 0 }}>
              <span>Até</span>
              <input className="input md" style={{ minWidth: 0, padding: '0 10px' }} type="date" value={f.end} onChange={set('end')} />
            </label>
          </div>
          {numField('revenue', 'Faturamento na quinzena (R$)', 'Ex.: 3.150', 'decimal')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
            {numField('contacts', 'Contatos', '0')}
            {numField('proposals', 'Propostas', '0')}
            {numField('closed', 'Fechadas', '0')}
          </div>
        </div>

        <div className="card stack" style={{ gap: 14 }}>
          <div className="h-card">Como foi a quinzena</div>
          {textField('wins', 'Maiores conquistas', 'Ex.: fechei meu primeiro contrato com construtora.', true)}
          {textField('struggles', 'Maiores dificuldades', 'Ex.: o cliente pediu muitas alterações e atrasou a entrega.', true)}
          {textField('next_focus', 'Foco da próxima quinzena', 'Ex.: enviar 10 propostas para escritórios.', false)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn btn-primary btn-lg" disabled={!ok || busy} onClick={save}>
            {busy ? 'Enviando…' : 'Enviar relatório'}
          </button>
          <div style={{ fontSize: 13, color: 'var(--t3)', textAlign: 'center' }}>
            {ok ? 'Depois de enviado, o relatório fica disponível para consulta.' : 'Preencha faturamento, conquistas e dificuldades para enviar.'}
          </div>
        </div>
      </div>
    </div>
  );
}
