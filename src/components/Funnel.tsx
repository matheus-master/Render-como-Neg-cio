import type { Report } from '../lib/data';

/** Etapas do funil comercial, na ordem em que o lead anda. */
export const FUNNEL: { k: 'leads' | 'contacts' | 'responses' | 'appointments' | 'meetings' | 'proposals' | 'closed'; label: string; short: string }[] = [
  { k: 'leads', label: 'Leads prospectados', short: 'Leads' },
  { k: 'contacts', label: 'Contatos feitos', short: 'Contatos' },
  { k: 'responses', label: 'Respostas recebidas', short: 'Respostas' },
  { k: 'appointments', label: 'Agendamentos', short: 'Agendamentos' },
  { k: 'meetings', label: 'Reuniões feitas', short: 'Reuniões' },
  { k: 'proposals', label: 'Propostas enviadas', short: 'Propostas' },
  { k: 'closed', label: 'Projetos fechados', short: 'Fechados' },
];

export type FunnelKey = (typeof FUNNEL)[number]['k'];
export const sumFunnel = (reps: Report[]) =>
  Object.fromEntries(FUNNEL.map(({ k }) => [k, reps.reduce((a, r) => a + (Number(r[k]) || 0), 0)])) as Record<FunnelKey, number>;

const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) + '%' : '—');

/** Funil com barras proporcionais e a taxa de passagem de uma etapa para a próxima. */
export function FunnelBars({ v }: { v: Record<FunnelKey, number> }) {
  const max = Math.max(...FUNNEL.map(({ k }) => v[k]), 1);
  // A primeira etapa preenchida é a base da conversão geral (relatórios antigos não tinham "leads").
  const base = FUNNEL.find(({ k }) => v[k] > 0);
  return (
    <div className="funnel">
      {FUNNEL.map(({ k, label }, i) => {
        const prev = i > 0 ? v[FUNNEL[i - 1]!.k] : null;
        return (
          <div key={k} className="fn-row">
            <div className="fn-label">{label}</div>
            <div className="fn-track">
              <i style={{ width: `${Math.max(v[k] ? 2 : 0, (v[k] / max) * 100)}%` }} className={k === 'closed' ? 'end' : ''} />
            </div>
            <div className="fn-num">{v[k]}</div>
            <div className="fn-rate" title={prev !== null ? `De ${FUNNEL[i - 1]!.short.toLowerCase()} para ${FUNNEL[i]!.short.toLowerCase()}` : undefined}>
              {prev !== null ? rate(v[k], prev) : ''}
            </div>
          </div>
        );
      })}
      {base && base.k !== 'closed' && (
        <div className="fn-total">
          De {base.short.toLowerCase()} a fechamento: <b>{rate(v.closed, v[base.k])}</b>
          {v.proposals > 0 && <> · Propostas que viraram projeto: <b>{rate(v.closed, v.proposals)}</b></>}
        </div>
      )}
    </div>
  );
}
