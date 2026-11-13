import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { BackLink, ErrorState, PageHead, Mark } from '../components/ui';
import { useReports, type Report } from '../lib/data';
import { fmtBRL, fmtDay, fmtPeriod } from '../lib/format';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';


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
            <span className="plus"><Mark m="+" size={16} /></span>Novo relatório
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
          <Journey reps={reps} />
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="rep-row rep-head">
              <div>Quinzena</div>
              <div>Faturamento</div>
              <div>Prospecção</div>
              <div>Destaque</div>
              <div />
            </div>
            {reps.map((r) => (
              <Link key={r.id} to={`/relatorios/${r.id}`} className="rep-row">
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{fmtPeriod(r.period_start, r.period_end)}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>enviado {fmtDay(r.created_at, false)}</div>
                </div>
                <div className="evo-num" style={{ fontSize: 18, marginTop: 0 }}>{fmtBRL(r.revenue)}</div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--t2)', whiteSpace: 'nowrap' }}>
                  {r.contacts} cont. · {r.proposals} prop. · {r.closed} fech.
                </div>
                <div style={{ fontSize: 14, color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{r.wins || '—'}</div>
                <div style={{ color: 'var(--t4)', display: 'flex', justifyContent: 'flex-end' }}>
                  <Mark m="›" size={18} />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


/** Conquistas e dificuldades de cada quinzena, numa linha do tempo horizontal (da mais antiga para a mais recente). */
function Journey({ reps }: { reps: Report[] }) {
  const items = reps.filter((r) => r.wins || r.struggles).slice(0, 12).reverse();
  const scroller = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  // Se não couber tudo, começa mostrando a quinzena mais recente e liga as setas.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const check = () => {
      const o = el.scrollWidth > el.clientWidth + 2;
      setOverflow(o);
      if (o) el.scrollLeft = el.scrollWidth;
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [items.length]);
  if (!items.length) return null;
  const step = (dir: number) => scroller.current?.scrollBy({ left: dir * 260, behavior: 'smooth' });

  return (
    <div className="card" style={{ padding: '22px 0 4px' }}>
      <div className="between" style={{ alignItems: 'center', padding: '0 22px 10px', flexWrap: 'wrap' }}>
        <div>
          <div className="h-card">Conquistas e dificuldades</div>
          <div style={{ fontSize: 14, color: 'var(--t3)', marginTop: 2 }}>O que marcou cada quinzena, da mais antiga para a mais recente.</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="label">{items.length} quinzenas</span>
          {overflow && (
            <>
              <button className="btn btn-secondary btn-sm" style={{ width: 34, padding: 0 }} aria-label="Quinzenas anteriores" onClick={() => step(-1)}>
                <Mark m="←" size={15} />
              </button>
              <button className="btn btn-secondary btn-sm" style={{ width: 34, padding: 0 }} aria-label="Quinzenas seguintes" onClick={() => step(1)}>
                <Mark m="→" size={15} />
              </button>
            </>
          )}
        </div>
      </div>
      <div ref={scroller} className="timeline-h" tabIndex={overflow ? 0 : -1} aria-label="Linha do tempo de conquistas e dificuldades">
        <div className="tl-track">
          {items.map((r, i) => {
            const last = i === items.length - 1;
            return (
              <div key={r.id} className={'tl-col' + (last ? ' now' : ' past')}>
                <div className="tl-head" aria-hidden={false}>
                  <span className="tl-dot" />
                  <span className="tl-line" />
                  <span className="tl-pin" />
                  <span className="tl-when">
                    {last && <b>Agora</b>}
                    {fmtPeriod(r.period_start, r.period_end)}
                  </span>
                </div>
                <div className="tl-card">
                  <div className="tl-rev">{fmtBRL(r.revenue)}</div>
                  {r.wins && (
                    <div className="tl-item">
                      <span style={{ color: 'var(--ok)' }}><Mark m="★" size={13} /></span>
                      <span>{r.wins}</span>
                    </div>
                  )}
                  {r.struggles && (
                    <div className="tl-item" style={{ color: 'var(--t2)' }}>
                      <span style={{ color: 'var(--warn)' }}><Mark m="!" size={13} /></span>
                      <span>{r.struggles}</span>
                    </div>
                  )}
                  <Link to={`/relatorios/${r.id}`} className="link" style={{ marginTop: 'auto', paddingTop: 6, fontSize: 13 }}>
                    Ver relatório <Mark m="→" size={13} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Evolution({ reps }: { reps: Report[] }) {
  const chrono = [...reps].reverse().slice(-12);
  const max = Math.max(...chrono.map((r) => r.revenue), 1);
  const last = reps[0]!, prev = reps[1];
  const delta = prev && prev.revenue > 0 ? Math.round(((last.revenue - prev.revenue) / prev.revenue) * 100) : null;
  const total = reps.reduce((a, r) => a + r.revenue, 0);
  const avg = total / reps.length;
  const closed = reps.reduce((a, r) => a + r.closed, 0);
  const stats: [string, string][] = [
    ['Última quinzena', fmtBRL(last.revenue)],
    ['Total registrado', fmtBRL(total)],
    ['Média por quinzena', fmtBRL(avg)],
    ['Propostas fechadas', String(closed)],
  ];

  return (
    <div className="card evo">
      <div className="evo-stats">
        <div className="between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div className="h-card">Sua evolução</div>
          {delta !== null && (
            <span className="chip" style={{ background: delta >= 0 ? 'var(--ok-bg)' : 'var(--err-bg)', color: delta >= 0 ? 'var(--ok-t)' : 'var(--err-t)' }}>
              {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}%
            </span>
          )}
        </div>
        <div className="evo-grid">
          {stats.map(([l, v]) => (
            <div key={l}>
              <div className="label">{l}</div>
              <div className="evo-num">{v}</div>
            </div>
          ))}
        </div>
        {delta !== null && <div style={{ fontSize: 13, color: 'var(--t3)' }}>Variação da última quinzena em relação à anterior.</div>}
      </div>
      {chrono.length > 1 && (
        <div className="evo-chart" role="img" aria-label={'Faturamento por quinzena: ' + chrono.map((r) => `${fmtPeriod(r.period_start, r.period_end)} ${fmtBRL(r.revenue)}`).join(', ')}>
          <div className="evo-bars">
            {chrono.map((r, i) => {
              const isLast = i === chrono.length - 1;
              return (
                <div key={r.id} className="evo-col">
                  <div className="mono" style={{ fontSize: 11, color: isLast ? 'var(--t)' : 'var(--t3)', whiteSpace: 'nowrap' }}>
                    {r.revenue >= 1000 ? (r.revenue / 1000).toFixed(1).replace('.', ',') + 'k' : r.revenue}
                  </div>
                  <div className={'evo-bar' + (isLast ? ' now' : '')} style={{ height: `${Math.max(3, (r.revenue / max) * 100)}%` }} />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            {chrono.map((r) => (
              <div key={r.id} className="mono" style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 10, color: 'var(--t3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fmtDay(r.period_start + 'T12:00:00Z', false)}
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
        <div style={{ width: 28, height: 28, borderRadius: 8, background: color, color: '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}><Mark m={icon} size={15} /></div>
        <div style={{ fontWeight: 600, fontSize: 16 }}>{title}</div>
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
            <div style={{ fontWeight: 600, fontSize: 24, marginTop: 6 }}>{fmtBRL(r.revenue)}</div>
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
        <h1 style={{ fontWeight: 600, fontSize: 28, marginTop: -12 }}>Relatório quinzenal</h1>

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
