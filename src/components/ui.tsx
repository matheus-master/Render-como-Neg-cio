import { AlertTriangle, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronRight, Lock, Mail, Play, Plus, RotateCcw, Star, X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { VERDICTS, type Verdict } from '../../shared/domain';
import type { DocState } from '../lib/data';

/**
 * Converte as marcas do domínio (✓ ! ↺ ★ → 🔒) em ícones de traço.
 * Números e outros textos passam direto (ex.: índice "1", "2" dos pontos a ajustar).
 */
export function Mark({ m, size = 14 }: { m: string; size?: number }) {
  const p = { size, strokeWidth: 2.25, 'aria-hidden': true } as const;
  switch (m) {
    case '✓': return <Check {...p} />;
    case '!': return <AlertTriangle {...p} size={size - 1} />;
    case '↺': return <RotateCcw {...p} />;
    case '★': return <Star {...p} />;
    case '→': return <ArrowRight {...p} />;
    case '🔒': return <Lock {...p} />;
    case '›': return <ChevronRight {...p} />;
    case '←': return <ArrowLeft {...p} />;
    case '↑': return <ArrowUp {...p} />;
    case '▶': return <Play {...p} size={size - 3} fill="currentColor" />;
    case '+': return <Plus {...p} />;
    case '×': return <X {...p} />;
    case '✉': return <Mail {...p} />;
    default: return <span className="mono" style={{ fontSize: size - 2, fontWeight: 500 }}>{m}</span>;
  }
}

/** Etiqueta de status: ponto colorido + texto em mono. */
export function Chip({ children, tone = 'none', live, style }: { children: ReactNode; tone?: 'none' | 'soft' | 'ok' | 'warn' | 'err' | 'ink'; live?: boolean; style?: CSSProperties }) {
  const tones: Record<string, CSSProperties> = {
    none: {},
    soft: { background: 'var(--ac-soft)', color: 'var(--ac)' },
    ok: { background: 'var(--ok-bg)', color: 'var(--ok-t)' },
    warn: { background: 'var(--warn-bg)', color: 'var(--warn-t)' },
    err: { background: 'var(--err-bg)', color: 'var(--err-t)' },
    ink: { background: 'var(--alt2)', color: 'var(--t2)' },
  };
  return (
    <span className={'chip' + (tone === 'none' ? ' chip-none' : '') + (live ? ' chip-live' : '')} style={{ ...tones[tone], ...style }}>
      <span className="dot" />
      {children}
    </span>
  );
}

export function VerdictChip({ v, style }: { v: Verdict; style?: CSSProperties }) {
  const x = VERDICTS[v];
  return (
    <span className="chip" style={{ background: x.bg, color: x.fg, ...style }}>
      <Mark m={x.mark} size={12} />
      {x.label}
    </span>
  );
}

/** Status de um documento: não enviado · em análise · em revisão · veredito. */
export function DocChip({ d }: { d: DocState }) {
  if (d.status === 'none') return <Chip>Não enviado</Chip>;
  if (d.status === 'analise') return <Chip tone="soft" live>Em análise</Chip>;
  if (d.status === 'revisao' || !d.latest?.verdict) return <Chip tone="soft" live>Em revisão</Chip>;
  return <VerdictChip v={d.latest.verdict} />;
}

export function VersionChip({ verdict, style }: { verdict: Verdict | null; style?: CSSProperties }) {
  return verdict ? <VerdictChip v={verdict} style={style} /> : <Chip tone="soft" live style={style}>Em andamento</Chip>;
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="back">
      <ArrowLeft size={14} strokeWidth={2} aria-hidden />
      {children}
    </Link>
  );
}

/** Cabeçalho de página (mesma linguagem do ScreenHead do kit: título grande, explicação curta). */
export function PageHead({ title, sub, right, kicker }: { title: string; sub?: ReactNode; right?: ReactNode; kicker?: string }) {
  return (
    <header className="sh">
      {kicker && <div className="k-eyebrow">{kicker}</div>}
      <div className="sh-top">
        <h1 className="sh-title">{title}</h1>
        {right && <div className="sh-right">{right}</div>}
      </div>
      {sub && <p className="sh-sub">{sub}</p>}
    </header>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card" style={{ padding: '44px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', marginTop: 24 }}>
      <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--err-bg)', color: 'var(--err)', display: 'grid', placeItems: 'center' }}>
        <AlertTriangle size={20} strokeWidth={2} aria-hidden />
      </div>
      <div style={{ fontWeight: 600, fontSize: 18, letterSpacing: '-.015em', marginTop: 6 }}>Não deu para carregar esta página</div>
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
      <div className="skel" style={{ height: 34, width: 240 }} />
      <div className="skel light" style={{ height: 14, width: '60%', maxWidth: 420 }} />
      {hero && <div className="skel" style={{ height: 170, borderRadius: 12 }} />}
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
      className="mono"
      style={{
        width: small ? 36 : 40,
        height: small ? 44 : 48,
        borderRadius: 4,
        background: '#fff',
        border: '1px solid var(--line)',
        borderTopRightRadius: 10,
        display: 'grid',
        placeItems: 'center',
        fontSize: small ? 9 : 10,
        fontWeight: 500,
        letterSpacing: '.04em',
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
    <div style={{ width: size, height: size, borderRadius: 6, background: bg, color: fg, display: 'grid', placeItems: 'center', flex: 'none' }}>
      <Mark m={mark} size={Math.round(size * 0.58)} />
    </div>
  );
}

/**
 * Número que "conta" até o valor quando aparece (900 ms, desacelerando no fim).
 * Aceita texto já formatado ("R$ 11.450", "295", "42%"): anima só a parte numérica.
 */
export function Num({ children }: { children: string | number }) {
  const text = String(children);
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const m = /\d[\d.]*(?:,\d+)?/.exec(text);
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!m || reduce) return setShown(text);
    const raw = m[0];
    const decimals = raw.includes(',') ? raw.split(',')[1]!.length : 0;
    const target = Number(raw.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(target) || target === 0) return setShown(text);
    const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(text.slice(0, m.index) + (k < 1 ? fmt(target * e) : raw) + text.slice(m.index + raw.length));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  return <>{shown}</>;
}
