import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, ExternalLink, MapPin, Video, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ErrorState, PageHead } from '../components/ui';
import { useAuth } from '../lib/auth';
import { apiGet } from '../lib/supabase';
import { useIsMobile } from '../lib/useIsMobile';

interface CalEvent { id: string; title: string; start: string; end: string; allDay: boolean; location: string | null; description: string | null; url: string | null }
interface CalResp { configured: boolean; events: CalEvent[]; calendarUrl: string | null; error?: string }

const TZ = 'America/Sao_Paulo';
const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Tipo do evento pelo título, para cor e legenda. */
const KINDS = [
  { key: 'aula', label: 'Aula ao vivo', re: /aula|ao vivo|live/i, color: 'var(--ink)', bg: 'var(--ink)', fg: '#fff' },
  { key: 'lab', label: 'Laboratório RCN', re: /laborat/i, color: 'var(--gold)', bg: 'var(--gold)', fg: 'var(--ink)' },
  { key: 'massa', label: 'Mão na Massa', re: /m[aã]o na massa/i, color: 'var(--ok)', bg: 'var(--ok)', fg: '#fff' },
  { key: 'outro', label: 'Outros', re: /.*/, color: 'var(--t4)', bg: 'var(--alt3)', fg: 'var(--t)' },
] as const;
const kindOf = (title: string) => KINDS.find((k) => k.re.test(title))!;

/** Data local (São Paulo) em partes. */
const local = (iso: string | Date) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { key: `${p.year}-${p.month}-${p.day}`, y: +p.year!, m: +p.month! - 1, d: +p.day!, time: `${p.hour}h${p.minute}` };
};
const dayKey = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const monthName = (y: number, m: number) => cap(new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m, 15))));
const longDay = (iso: string) => cap(new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso)));
const timeRange = (e: CalEvent) => (e.allDay ? 'Dia inteiro' : `${local(e.start).time} – ${local(e.end).time}`);

/** Link "Adicionar ao Google Agenda" do evento. */
function gcalAdd(e: CalEvent) {
  const f = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dates = e.allDay ? `${f(e.start).slice(0, 8)}/${f(e.end).slice(0, 8)}` : `${f(e.start)}/${f(e.end)}`;
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates, details: [e.description, e.url].filter(Boolean).join('\n\n'), location: e.location || '' });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

/** Ao vivo agora ou começa em até 15 minutos. */
const isLiveSoon = (e: CalEvent, now: number) => !e.allDay && now >= new Date(e.start).getTime() - 15 * 60000 && now <= new Date(e.end).getTime();

