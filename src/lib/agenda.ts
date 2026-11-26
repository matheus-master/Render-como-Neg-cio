import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------
export type EventKind = 'aula' | 'lab' | 'massa' | 'direcionamento' | 'emergencia' | 'outro';
export const EVENT_KINDS: { key: EventKind; label: string; color: string; bg: string; fg: string }[] = [
  { key: 'aula', label: 'Aula ao vivo', color: 'var(--ink)', bg: 'var(--ink)', fg: '#fff' },
  { key: 'lab', label: 'Laboratório RCN', color: 'var(--gold)', bg: 'var(--gold)', fg: 'var(--ink)' },
  { key: 'massa', label: 'Mão na Massa', color: 'var(--ok)', bg: 'var(--ok)', fg: '#fff' },
  { key: 'direcionamento', label: 'Direcionamento', color: 'var(--ac)', bg: 'var(--ac)', fg: '#fff' },
  { key: 'emergencia', label: 'Sessão de emergência', color: 'var(--err)', bg: 'var(--err)', fg: '#fff' },
  { key: 'outro', label: 'Outros', color: 'var(--t4)', bg: 'var(--alt3)', fg: 'var(--t)' },
];
export const kindInfo = (k: string) => EVENT_KINDS.find((x) => x.key === k) ?? EVENT_KINDS[EVENT_KINDS.length - 1]!;

export interface EventFile { id: string; file_name: string; file_path: string }
export interface PortalEvent {
  id: string; title: string; kind: EventKind; starts_at: string; ends_at: string;
  meet_url: string; location: string; description: string;
  audience: 'todos' | 'grupo' | 'alunos'; group_name: string | null; canceled: boolean; updated_at: string;
  files: EventFile[];
}
export type Response = 'pendente' | 'vou' | 'nao_vou';
export interface Attendee { student_id: string; response: Response; notice: 'novo' | 'alterado' | 'cancelado' | null; notice_text: string; responded_at: string | null }
export interface MyEvent extends PortalEvent { me: Attendee }
export interface StaffEvent extends PortalEvent { attendees: Attendee[] }

const unwrap = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

/** Eventos para os quais o aluno foi convidado (com a resposta e o aviso dele). */
export function useMyEvents() {
  const uid = useAuth().session?.user.id;
  return useQuery({
    queryKey: ['my-events', uid],
    enabled: !!uid,
    refetchInterval: 120_000,
    queryFn: async () => {
      const rows = unwrap(
        await supabase
          .from('event_attendees')
          .select('student_id, response, notice, notice_text, responded_at, event:events(*, files:event_files(id, file_name, file_path))')
          .eq('student_id', uid!),
      ) as unknown as (Attendee & { event: PortalEvent })[];
      return rows
        .filter((r) => r.event)
        .map(({ event, ...me }) => ({ ...event, me }))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at)) as MyEvent[];
    },
  });
}

export function useRespond() {
  const qc = useQueryClient();
  const uid = useAuth().session?.user.id;
  return useMutation({
    mutationFn: async ({ eventId, response }: { eventId: string; response?: Response }) =>
      unwrap(await supabase.from('event_attendees').update({ ...(response ? { response } : {}), notice: null }).eq('event_id', eventId).eq('student_id', uid!)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['my-events'] }),
  });
}

export function useStaffEvents() {
  return useQuery({
    queryKey: ['staff-events'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('events')
          .select('*, files:event_files(id, file_name, file_path), attendees:event_attendees(student_id, response, notice, notice_text, responded_at)')
          .order('starts_at'),
      ) as StaffEvent[],
  });
}

export interface EventForm {
  title: string; kind: EventKind; date: string; start: string; end: string;
  meet_url: string; location: string; description: string;
  audience: 'todos' | 'grupo' | 'alunos'; group_name: string | null; students: string[];
}

