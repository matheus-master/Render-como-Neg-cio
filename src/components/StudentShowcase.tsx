import { useEffect, useState } from 'react';
import { Mark } from './ui';

/**
 * Cena animada da tela de entrada do aluno: a jornada da mentoria em loop.
 * Material enviado → revisão da equipe → aprovado (+XP) → sobe de nível → faturamento e Instagram crescem.
 */
const LEVELS = ['Pioneiro', 'Criador', 'Elite', 'Titã', 'Lenda', 'Magnata'];
const STEPS = 6;
const BARS = [22, 30, 27, 41, 48, 56];

function useStep() {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [step, setStep] = useState(reduce ? 4 : 0);
  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS), 2300);
    return () => clearInterval(t);
  }, [reduce]);
  return step;
}

/** Número que corre até o valor quando ele muda. */
function useCount(target: number, ms = 900) {
  const [v, setV] = useState(target);
  useEffect(() => {
    const from = v;
    if (from === target) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return v;
}

const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR');

export function StudentShowcase() {
  const step = useStep();
  const up = step >= 3; // subiu de nível
  const doc = step === 0 ? 'sent' : step === 1 ? 'review' : 'ok';
  const xp = useCount(step < 2 ? 1050 : 1170);
  const xpMax = 1170;
  const rev = useCount(step >= 4 ? 5200 : 3100);
  const fol = useCount(step >= 4 ? 2481 : 1964);
  const bars = step >= 4 ? [...BARS, 78] : [...BARS, 6];

  return (
    <div className="sc" aria-hidden>
      <div className="sc-glow" />

      {/* Devolutiva */}
      <div className="sc-card sc-doc">
        <div className="sc-doc-ico"><Mark m="→" size={14} /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="sc-mini">Documentos</div>
          <div className="sc-doc-t">Proposta para construtoras</div>
          <div className="sc-steps">
            <i className={doc !== 'sent' ? 'on' : 'cur'} />
            <i className={doc === 'ok' ? 'on' : doc === 'review' ? 'cur' : ''} />
            <i className={doc === 'ok' ? 'on' : ''} />
          </div>
        </div>
        <span key={doc} className={'sc-chip ' + doc}>
          {doc === 'sent' ? 'Enviado' : doc === 'review' ? 'Em revisão' : <><Mark m="✓" size={11} /> Aprovado</>}
        </span>
      </div>

      {/* +XP */}
      <div key={'xp' + (step === 2)} className={'sc-pop' + (step === 2 ? ' show' : '')}>+120 XP</div>

      {/* Nível */}
      <div className={'sc-card sc-level' + (up ? ' up' : '')}>
        <div className="between" style={{ alignItems: 'baseline' }}>
          <span className="sc-mini" style={{ color: 'var(--gold)' }}>Nível {up ? 3 : 2} de 6</span>
          {up && <span className="sc-badge">Subiu de nível</span>}
        </div>
        <div className="sc-level-name" key={up ? 'e' : 'c'}>{up ? 'Elite' : 'Criador'}</div>
        <div className="sc-track"><i style={{ width: up ? '8%' : `${(xp / xpMax) * 100}%` }} /></div>
        <div className="sc-row">
          <span className="mono">{up ? '0/1360' : `${xp}/${xpMax}`} XP</span>
          <span>Próximo: <b>{up ? 'Titã' : 'Elite'}</b></span>
        </div>
      </div>

      {/* Faturamento */}
      <div className="sc-card sc-rev">
        <div className="between" style={{ alignItems: 'baseline' }}>
          <span className="sc-mini">Faturamento da quinzena</span>
          <span className={'sc-delta' + (step >= 4 ? ' show' : '')}>↑ 68%</span>
        </div>
        <div className="sc-rev-n">{brl(rev)}</div>
        <div className="sc-bars">
          {bars.map((h, i) => (
            <i key={i} className={i === bars.length - 1 ? 'last' : ''} style={{ height: h + '%' }} />
          ))}
        </div>
      </div>

      {/* Instagram */}
      <div className="sc-card sc-ig">
        <div className="sc-ig-av" />
        <div>
          <div className="sc-ig-n">{fol.toLocaleString('pt-BR')}</div>
          <div className="sc-mini" style={{ letterSpacing: '.06em' }}>seguidores</div>
        </div>
        <span className={'sc-ig-up' + (step >= 4 ? ' show' : '')}>↑</span>
      </div>

      {/* Escada de níveis */}
      <div className="sc-ladder">
        {LEVELS.map((l, i) => (
          <span key={l} className={i < (up ? 2 : 1) ? 'done' : i === (up ? 2 : 1) ? 'now' : ''}>
            <i />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}