export default function Calendario() {
  const { session } = useAuth();
  const mobile = useIsMobile();
  const q = useQuery({ queryKey: ['calendar', session?.user.id], queryFn: () => apiGet<CalResp>('/api/calendar'), staleTime: 300_000, refetchInterval: 300_000 });
  const today = local(new Date());
  const [cursor, setCursor] = useState({ y: today.y, m: today.m });
  const [open, setOpen] = useState<CalEvent | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);
  const now = Date.now();

  const events = q.data?.events || [];
  const byDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>();
    for (const e of events) {
      // Eventos de dia inteiro com vários dias entram em cada dia.
      const s = new Date(e.start).getTime(), en = new Date(e.end).getTime();
      const span = e.allDay ? Math.max(1, Math.round((en - s) / 86400000)) : 1;
      for (let i = 0; i < span; i++) {
        const k = local(new Date(s + i * 86400000)).key;
        (map.get(k) || map.set(k, []).get(k)!).push(e);
      }
    }
    return map;
  }, [events]);
  const upcoming = events.filter((e) => new Date(e.end).getTime() >= now).slice(0, 8);

  const first = new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const move = (dm: number) => setCursor(({ y, m }) => ({ y: m + dm < 0 ? y - 1 : m + dm > 11 ? y + 1 : y, m: (m + dm + 12) % 12 }));
  const calUrl = q.data?.calendarUrl;
  const selEvents = selDay ? byDay.get(selDay) || [] : null;

  return (
    <div className="page">
      <PageHead
        title="Calendário"
        sub="Aulas ao vivo, Laboratórios RCN, Mão na Massa e datas importantes da mentoria."
        right={
          calUrl && (
            <a href={calUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
              <ExternalLink size={16} aria-hidden />
              Abrir no Google Agenda
            </a>
          )
        }
      />

      {q.isLoading ? (
        <div className="cal-layout">
          <div className="skel-card" style={{ height: 520 }} />
          <div className="skel-card" style={{ height: 520 }} />
        </div>
      ) : q.isError ? (
        <ErrorState onRetry={q.refetch} />
      ) : !q.data?.configured ? (
        <div className="hero" style={{ padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: 26 }}>Calendário do mês</div>
          <div className="hero-sub" style={{ fontSize: 15, lineHeight: 1.5, maxWidth: 460 }}>A agenda da mentoria ainda não foi conectada ao portal. Enquanto isso, abra o calendário pelo botão abaixo.</div>
          {calUrl && (
            <a href={calUrl} target="_blank" rel="noreferrer" className="btn btn-gold btn-md" style={{ marginTop: 10, padding: '0 24px' }}>
              Abrir calendário <ExternalLink size={16} aria-hidden />
            </a>
          )}
        </div>
      ) : (
        <div className="cal-layout">
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="between" style={{ alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
              <div className="h-card">{monthName(cursor.y, cursor.m)}</div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setCursor({ y: today.y, m: today.m })}>Hoje</button>
                <button className="btn btn-secondary btn-sm" style={{ width: 36, padding: 0 }} aria-label="Mês anterior" onClick={() => move(-1)}><ChevronLeft size={16} aria-hidden /></button>
                <button className="btn btn-secondary btn-sm" style={{ width: 36, padding: 0 }} aria-label="Próximo mês" onClick={() => move(1)}><ChevronRight size={16} aria-hidden /></button>
              </div>
            </div>
            <div className="cal-grid cal-head">
              {WEEK.map((w) => <div key={w}>{w}</div>)}
            </div>
            <div className="cal-grid">
              {cells.map((d, i) => {
                if (!d) return <div key={i} className="cal-cell empty" />;
                const k = dayKey(cursor.y, cursor.m, d);
                const evs = byDay.get(k) || [];
                const isToday = k === today.key;
                const past = k < today.key;
                return (
                  <button key={i} className={'cal-cell' + (isToday ? ' today' : '') + (past ? ' past' : '') + (selDay === k ? ' sel' : '')} onClick={() => setSelDay(selDay === k ? null : k)} aria-label={`${d}, ${evs.length} eventos`}>
                    <span className="cal-num">{d}</span>
                    {mobile ? (
                      <span className="cal-dots">{evs.slice(0, 3).map((e) => <i key={e.id} style={{ background: kindOf(e.title).color }} />)}</span>
                    ) : (
                      <span className="cal-evs">
                        {evs.slice(0, 3).map((e) => {
                          const k2 = kindOf(e.title);
                          return (
                            <span key={e.id} className="cal-ev" style={{ background: k2.bg, color: k2.fg }} onClick={(ev) => { ev.stopPropagation(); setOpen(e); }} role="button" tabIndex={0}>
                              {!e.allDay && <b>{local(e.start).time}</b>} {e.title}
                            </span>
                          );
                        })}
                        {evs.length > 3 && <span className="cal-more">+{evs.length - 3}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="row" style={{ gap: 16, flexWrap: 'wrap', padding: '12px 18px', borderTop: '1px solid var(--line)' }}>
              {KINDS.map((k) => (
                <span key={k.key} className="row" style={{ gap: 6, fontSize: 12, color: 'var(--t3)' }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: k.color, display: 'inline-block' }} />
                  {k.label}
                </span>
              ))}
            </div>
          </div>

          <div className="card stack" style={{ gap: 4, padding: '18px 18px 10px' }}>
            <div className="between" style={{ alignItems: 'baseline', marginBottom: 8 }}>
              <div className="h-card">{selEvents ? longDay(selDay + 'T15:00:00Z') : 'Próximos eventos'}</div>
              {selEvents && <button className="link" onClick={() => setSelDay(null)}>Ver próximos</button>}
            </div>
            {(selEvents ?? upcoming).length === 0 && (
              <div style={{ fontSize: 14, color: 'var(--t3)', padding: '20px 0' }}>{selEvents ? 'Nada marcado neste dia.' : 'Nenhum evento nos próximos meses.'}</div>
            )}
            {(selEvents ?? upcoming).map((e) => {
              const k = kindOf(e.title);
              const l = local(e.start);
              const live = isLiveSoon(e, now);
              return (
                <button key={e.id} className="cal-item" onClick={() => setOpen(e)}>
                  <div className="cal-date">
                    <span className="mono">{WEEK[new Date(Date.UTC(l.y, l.m, l.d)).getUTCDay()]}</span>
                    <b>{l.d}</b>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
                    <div className="row" style={{ gap: 8, fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>
                      <i style={{ width: 8, height: 8, borderRadius: 2, background: k.color, display: 'inline-block', flex: 'none' }} />
                      {timeRange(e)}
                    </div>
                  </div>
                  {live && e.url && (
                    <a className="btn btn-primary btn-sm" href={e.url} target="_blank" rel="noreferrer" onClick={(ev) => ev.stopPropagation()}>
                      <Video size={14} aria-hidden /> Entrar
                    </a>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={open.title} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="between" style={{ alignItems: 'flex-start' }}>
              <div>
                <span className="chip" style={{ background: kindOf(open.title).bg, color: kindOf(open.title).fg, marginBottom: 8 }}>{kindOf(open.title).label}</span>
                <div style={{ fontWeight: 600, fontSize: 20, letterSpacing: '-.02em', lineHeight: 1.25 }}>{open.title}</div>
              </div>
              <button className="rv-x" aria-label="Fechar" onClick={() => setOpen(null)}><X size={18} aria-hidden /></button>
            </div>
            <div className="row" style={{ gap: 8, fontSize: 14, color: 'var(--t2)' }}>
              <Clock size={15} aria-hidden /> <span>{longDay(open.start)}</span> · {timeRange(open)}
            </div>
            {open.location && !/^https?:/.test(open.location) && (
              <div className="row" style={{ gap: 8, fontSize: 14, color: 'var(--t2)' }}><MapPin size={15} aria-hidden /> {open.location}</div>
            )}
            {open.description && (
              <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--t2)', whiteSpace: 'pre-wrap', maxHeight: 220, overflowY: 'auto', background: 'var(--alt)', borderRadius: 8, padding: '10px 12px' }}>
                {open.description.replace(/<[^>]+>/g, '')}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: open.url ? '1fr 1fr' : '1fr', gap: 10, marginTop: 4 }}>
              <a className="btn btn-secondary" href={gcalAdd(open)} target="_blank" rel="noreferrer">
                <CalendarPlus size={16} aria-hidden /> Salvar na minha agenda
              </a>
              {open.url && (
                <a className="btn btn-primary" href={open.url} target="_blank" rel="noreferrer">
                  <Video size={16} aria-hidden /> Link da aula
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
