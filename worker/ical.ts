import { createClient } from '@supabase/supabase-js';
import { parseIcs, type CalEvent } from './calendar';
import type { Env } from './env';

/**
 * Agenda para assinar (Google Agenda, iPhone, Outlook): GET /api/agenda/{código}.ics
 * O código é secreto e individual (profiles.ical_token). O Google busca este endereço sem login,
 * então a leitura passa pela função ical_feed, que só devolve os eventos do dono do código.
 */
interface Ev {
  id: string; title: string; kind: string; starts_at: string; ends_at: string; location: string; meet_url: string;
  description: string; canceled: boolean; updated_at: string; response: 'pendente' | 'vou' | 'nao_vou';
}
const KIND: Record<string, string> = {
  aula: 'Aula ao vivo', lab: 'Laboratório RCN', massa: 'Mão na Massa', direcionamento: 'Direcionamento', emergencia: 'Sessão de emergência', outro: 'Mentoria RCN',
};

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const day = (iso: string) => iso.slice(0, 10).replace(/-/g, '');

/** Linhas de no máximo 75 bytes (regra do formato iCalendar), sem quebrar letras acentuadas. */
const enc = new TextEncoder();
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function vevent(f: Record<string, string | undefined>): string[] {
  const lines = ['BEGIN:VEVENT'];
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') lines.push(fold(`${k}:${v}`));
  lines.push('END:VEVENT');
  return lines;
}

export async function icalFeed(token: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const supa = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await supa.rpc('ical_feed', { p_token: token });
  if (error || !data) return new Response('Agenda não encontrada. Gere um novo link no Portal RCN, em Agenda.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const feed = data as { name: string; ics: string | null; events: Ev[] };
  const portal = (env.PORTAL_URL || '').replace(/\/$/, '');
  const now = stamp(new Date().toISOString());

  const out = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Render como Negocio//Portal do Aluno//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Mentoria RCN', fold('X-WR-CALDESC:Aulas, laboratórios e sessões da mentoria Render como Negócio'),
    'X-WR-TIMEZONE:America/Sao_Paulo', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ];

  // Eventos do portal em que o aluno foi convidado (os que ele recusou ficam de fora).
  for (const e of feed.events) {
    if (e.response === 'nao_vou') continue;
    const desc = [KIND[e.kind] ?? 'Mentoria RCN', e.meet_url ? `Link da aula: ${e.meet_url}` : '', e.description, `Detalhes e arquivos no Portal RCN: ${portal}/calendario`].filter(Boolean).join('\n\n');
    out.push(...vevent({
      UID: `${e.id}@portal-rcn`,
      DTSTAMP: now,
      DTSTART: stamp(e.starts_at),
      DTEND: stamp(e.ends_at),
      SUMMARY: esc(e.title),
      DESCRIPTION: esc(desc),
      LOCATION: esc(e.location || e.meet_url || ''),
      URL: e.meet_url || undefined,
      STATUS: e.canceled ? 'CANCELLED' : 'CONFIRMED',
      'LAST-MODIFIED': stamp(e.updated_at),
      SEQUENCE: String(Math.max(0, Math.floor((Date.parse(e.updated_at) - Date.UTC(2026, 0, 1)) / 1000))),
    }));
  }

  // Agenda geral da mentoria (Google Agenda da equipe), se estiver conectada em Ajustes.
  const ics = (feed.ics || '').trim();
  if (ics && ics !== 'demo' && /^(https|webcal):\/\//i.test(ics)) {
    const src = ics.replace(/^webcal:/i, 'https:');
    const key = new Request('https://cache.rcn/calendar?' + encodeURIComponent(src));
    let body = await (await caches.default.match(key))?.text();
    if (!body) {
      const r = await fetch(src, { headers: { 'User-Agent': 'PortalRCN/1.0' } }).catch(() => null);
      if (r?.ok) {
        body = await r.text();
        ctx.waitUntil(caches.default.put(key, new Response(body, { headers: { 'Cache-Control': 'max-age=600' } })));
      }
    }
    if (body) {
      const from = new Date(Date.now() - 60 * 86_400_000), to = new Date(Date.now() + 240 * 86_400_000);
      for (const g of parseIcs(body, from, to) as CalEvent[]) {
        out.push(...vevent({
          UID: `${g.id}@agenda-mentoria-rcn`,
          DTSTAMP: now,
          ...(g.allDay ? { 'DTSTART;VALUE=DATE': day(g.start), 'DTEND;VALUE=DATE': day(g.end) } : { DTSTART: stamp(g.start), DTEND: stamp(g.end) }),
          SUMMARY: esc(g.title),
          DESCRIPTION: esc([g.url ? `Link: ${g.url}` : '', g.description || ''].filter(Boolean).join('\n\n')),
          LOCATION: esc(g.location || ''),
          URL: g.url || undefined,
        }));
      }
    }
  }

  out.push('END:VCALENDAR');
  return new Response(out.join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="mentoria-rcn.ics"', 'Cache-Control': 'public, max-age=900' },
  });
}
