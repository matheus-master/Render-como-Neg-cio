// Leitura de agenda no formato iCal (.ics), como o "endereço secreto/público em formato iCal" do Google Agenda.
// Expande eventos recorrentes (diário, semanal, mensal) dentro de uma janela de datas.

export interface CalEvent {
  id: string;
  title: string;
  start: string; // ISO UTC
  end: string; // ISO UTC
  allDay: boolean;
  location: string | null;
  description: string | null;
  url: string | null; // link de reunião (Meet/Zoom), se houver
}

/** Junta linhas dobradas (RFC 5545: continuação começa com espaço ou tab). */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

const unescape = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

interface Prop { value: string; params: Record<string, string> }

function parseLine(line: string): [string, Prop] | null {
  const i = line.indexOf(':');
  if (i < 0) return null;
  const [name, ...params] = line.slice(0, i).split(';');
  const p: Record<string, string> = {};
  for (const kv of params) {
    const [k, v] = kv.split('=');
    if (k && v) p[k.toUpperCase()] = v.replace(/^"|"$/g, '');
  }
  return [name!.toUpperCase(), { value: line.slice(i + 1), params: p }];
}

/** Diferença (ms) entre o horário de parede num fuso e UTC, para uma data. */
function tzOffset(date: Date, tz: string): number {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
    return asUtc - date.getTime();
  } catch {
    return 0;
  }
}

/** Converte DTSTART/DTEND em Date (UTC). Retorna também se é dia inteiro. */
function toDate(prop: Prop, defaultTz: string): { d: Date; allDay: boolean } | null {
  const v = prop.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, da, h, mi, s, z] = m;
  if (!h) return { d: new Date(Date.UTC(+y!, +mo! - 1, +da!, 12)), allDay: true };
  const wall = Date.UTC(+y!, +mo! - 1, +da!, +h, +mi!, +s!);
  if (z) return { d: new Date(wall), allDay: false };
  const tz = prop.params.TZID || defaultTz;
  // Duas passadas para acertar a virada de horário de verão.
  let t = wall - tzOffset(new Date(wall), tz);
  t = wall - tzOffset(new Date(t), tz);
  return { d: new Date(t), allDay: false };
}

const DAY = 86400000;
const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Gera as ocorrências de uma regra simples (DAILY/WEEKLY/MONTHLY) entre from e to. */
function expand(startUtc: Date, rrule: string, from: number, to: number, exdates: Set<number>, tz: string): Date[] {
  // Conta em horário de parede (local), para "toda terça às 22h" não virar quarta em UTC.
  const off0 = tzOffset(startUtc, tz);
  const start = new Date(startUtc.getTime() + off0);
  const toUtc = (local: number) => local - tzOffset(new Date(local - off0), tz);
  const r = Object.fromEntries(rrule.split(';').map((kv) => kv.split('=') as [string, string]));
  const freq = r.FREQ;
  const interval = Math.max(1, +(r.INTERVAL || 1));
  const count = r.COUNT ? +r.COUNT : Infinity;
  const until = r.UNTIL ? (toDate({ value: r.UNTIL, params: {} }, 'UTC')?.d.getTime() ?? Infinity) : Infinity;
  const out: Date[] = [];
  let n = 0;
  const push = (local: number) => {
    const t = toUtc(local);
    if (t > until || n >= count) return false;
    n++;
    if (t >= from && t <= to && !exdates.has(t)) out.push(new Date(t));
    return true;
  };
  // Limite em horário local (folga de 1 dia cobre a diferença de fuso).
  const hardStop = Math.min(to, until) + DAY;
  if (freq === 'DAILY') {
    for (let t = start.getTime(); t <= hardStop && n < count; t += interval * DAY) push(t);
  } else if (freq === 'WEEKLY') {
    const days = r.BYDAY ? r.BYDAY.split(',').map((d) => BYDAY[d.replace(/^[+-]?\d+/, '')]!).filter((x) => x !== undefined) : [start.getUTCDay()];
    // Semana começa no domingo da semana do início; horário preservado.
    const weekStart = start.getTime() - start.getUTCDay() * DAY;
    for (let w = weekStart; w <= hardStop && n < count; w += interval * 7 * DAY) {
      for (const d of [...days].sort((a, b) => a - b)) {
        const t = w + d * DAY;
        if (t < start.getTime()) continue;
        if (t > hardStop || n >= count) break;
        push(t);
      }
    }
  } else if (freq === 'MONTHLY') {
    for (let i = 0; n < count; i += interval) {
      const d = new Date(start);
      d.setUTCMonth(start.getUTCMonth() + i);
      if (d.getUTCDate() !== start.getUTCDate()) continue; // mês sem esse dia (ex.: 31)
      if (d.getTime() > hardStop) break;
      push(d.getTime());
    }
  } else {
    push(start.getTime());
  }
  return out;
}

