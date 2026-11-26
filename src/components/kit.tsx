/**
 * Kit de telas do aluno, no padrão "tarefas familiares, menos para lembrar":
 * cabeçalho com voltar, um "Próximo" em destaque, linhas grandes com ícone,
 * "Feito" em menta, botões grandes com palavra e ícone, aviso, "Ficou com
 * dúvida?" e tela de confirmação com Desfazer.
 */
import { Check, ChevronLeft, ChevronRight, CircleHelp, Info, Square, Volume2, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

type Tone = 'blue' | 'mint' | 'amber' | 'red' | 'gray' | 'navy';
type Act = { label: string; to?: string; onClick?: () => void; Icon?: LucideIcon; disabled?: boolean };

/** Coluna central da tela (estilo app): largura confortável de leitura. */
export function Screen({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <div className={'screen' + (wide ? ' wide' : '')}>{children}</div>;
}

/** Cabeçalho: voltar (quadrado branco) + título grande; abaixo, data à esquerda e situação à direita. */
export function ScreenHead({ back, title, sub, right, date, status }: { back?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; date?: ReactNode; status?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="sh">
      <div className="sh-top">
        {back && (
          <button className="sh-back" aria-label="Voltar" onClick={() => (window.history.length > 1 ? nav(-1) : nav(back))}>
            <ChevronLeft size={22} strokeWidth={2.2} aria-hidden />
          </button>
        )}
        <h1 className="sh-title">{title}</h1>
        {right && <div className="sh-right">{right}</div>}
      </div>
      {(date || status) && (
        <div className="sh-meta">
          <span>{date}</span>
          {status}
        </div>
      )}
      {sub && <p className="sh-sub">{sub}</p>}
    </header>
  );
}

/** Situação em pílula com ponto ("• Agendado"). */
export function Pill({ tone = 'mint', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={'k-pill ' + tone}><i />{children}</span>;
}

export function Tile({ Icon, tone = 'blue', size = 'md' }: { Icon: LucideIcon; tone?: Tone; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'lg' ? 26 : size === 'sm' ? 19 : 22;
  return <span className={`k-tile ${tone} ${size}`}><Icon size={px} strokeWidth={1.9} aria-hidden /></span>;
}

function ActLink({ a, className, children }: { a: Act; className: string; children: ReactNode }) {
  if (a.to) return <Link to={a.to} className={className} aria-disabled={a.disabled}>{children}</Link>;
  return <button className={className} onClick={a.onClick} disabled={a.disabled}>{children}</button>;
}

/** Botão grande: ícone à esquerda, palavra no centro. Um principal por tela; os outros à vista. */
export function BigButton({ a, variant = 'primary' }: { a: Act; variant?: 'primary' | 'secondary' | 'soft' | 'white' | 'danger' }) {
  return (
    <ActLink a={a} className={'k-big ' + variant}>
      {a.Icon ? <a.Icon size={22} strokeWidth={2} aria-hidden /> : <span />}
      <span>{a.label}</span>
      <span />
    </ActLink>
  );
}

/** Cartão marinho do que vem agora: título, quando, e uma ação. "Depois" fica como texto, sem competir. */
export function NextUp({ label = 'Próximo', when, Icon, title, kind, meta, primary, later }: { label?: string; when?: ReactNode; Icon: LucideIcon; title: ReactNode; kind?: ReactNode; meta?: ReactNode; primary?: Act; later?: Act }) {
  return (
    <section className="k-next" aria-label={label}>
      <div className="k-next-top"><span>{label}</span>{when && <span>{when}</span>}</div>
      <div className="k-next-body">
        <Tile Icon={Icon} tone="navy" size="lg" />
        <div style={{ minWidth: 0 }}>
          <div className="k-next-title">{title}</div>
          {kind && <div className="k-next-kind">{kind}</div>}
          {meta && <div className="k-next-meta">{meta}</div>}
        </div>
      </div>
      {primary && <ActLink a={primary} className="k-next-btn">{primary.Icon && <primary.Icon size={19} aria-hidden />}{primary.label}</ActLink>}
      {later && <ActLink a={later} className="k-next-later">{later.label}</ActLink>}
    </section>
  );
}

/** Título de seção ("Mais tarde", "Feito"). */
export function Section({ title, right, children }: { title: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="k-sec">
      <div className="k-sec-head"><h2>{title}</h2>{right}</div>
      <div className="k-sec-list">{children}</div>
    </section>
  );
}

/** Linha grande: ícone, (hora), título, sub e seta. */
export function Row({ Icon, tone = 'blue', when, title, sub, to, onClick, right }: { Icon: LucideIcon; tone?: Tone; when?: ReactNode; title: ReactNode; sub?: ReactNode; to?: string; onClick?: () => void; right?: ReactNode }) {
  const inner = (
    <>
      <Tile Icon={Icon} tone={tone} />
      <span className="k-row-main">
        {when && <span className="k-row-when">{when}</span>}
        <b>{title}</b>
        {sub && <span className="k-row-sub">{sub}</span>}
      </span>
      {right ?? (to || onClick ? <ChevronRight size={20} className="k-row-chev" aria-hidden /> : null)}
    </>
  );
  if (to) return <Link to={to} className="k-row">{inner}</Link>;
  if (onClick) return <button className="k-row" onClick={onClick}>{inner}</button>;
  return <div className="k-row">{inner}</div>;
}

/** Linha de algo concluído: menta, com o círculo verde. */
export function DoneRow({ title, sub, to }: { title: ReactNode; sub?: ReactNode; to?: string }) {
  const inner = (
    <>
      <span className="k-done-check"><Check size={20} strokeWidth={2.6} aria-hidden /></span>
      <span className="k-row-main"><b>{title}</b>{sub && <span className="k-row-sub">{sub}</span>}</span>
      {to && <ChevronRight size={20} className="k-row-chev" aria-hidden />}
    </>
  );
  return to ? <Link to={to} className="k-row done">{inner}</Link> : <div className="k-row done">{inner}</div>;
}

/** Aviso curto em menta, com o "i". */
export function Note({ children, tone = 'mint' }: { children: ReactNode; tone?: 'mint' | 'amber' | 'blue' }) {
  return <div className={'k-note ' + tone}><Info size={20} aria-hidden /><div>{children}</div></div>;
}

/** "Ficou com dúvida?" — sempre perto da decisão, nunca escondido. */
export function HelpCard({ title = 'Ficou com dúvida?', sub, to }: { title?: string; sub: ReactNode; to: string }) {
  return (
    <Link to={to} className="k-help">
      <CircleHelp size={24} aria-hidden />
      <span className="k-row-main"><b>{title}</b><span className="k-row-sub">{sub}</span></span>
      <ChevronRight size={20} aria-hidden />
    </Link>
  );
}

/** Cartão de detalhe: ícone + rótulo + título; depois a hora, a pergunta e um aviso. */
export function DetailCard({ Icon, tone = 'blue', eyebrow, title, time, when, question, sub, children }: { Icon: LucideIcon; tone?: Tone; eyebrow?: ReactNode; title: ReactNode; time?: ReactNode; when?: ReactNode; question?: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <section className="k-detail">
      <div className="k-detail-head">
        <Tile Icon={Icon} tone={tone} size="lg" />
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div className="k-eyebrow">{eyebrow}</div>}
          <div className="k-detail-title">{title}</div>
        </div>
      </div>
      {(time || when || question || sub || children) && <div className="k-detail-div" />}
      {(time || when) && (
        <div className="k-detail-time">{time}{when && <span>{when}</span>}</div>
      )}
      {question && <div className="k-detail-q">{question}</div>}
      {sub && <div className="k-detail-sub">{sub}</div>}
      {children}
    </section>
  );
}

/** Tela de confirmação: check grande, o que foi registrado, "Fez por engano? Desfazer" e o caminho de volta. */
export function Confirm({ title, sub, card, undo, primary, secondary }: { title: ReactNode; sub?: ReactNode; card?: { Icon: LucideIcon; title: ReactNode; sub?: ReactNode; note?: ReactNode }; undo?: { label?: string; sub?: string; onClick: () => void }; primary: Act; secondary?: Act }) {
  return (
    <div className="k-confirm" role="status">
      <div className="k-confirm-check"><span><Check size={46} strokeWidth={2.6} aria-hidden /></span></div>
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
      {card && (
        <div className="k-confirm-card">
          <Tile Icon={card.Icon} size="lg" />
          <div style={{ minWidth: 0 }}>
            <b>{card.title}</b>
            {card.sub && <span className="k-row-sub">{card.sub}</span>}
            {card.note && <span className="k-confirm-note"><i />{card.note}</span>}
          </div>
        </div>
      )}
      {undo && (
        <div className="k-undo">
          <span className="k-undo-ico" aria-hidden>↺</span>
          <span className="k-row-main"><b>{undo.label ?? 'Fez por engano?'}</b><span className="k-row-sub">{undo.sub ?? 'Desfaça esta marcação.'}</span></span>
          <button onClick={undo.onClick}>Desfazer</button>
        </div>
      )}
      <div className="k-actions">
        <BigButton a={primary} />
        {secondary && <BigButton a={secondary} variant="soft" />}
      </div>
    </div>
  );
}

/** "Ouvir": lê o texto em voz alta com a voz do próprio aparelho (sem custo, sem enviar nada). */
export function ReadAloud({ text, label = 'Ouvir' }: { text: string; label?: string }) {
  const ok = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [on, setOn] = useState(false);
  useEffect(() => () => { if (ok) window.speechSynthesis.cancel(); }, [ok]);
  if (!ok || !text.trim()) return null;
  const toggle = () => {
    const s = window.speechSynthesis;
    if (on) { s.cancel(); setOn(false); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    u.rate = 1;
    const v = s.getVoices().find((x) => x.lang?.toLowerCase().startsWith('pt'));
    if (v) u.voice = v;
    u.onend = () => setOn(false);
    u.onerror = () => setOn(false);
    s.cancel();
    s.speak(u);
    setOn(true);
  };
  return (
    <button className={'k-read' + (on ? ' on' : '')} onClick={toggle} aria-pressed={on}>
      {on ? <Square size={16} aria-hidden /> : <Volume2 size={19} aria-hidden />}
      {on ? 'Parar' : label}
    </button>
  );
}

/** Ações grandes empilhadas. */
export function Actions({ children }: { children: ReactNode }) {
  return <div className="k-actions">{children}</div>;
}

/** Grade "O que você quer fazer?": ladrilhos grandes com ícone, palavra e explicação. */
export function ActionGrid({ items }: { items: { to: string; Icon: LucideIcon; tone?: Tone; title: string; sub: string }[] }) {
  return (
    <div className="k-grid">
      {items.map((x) => (
        <Link key={x.to + x.title} to={x.to} className="k-act">
          <Tile Icon={x.Icon} tone={x.tone ?? 'blue'} size="lg" />
          <b>{x.title}</b>
          <span>{x.sub}</span>
        </Link>
      ))}
    </div>
  );
}
