const TZ = 'America/Sao_Paulo';

const parts = (d: Date) => {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', year: 'numeric', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { weekday: p.weekday, day: p.day, month: (p.month || '').replace('.', ''), hour: p.hour, minute: p.minute, year: p.year };
};
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

/** "sábado, 14 nov, às 10h30" */
export function fmtDue(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.weekday}, ${p.day} ${p.month}, às ${p.hour}h${p.minute}`;
}
/** "sábado, 14 nov" */
export function fmtDueShort(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.weekday}, ${p.day} ${p.month}`;
}
/** "3 nov" · "hoje, 08h15" */
export function fmtDay(iso: string, withTodayTime = true): string {
  const d = new Date(iso);
  const p = parts(d);
  if (withTodayTime && dayKey(d) === dayKey(new Date())) return `hoje, ${p.hour}h${p.minute}`;
  return `${p.day} ${p.month}`;
}
/** "ter, 10 nov · 16h40" · "hoje · 07h50" */
export function fmtSent(iso: string): string {
  const d = new Date(iso);
  const p = parts(d);
  if (dayKey(d) === dayKey(new Date())) return `hoje · ${p.hour}h${p.minute}`;
  return `${p.weekday.slice(0, 3)}, ${p.day} ${p.month} · ${p.hour}h${p.minute}`;
}
/** "vence hoje, 16h40" · "vence amanhã, 11h02" · "vence sáb, 14 nov, 07h50" */
export function fmtDueRel(iso: string): { text: string; today: boolean } {
  const d = new Date(iso);
  const p = parts(d);
  const today = dayKey(d) === dayKey(new Date());
  const tomorrow = dayKey(d) === dayKey(new Date(Date.now() + 86400000));
  const when = today ? 'hoje' : tomorrow ? 'amanhã' : `${p.weekday.slice(0, 3)}, ${p.day} ${p.month}`;
  return { text: `${d.getTime() < Date.now() ? 'venceu' : 'vence'} ${when}, ${p.hour}h${p.minute}`, today };
}
/** "Quinta, 12 de novembro de 2026" */
export function fmtLongToday(): string {
  const s = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const t = s.replace('-feira', '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function fmtTime(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.hour}h${p.minute}`;
}
/** "15/09/2026" */
export const fmtDate = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ }).format(new Date(iso));
/** "16–31 out" */
export function fmtPeriod(a: string, b: string): string {
  const pa = parts(new Date(a + 'T12:00:00Z')), pb = parts(new Date(b + 'T12:00:00Z'));
  return pa.month === pb.month ? `${pa.day}–${pb.day} ${pb.month}` : `${pa.day} ${pa.month} – ${pb.day} ${pb.month}`;
}
export const fmtBRL = (n: number) => 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n);
export const fmtMB = (bytes: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) + ' MB';

/** Iniciais das duas primeiras palavras que começam com letra (ignora "(Equipe)", números etc.). */
export const initials = (name: string) =>
  name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
export const firstName = (name: string) => name.split(' ').filter(Boolean)[0] || '';