const MEET = /(https:\/\/(?:meet\.google\.com|[\w.-]*zoom\.us|teams\.microsoft\.com)\/[^\s"<>\\]+)/i;

export function parseIcs(ics: string, from: Date, to: Date): CalEvent[] {
  const lines = unfold(ics);
  const calTz = lines.find((l) => l.startsWith('X-WR-TIMEZONE:'))?.slice(14).trim() || 'America/Sao_Paulo';
  const events: CalEvent[] = [];
  const overrides = new Map<string, Map<number, true>>(); // UID -> ocorrências substituídas (RECURRENCE-ID)
  const raw: Record<string, Prop[]>[] = [];
  let cur: Record<string, Prop[]> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') { if (cur) raw.push(cur); cur = null; }
    else if (cur) {
      const p = parseLine(line);
      if (p) (cur[p[0]] ||= []).push(p[1]);
    }
  }
  for (const e of raw) {
    const rid = e['RECURRENCE-ID']?.[0];
    const uid = e.UID?.[0]?.value || '';
    if (rid) {
      const d = toDate(rid, calTz);
      if (d) (overrides.get(uid) || overrides.set(uid, new Map()).get(uid)!).set(d.d.getTime(), true);
    }
  }
  for (const e of raw) {
    if (e.STATUS?.[0]?.value === 'CANCELLED') continue;
    const ds = e.DTSTART?.[0] && toDate(e.DTSTART[0], calTz);
    if (!ds) continue;
    const de = e.DTEND?.[0] && toDate(e.DTEND[0], calTz);
    const dur = de ? de.d.getTime() - ds.d.getTime() : ds.allDay ? DAY : 3600000;
    const uid = e.UID?.[0]?.value || Math.random().toString(36);
    const title = unescape(e.SUMMARY?.[0]?.value || 'Sem título');
    const description = e.DESCRIPTION?.[0] ? unescape(e.DESCRIPTION[0].value) : null;
    const location = e.LOCATION?.[0] ? unescape(e.LOCATION[0].value) : null;
    const conf = e['X-GOOGLE-CONFERENCE']?.[0]?.value || e.URL?.[0]?.value || (description || '').match(MEET)?.[1] || (location || '').match(MEET)?.[1] || null;
    const ex = new Set<number>();
    for (const x of e.EXDATE || []) for (const v of x.value.split(',')) { const d = toDate({ value: v, params: x.params }, calTz); if (d) ex.add(d.d.getTime()); }
    const isOverride = !!e['RECURRENCE-ID'];
    const rr = e.RRULE?.[0]?.value;
    const starts = rr && !isOverride
      ? expand(ds.d, rr, from.getTime() - dur, to.getTime(), new Set([...ex, ...(overrides.get(uid)?.keys() || [])]), ds.allDay ? 'UTC' : e.DTSTART![0]!.params.TZID || calTz)
      : ds.d.getTime() + dur >= from.getTime() && ds.d.getTime() <= to.getTime() ? [ds.d] : [];
    for (const s of starts) {
      events.push({ id: `${uid}#${s.getTime()}`, title, start: s.toISOString(), end: new Date(s.getTime() + dur).toISOString(), allDay: ds.allDay, location, description, url: conf });
    }
  }
  return events.sort((a, b) => a.start.localeCompare(b.start)).slice(0, 500);
}

/** Agenda de demonstração (formato iCal), usada quando a configuração é "demo". */
export function demoIcs(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m - 1, 1));
  // Próxima data (a partir do início) que cai no dia da semana pedido.
  const firstWeekday = (wd: number) => new Date(start.getTime() + ((wd - start.getUTCDay() + 7) % 7) * DAY);
  const local = (d: Date, h: number, mi = 0) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(h)}${pad(mi)}00`;
  const date = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const ev = (uid: string, lines: string[]) => ['BEGIN:VEVENT', `UID:${uid}@demo.rcn`, ...lines, 'END:VEVENT'].join('\r\n');
  const tz = 'TZID=America/Sao_Paulo';
  const tue = firstWeekday(2), thu = firstWeekday(4), sat = firstWeekday(6);
  const launch = new Date(Date.UTC(y, m, 3));
  const out = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RCN//Demo//PT', 'X-WR-TIMEZONE:America/Sao_Paulo',
    ev('aula', [`DTSTART;${tz}:${local(tue, 20)}`, `DTEND;${tz}:${local(tue, 21, 30)}`, 'RRULE:FREQ=WEEKLY;BYDAY=TU', 'SUMMARY:Aula ao vivo · Precificação e propostas', 'DESCRIPTION:Aula semanal da mentoria. Traga sua proposta mais recente para revisarmos juntos.\\n\\nLink: https://meet.google.com/rcn-aula-demo']),
    ev('lab', [`DTSTART;${tz}:${local(thu, 19)}`, `DTEND;${tz}:${local(thu, 20, 30)}`, 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TH', 'SUMMARY:Laboratório RCN · Revisão de portfólios', 'DESCRIPTION:Análise ao vivo de portfólios enviados pelos alunos.\\n\\nhttps://meet.google.com/rcn-lab-demo']),
    ev('massa', [`DTSTART;${tz}:${local(sat, 10)}`, `DTEND;${tz}:${local(sat, 12)}`, 'RRULE:FREQ=WEEKLY;BYDAY=SA', 'SUMMARY:Mão na Massa · Render guiado', 'DESCRIPTION:Sessão prática: iluminação de fachada noturna.\\n\\nhttps://meet.google.com/rcn-massa-demo']),
    ev('rel15', [`DTSTART;VALUE=DATE:${date(new Date(Date.UTC(y, m - 1, 15)))}`, `DTEND;VALUE=DATE:${date(new Date(Date.UTC(y, m - 1, 16)))}`, 'RRULE:FREQ=MONTHLY', 'SUMMARY:Prazo · relatório quinzenal']),
    ev('launch', [`DTSTART;${tz}:${local(launch, 19)}`, `DTEND;${tz}:${local(launch, 21)}`, 'SUMMARY:Encontro da turma · Boas-vindas', 'LOCATION:Online', 'DESCRIPTION:Apresentação da nova turma e dos mentores.']),
    'END:VCALENDAR',
  ];
  return out.join('\r\n');
}