/** "2026-11-27" + "20:00" no horário de Brasília → ISO. */
export const toIso = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`).toISOString();
const fmtWhen = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

/**
 * Cria ou altera um evento e acerta os convites.
 * Mudou dia, horário ou link → todos os convidados recebem o aviso "alterado" e confirmam de novo.
 */
export async function saveEvent(f: EventForm, studentsOf: (f: EventForm) => string[], original?: StaffEvent) {
  const row = {
    title: f.title.trim(), kind: f.kind, starts_at: toIso(f.date, f.start), ends_at: toIso(f.date, f.end),
    meet_url: f.meet_url.trim(), location: f.location.trim(), description: f.description.trim(),
    audience: f.audience, group_name: f.audience === 'grupo' ? f.group_name : null, updated_at: new Date().toISOString(),
  };
  const ev = original
    ? unwrap(await supabase.from('events').update(row).eq('id', original.id).select('id').single())
    : unwrap(await supabase.from('events').insert(row).select('id').single());
  const id = (ev as unknown as { id: string }).id;
  const want = new Set(studentsOf(f));
  const had = new Set((original?.attendees || []).map((a) => a.student_id));

  const added = [...want].filter((s) => !had.has(s));
  const removed = [...had].filter((s) => !want.has(s));
  if (added.length) unwrap(await supabase.from('event_attendees').insert(added.map((s) => ({ event_id: id, student_id: s, notice: 'novo' }))));
  if (removed.length) unwrap(await supabase.from('event_attendees').delete().eq('event_id', id).in('student_id', removed));

  if (original) {
    const changes: string[] = [];
    if (original.starts_at !== row.starts_at || original.ends_at !== row.ends_at) changes.push(`horário: era ${fmtWhen(original.starts_at)}, agora ${fmtWhen(row.starts_at)}`);
    if ((original.meet_url || '') !== row.meet_url) changes.push('link da chamada');
    if ((original.location || '') !== row.location) changes.push('local');
    const kept = [...want].filter((s) => had.has(s));
    if (changes.length && kept.length)
      unwrap(await supabase.from('event_attendees').update({ notice: 'alterado', notice_text: 'Mudou ' + changes.join(' · '), response: 'pendente' }).eq('event_id', id).in('student_id', kept));
  }
  return id;
}

export async function cancelEvent(e: StaffEvent) {
  unwrap(await supabase.from('events').update({ canceled: true, updated_at: new Date().toISOString() }).eq('id', e.id));
  unwrap(await supabase.from('event_attendees').update({ notice: 'cancelado', notice_text: `${e.title} (${fmtWhen(e.starts_at)}) foi cancelado.` }).eq('event_id', e.id));
}

export async function signedUrl(path: string) {
  return (await supabase.storage.from('files').createSignedUrl(path, 3600)).data?.signedUrl ?? null;
}

// ---------------------------------------------------------------------
// Planos de ação
// ---------------------------------------------------------------------
export interface ActionItem { id: string; plan_id: string; position: number; text: string; due_date: string | null; done_at: string | null; created_at: string }
export interface ActionPlan {
  id: string; student_id: string; title: string; event_id: string | null; archived: boolean; created_at: string;
  items: ActionItem[]; nudges: { created_at: string }[];
}

/** Dias desde o último avanço (item marcado) ou desde a criação do plano. */
export function planStatus(p: ActionPlan, now = Date.now()) {
  const done = p.items.filter((i) => i.done_at).length;
  const total = p.items.length;
  const lastDone = p.items.map((i) => i.done_at).filter(Boolean).sort().pop() || null;
  const lastActivity = lastDone || p.created_at;
  const idle = Math.floor((now - new Date(lastActivity).getTime()) / 86_400_000);
  const lastNudge = p.nudges.map((n) => n.created_at).sort().pop() || null;
  const nudgedAfter = !!lastNudge && lastNudge > lastActivity;
  return { done, total, complete: total > 0 && done === total, lastDone, lastActivity, idle, lastNudge, nudgedAfter, pct: total ? Math.round((done / total) * 100) : 0 };
}
/** A partir de quantos dias sem avanço o plano conta como parado. */
export const STALE_DAYS = 7;

const PLAN_SELECT = '*, items:action_items(*), nudges:plan_nudges(created_at)';
const sortItems = (ps: ActionPlan[]) => ps.map((p) => ({ ...p, items: [...p.items].sort((a, b) => a.position - b.position) }));

export function useMyPlans() {
  const uid = useAuth().session?.user.id;
  return useQuery({
    queryKey: ['plans', uid],
    enabled: !!uid,
    queryFn: async () =>
      sortItems(unwrap(await supabase.from('action_plans').select('*, items:action_items(*)').eq('student_id', uid!).eq('archived', false).order('created_at', { ascending: false })) as ActionPlan[]).map(
        (p) => ({ ...p, nudges: [] }),
      ),
  });
}

export function usePlans(studentId?: string) {
  return useQuery({
    queryKey: ['plans-staff', studentId ?? 'todos'],
    queryFn: async () => {
      let q = supabase.from('action_plans').select(PLAN_SELECT).order('created_at', { ascending: false });
      if (studentId) q = q.eq('student_id', studentId);
      return sortItems(unwrap(await q) as ActionPlan[]);
    },
  });
}

export function useToggleItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) =>
      unwrap(await supabase.from('action_items').update({ done_at: done ? new Date().toISOString() : null }).eq('id', id)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['plans'] });
      qc.invalidateQueries({ queryKey: ['plans-staff'] });
    },
  });
}

/** Link do WhatsApp com a mensagem de acompanhamento já escrita. */
export function whatsappLink(phone: string | null | undefined, text: string) {
  let d = (phone || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d.length >= 12 ? `https://wa.me/${d}?text=${encodeURIComponent(text)}` : null;
}

/** Abre um arquivo privado em nova aba. A aba abre no clique (senão o navegador bloqueia como pop-up) e recebe o link depois. */
export async function openSigned(path: string) {
  const w = window.open('', '_blank');
  const u = await signedUrl(path);
  if (!u) { w?.close(); return; }
  if (w) w.location.href = u;
  else window.location.href = u;
}

// ---------------------------------------------------------------------
// Agenda para assinar (Google Agenda / iPhone / Outlook)
// ---------------------------------------------------------------------
/** Endereços da agenda pessoal do aluno (o código é secreto: quem tem o link vê os eventos). */
export function useAgendaFeed() {
  const uid = useAuth().session?.user.id;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['ical-token', uid],
    enabled: !!uid,
    staleTime: Infinity,
    queryFn: async () => unwrap(await supabase.from('profiles').select('ical_token').eq('id', uid!).single()) as { ical_token: string },
  });
  const reset = useMutation({
    mutationFn: async () => unwrap(await supabase.rpc('reset_ical_token')) as string,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ical-token'] }),
  });
  const token = q.data?.ical_token;
  const https = token ? `${window.location.origin}/api/agenda/${token}.ics` : null;
  const webcal = https ? https.replace(/^https?:/, 'webcal:') : null;
  const google = webcal ? `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` : null;
  return { https, webcal, google, loading: q.isLoading, reset };
}
