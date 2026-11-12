import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { VERDICTS, type Verdict } from '../../shared/domain';
import type { DocState } from '../lib/data';

export function VerdictChip({ v, style }: { v: Verdict; style?: CSSProperties }) {
  const x = VERDICTS[v];
  return (
    <span className="chip" style={{ background: x.bg, color: x.fg, ...style }}>
      {x.mark} {x.label}
    </span>
  );
}

/** Chip de status de um documento (Ainda não enviado · Em análise · Em revisão · veredito). */
export function DocChip({ d }: { d: DocState }) {
  if (d.status === 'none') return <span className="chip chip-none">Ainda não enviado</span>;
  if (d.status === 'analise') return <span className="chip chip-soft">◌ Em análise</span>;
  if (d.status === 'revisao' || !d.latest?.verdict) return <span className="chip chip-soft">● Em revisão</span>;
  return <VerdictChip v={d.latest.verdict} />;
}

export function VersionChip({ verdict, style }: { verdict: Verdict | null; style?: CSSProperties }) {
  return verdict ? <VerdictChip v={verdict} style={style} /> : <span className="chip chip-soft" style={style}>● Em andamento</span>;
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="back">
      ‹ {children}
    </Link>
  );
}

export function PageHead({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="between" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}>
      <div>
        <h1 className="h-page">{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', marginTop: 24 }}>
      <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--err-bg)', color: 'var(--err)', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 700 }}>!</div>
      <div style={{ fontWeight: 700, fontSize: 19 }}>Não deu para carregar esta página</div>
      <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--t2)', maxWidth: 380 }}>Seus dados estão guardados. Confira a conexão e tente de novo.</div>
      <button className="btn btn-primary" style={{ marginTop: 10 }} onClick={onRetry}>
        Tentar de novo
      </button>
    </div>
  );
}

/** Esqueleto genérico de página, nos tamanhos do conteúdo real. */
export function PageSkeleton({ hero = true }: { hero?: boolean }) {
  return (
    <>
      <div className="skel" style={{ height: 30, width: 220 }} />
      <div className="skel light" style={{ height: 14, width: '60%', maxWidth: 420, borderRadius: 7 }} />
      {hero && <div className="skel" style={{ height: 150, borderRadius: 18 }} />}
      <div className="grid-auto">
        <div className="skel-card" />
        <div className="skel-card" />
      </div>
      <div className="skel-card" style={{ height: 200 }} />
    </>
  );
}

export function Loadable({ q, children, skeleton }: { q: { isLoading: boolean; isError: boolean; refetch: () => unknown }; children: () => ReactNode; skeleton?: ReactNode }) {
  if (q.isLoading) return <>{skeleton ?? <PageSkeleton />}</>;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  return <>{children()}</>;
}

export function FileIcon({ ext, small }: { ext: string; small?: boolean }) {
  return (
    <div
      style={{
        width: small ? 36 : 40,
        height: small ? 44 : 48,
        borderRadius: 6,
        background: small ? '#fff' : 'var(--alt2)',
        border: small ? '1px solid var(--b-card)' : 'none',
        display: 'grid',
        placeItems: 'center',
        fontSize: small ? 10 : 11,
        fontWeight: 700,
        color: 'var(--t3)',
        flex: 'none',
      }}
    >
      {ext.toUpperCase().slice(0, 4)}
    </div>
  );
}

export const extOf = (name: string | null | undefined, fallback = 'PDF') => (name?.includes('.') ? name.split('.').pop()! : fallback);

export function CheckIcon({ bg = 'var(--ok-bg)', fg = 'var(--ok)', mark = '✓', size = 22 }: { bg?: string; fg?: string; mark?: string; size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color: fg, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flex: 'none' }}>
      {mark}
    </div>
  );
}
