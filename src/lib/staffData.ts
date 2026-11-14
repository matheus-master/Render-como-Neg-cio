import { useQuery } from '@tanstack/react-query';
import type { Slot, SubmissionStatus, Verdict } from '../../shared/domain';
import type { Profile } from './auth';
import type { Level, Report, Task } from './data';
import { supabase } from './supabase';

/** Dias sem relatório a partir dos quais o aluno conta como atrasado (mesma regra do portal antigo). */
export const LATE_DAYS = 16;

export interface StaffStudent extends Profile {
  status: 'ativo' | 'onboarding' | 'pausado';
}
export interface StaffSubmission {
  id: string;
  student_id: string;
  slot: Slot;
  version: number;
  status: SubmissionStatus;
  created_at: string;
  due_at: string;
  fb: { verdict: Verdict | null; ai_status: string } | null;
}
export interface Completion { student_id: string; task_id: number; status: 'andamento' | 'feita'; updated_at: string }
export interface RedButton { student_id: string; used_at: string; reason: string; staff_status: 'solicitado' | 'agendado' | 'realizado'; staff_notes: string }

const unwrap = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

/** Tudo que o painel precisa, numa leitura só (a equipe tem acesso a todos os alunos pelo RLS). */
export function useStaffOverview() {
  return useQuery({
    queryKey: ['staff-overview'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [students, reports, subs, comps, tasks, levels, red] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'aluno').order('full_name'),
        supabase.from('reports').select('*').order('period_end', { ascending: false }),
        supabase.from('submissions').select('id, student_id, slot, version, status, created_at, due_at, fb:feedbacks(verdict, ai_status)').order('created_at', { ascending: false }),
        supabase.from('task_completions').select('student_id, task_id, status, updated_at'),
        supabase.from('tasks').select('*').order('level').order('position'),
        supabase.from('levels').select('*').order('n'),
        supabase.from('red_button').select('*'),
      ]);
      return {
        students: unwrap(students) as StaffStudent[],
        reports: (unwrap(reports) as Report[]).map((r) => ({ ...r, revenue: Number(r.revenue) })),
        subs: unwrap(subs) as unknown as StaffSubmission[],
        comps: unwrap(comps) as Completion[],
        tasks: unwrap(tasks) as Task[],
        levels: unwrap(levels) as Level[],
        red: unwrap(red) as RedButton[],
      };
    },
  });
}
export type Overview = NonNullable<ReturnType<typeof useStaffOverview>['data']>;

/** Progresso de um aluno: nível atual, XP do nível e XP total (mesma regra da tela do aluno). */
export function progressOf(o: Overview, studentId: string, subsOfStudent = o.subs.filter((s) => s.student_id === studentId)) {
  const mine = o.comps.filter((c) => c.student_id === studentId);
  const latestBySlot = new Map<Slot, StaffSubmission>();
  for (const s of subsOfStudent) if (!latestBySlot.has(s.slot)) latestBySlot.set(s.slot, s); // subs vêm da mais nova para a mais antiga
  const isDone = (t: Task) => {
    if (t.auto_slot) {
      const s = latestBySlot.get(t.auto_slot);
      return !!s && s.status === 'pronta' && s.fb?.verdict === 'ok';
    }
    return mine.some((c) => c.task_id === t.id && c.status === 'feita');
  };
  const statusOf = (t: Task): 'feita' | 'andamento' | 'pendente' => (isDone(t) ? 'feita' : mine.some((c) => c.task_id === t.id && c.status === 'andamento') ? 'andamento' : 'pendente');
  const main = (n: number) => o.tasks.filter((t) => t.level === n && !t.bonus);
  const current = o.levels.find((l) => main(l.n).length > 0 && main(l.n).some((t) => !isDone(t))) ?? o.levels[o.levels.length - 1];
  const lvlTasks = current ? o.tasks.filter((t) => t.level === current.n) : [];
  const xpMax = lvlTasks.reduce((a, t) => a + t.xp, 0);
  const xpLevel = lvlTasks.filter(isDone).reduce((a, t) => a + t.xp, 0);
  const xpTotal = o.tasks.filter(isDone).reduce((a, t) => a + t.xp, 0);
  return { current, xpMax, xpLevel, xpTotal, pct: xpMax ? Math.round((xpLevel / xpMax) * 100) : 0, isDone, statusOf };
}

export const daysSince = (iso: string | null | undefined) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);
