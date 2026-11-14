import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SLOT_ORDER, type Feedback, type Slot, type SubmissionStatus, type Verdict } from '../../shared/domain';
import { useAuth } from './auth';
import { supabase } from './supabase';

// ---------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------
export interface Submission {
  id: string;
  slot: Slot;
  version: number;
  status: SubmissionStatus;
  source_kind: 'file' | 'link' | 'text';
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  link_url: string | null;
  pasted_text: string | null;
  note: string | null;
  due_at: string;
  created_at: string;
}
export interface StudentFeedback {
  submission_id: string;
  slot: Slot;
  version: number;
  released: Feedback;
  verdict: Verdict;
  released_at: string;
  checks: boolean[];
  seen_at: string | null;
  reviewer_name: string | null;
}
export type Version = Submission & { verdict: Verdict | null; feedback: StudentFeedback | null };
export interface DocState {
  slot: Slot;
  status: 'none' | SubmissionStatus;
  latest: Version | null;
  versions: Version[]; // da mais antiga para a mais nova
  unseen: boolean;
}

const unwrap = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

const useUid = () => useAuth().session?.user.id;

// ---------------------------------------------------------------------
// Documentos do aluno
// ---------------------------------------------------------------------
export function useDocs() {
  const uid = useUid();
  const subs = useQuery({
    queryKey: ['submissions', uid],
    enabled: !!uid,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('submissions')
          .select('id, slot, version, status, source_kind, file_path, file_name, file_size, link_url, pasted_text, note, due_at, created_at')
          .eq('student_id', uid!)
          .order('version'),
      ) as Submission[],
    refetchInterval: (q) => (q.state.data?.some((s) => s.status !== 'pronta') ? 10_000 : false),
  });
  const fbs = useQuery({
    queryKey: ['student_feedbacks', uid],
    enabled: !!uid,
    queryFn: async () => unwrap(await supabase.from('student_feedbacks').select('*')) as StudentFeedback[],
    refetchInterval: () => (subs.data?.some((s) => s.status !== 'pronta') ? 10_000 : false),
  });

  const docs = {} as Record<Slot, DocState>;
  for (const slot of SLOT_ORDER) {
    const versions: Version[] = (subs.data || [])
      .filter((s) => s.slot === slot)
      .map((s) => {
        const feedback = fbs.data?.find((f) => f.submission_id === s.id) ?? null;
        return { ...s, feedback, verdict: feedback?.verdict ?? null };
      });
    const latest = versions[versions.length - 1] ?? null;
    docs[slot] = {
      slot,
      versions,
      latest,
      status: latest ? latest.status : 'none',
      unseen: !!latest && latest.status === 'pronta' && !!latest.feedback && !latest.feedback.seen_at,
    };
  }
  const unseen = SLOT_ORDER.filter((s) => docs[s].unseen);
  return {
    docs,
    unseen,
    isLoading: subs.isLoading || fbs.isLoading,
    isError: subs.isError || fbs.isError,
    refetch: () => Promise.all([subs.refetch(), fbs.refetch()]),
  };
}

export function useMarkSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (submissionId: string) => unwrap(await supabase.rpc('mark_feedback_seen', { p_submission: submissionId })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student_feedbacks'] }),
  });
}

export function useSetChecks() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async ({ submissionId, checks }: { submissionId: string; checks: boolean[] }) =>
      unwrap(await supabase.rpc('set_feedback_checks', { p_submission: submissionId, p_checks: checks })),
    onMutate: async ({ submissionId, checks }) => {
      qc.setQueryData<StudentFeedback[]>(['student_feedbacks', uid], (old) =>
        old?.map((f) => (f.submission_id === submissionId ? { ...f, checks } : f)),
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: ['student_feedbacks'] }),
  });
}

// ---------------------------------------------------------------------
// Gamificação
// ---------------------------------------------------------------------
export interface Level { n: number; name: string; tagline: string | null; goal: string | null }
export interface TaskMark { task_id: number; status: 'andamento' | 'feita'; updated_at?: string }
/** href: para onde leva a tarefa automática (documento ligado a ela). */
export type TaskState = { kind: 'pendente' | 'feita' | 'andamento'; note?: string; href?: string };
export interface Task { id: number; level: number; position: number; title: string; description: string; category: string; xp: number; auto_slot: Slot | null; bonus: boolean }

export function useGami() {
  const uid = useUid();
  const levels = useQuery({ queryKey: ['levels'], queryFn: async () => unwrap(await supabase.from('levels').select('*').order('n')) as Level[], staleTime: 600_000 });
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: async () => unwrap(await supabase.from('tasks').select('*').order('level').order('position')) as Task[], staleTime: 600_000 });
  const comp = useQuery({
    queryKey: ['task_completions', uid],
    enabled: !!uid,
    queryFn: async (): Promise<TaskMark[]> => {
      const r = await supabase.from('task_completions').select('task_id, status, updated_at');
      // Antes da migração 20261113 a coluna status não existe: tudo que está lá conta como feito.
      if (r.error) return (unwrap(await supabase.from('task_completions').select('task_id')) as { task_id: number }[]).map((x) => ({ task_id: x.task_id, status: 'feita' }));
      return r.data as TaskMark[];
    },
  });
  const { docs, isLoading: dl, isError: de } = useDocs();

  const mark = (t: Task) => comp.data?.find((m) => m.task_id === t.id)?.status;
  const isDone = (t: Task) =>
    t.auto_slot ? docs[t.auto_slot].status === 'pronta' && docs[t.auto_slot].latest?.verdict === 'ok' : mark(t) === 'feita';
  /** Situação da tarefa, com o motivo quando está em andamento. */
  const stateOf = (t: Task): TaskState => {
    if (t.auto_slot) {
      const slot = t.auto_slot, d = docs[slot];
      if (isDone(t)) return { kind: 'feita', note: 'Concluída pela devolutiva', href: `/documentos/${slot}/devolutiva` };
      if (d.status === 'analise') return { kind: 'andamento', note: 'Material enviado · em análise', href: `/documentos/${slot}/status` };
      if (d.status === 'revisao') return { kind: 'andamento', note: 'Em revisão pela equipe', href: `/documentos/${slot}/status` };
      if (d.status === 'pronta') return { kind: 'andamento', note: 'Devolutiva pediu ajustes · envie a nova versão', href: `/documentos/${slot}/devolutiva` };
      return { kind: 'pendente', note: 'Conclui sozinha quando a devolutiva vier Aprovado · Enviar material', href: `/documentos/nova?slot=${slot}` };
    }
    if (isDone(t)) return { kind: 'feita' };
    return mark(t) === 'andamento' ? { kind: 'andamento' } : { kind: 'pendente' };
  };


  const lv = levels.data || [];
  const ts = tasks.data || [];
  const byLevel = (n: number) => ts.filter((t) => t.level === n);
  // Nível atual: o primeiro com tarefas e alguma pendente (níveis sem tarefas cadastradas contam como concluídos se anteriores).
  // Só as tarefas principais definem o nível; missões bônus somam XP mas não seguram a subida.
  const mainOf = (n: number) => byLevel(n).filter((t) => !t.bonus);
  const current = lv.find((l) => mainOf(l.n).length > 0 && mainOf(l.n).some((t) => !isDone(t))) ?? lv[lv.length - 1];
  const curTasks = current ? byLevel(current.n) : [];
  const xpMax = curTasks.reduce((a, t) => a + t.xp, 0);
  const xpLevel = curTasks.filter(isDone).reduce((a, t) => a + t.xp, 0);
  const xpTotal = ts.filter(isDone).reduce((a, t) => a + t.xp, 0);
  const curStarted = curTasks.filter((t) => !t.bonus && stateOf(t).kind === 'andamento');
  /** Quando a tarefa foi concluída (data da devolutiva aprovada, nas automáticas). */
  const doneAt = (t: Task): string | null => {
    if (!isDone(t)) return null;
    if (t.auto_slot) return docs[t.auto_slot].latest?.feedback?.released_at ?? null;
    return comp.data?.find((m) => m.task_id === t.id)?.updated_at ?? null;
  };
  return {
    doneAt,
    stateOf,
    tasksStarted: curStarted.length,
    xpStarted: curStarted.reduce((a, t) => a + t.xp, 0),
    levels: lv,
    tasks: ts,
    byLevel,
    isDone,
    current,
    xpMax,
    xpLevel,
    xpTotal,
    tasksDone: curTasks.filter((t) => !t.bonus && isDone(t)).length,
    tasksTotal: curTasks.filter((t) => !t.bonus).length,
    mainOf,
    isLoading: levels.isLoading || tasks.isLoading || comp.isLoading || dl,
    isError: levels.isError || tasks.isError || comp.isError || de,
    refetch: () => Promise.all([levels.refetch(), tasks.refetch(), comp.refetch()]),
  };
}

export function useSetTaskStatus() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: 'pendente' | TaskMark['status'] }) => {
      if (status === 'pendente') return unwrap(await supabase.from('task_completions').delete().eq('task_id', taskId).eq('student_id', uid!));
      const up = await supabase.from('task_completions').upsert({ student_id: uid, task_id: taskId, status, updated_at: new Date().toISOString() });
      if (!up.error) return null;
      // Banco ainda sem a coluna status: só dá para marcar como feita.
      if (status === 'andamento') throw new Error('Rode a migração 20261113_task_progress no Supabase para usar "Em andamento".');
      return unwrap(await supabase.from('task_completions').insert({ task_id: taskId }));
    },
    onMutate: ({ taskId, status }) =>
      qc.setQueryData<TaskMark[]>(['task_completions', uid], (old = []) => {
        const rest = old.filter((m) => m.task_id !== taskId);
        return status === 'pendente' ? rest : [...rest, { task_id: taskId, status }];
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['task_completions'] }),
  });
}

// ---------------------------------------------------------------------
// Relatórios, sessões, pesquisa, arquivos, configurações
// ---------------------------------------------------------------------
export interface Report {
  id: string; student_id: string; period_start: string; period_end: string; created_at: string; updated_at: string;
  executed: boolean; actions: string;
  revenue: number; contacts: number; responses: number; appointments: number; meetings: number; closed: number; proposals: number; notes: string;
  wins: string; struggles: string; blocker: string; needs: string; next_focus: string;
  staff_comment: string | null; staff_comment_at: string | null;
}

export function useReports() {
  const uid = useUid();
  return useQuery({
    queryKey: ['reports', uid],
    enabled: !!uid,
    queryFn: async () =>
      (unwrap(await supabase.from('reports').select('*').order('period_end', { ascending: false })) as Report[]).map((r) => ({ ...r, revenue: Number(r.revenue) })),
  });
}

export function useRedButton() {
  const uid = useUid();
  return useQuery({
    queryKey: ['red_button', uid],
    enabled: !!uid,
    queryFn: async () => unwrap(await supabase.from('red_button').select('used_at, reason, staff_status, staff_notes').maybeSingle()) as { used_at: string; reason: string; staff_status: 'solicitado' | 'agendado' | 'realizado'; staff_notes: string } | null,
  });
}

export function useSurvey() {
  const uid = useUid();
  return useQuery({
    queryKey: ['survey', uid],
    enabled: !!uid,
    queryFn: async () => unwrap(await supabase.from('survey_responses').select('created_at').maybeSingle()) as { created_at: string } | null,
  });
}

export interface StudentFile { id: string; kind: 'apresentacao' | 'outros'; file_name: string; file_size: number | null; created_at: string }
export function useStudentFiles() {
  const uid = useUid();
  return useQuery({
    queryKey: ['student_files', uid],
    enabled: !!uid,
    queryFn: async () => unwrap(await supabase.from('student_files').select('id, kind, file_name, file_size, created_at').order('created_at', { ascending: false })) as StudentFile[],
  });
}

export function useSetting(key: string) {
  return useQuery({
    queryKey: ['setting', key],
    queryFn: async () => (unwrap(await supabase.from('settings').select('value').eq('key', key).maybeSingle()) as { value: string } | null)?.value ?? null,
    staleTime: 600_000,
  });
}

// ---------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------
export interface QueueRow {
  id: string;
  slot: Slot;
  version: number;
  status: SubmissionStatus;
  due_at: string;
  created_at: string;
  student: { full_name: string; studio: string; group_name: string | null };
  fb: { ai_status: 'pending' | 'queued' | 'done' | 'failed'; verdict: Verdict | null; released_at: string | null; draft_saved_at: string | null; saver: { full_name: string } | null; reviewer: { full_name: string } | null };
}

export function useQueue() {
  return useQuery({
    queryKey: ['queue'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('submissions')
          .select(
            'id, slot, version, status, due_at, created_at, student:profiles!submissions_student_id_fkey(full_name, studio, group_name), fb:feedbacks(ai_status, verdict, released_at, draft_saved_at, saver:profiles!feedbacks_draft_saved_by_fkey(full_name), reviewer:profiles!feedbacks_reviewer_id_fkey(full_name))',
          )
          .order('due_at'),
      ) as unknown as QueueRow[],
    refetchInterval: 20_000,
  });
}

export interface ReviewItem {
  id: string;
  slot: Slot;
  version: number;
  status: SubmissionStatus;
  source_kind: 'file' | 'link' | 'text';
  file_path: string | null;
  file_name: string | null;
  link_url: string | null;
  pasted_text: string | null;
  note: string | null;
  due_at: string;
  created_at: string;
  student: { full_name: string; studio: string; group_name: string | null };
  fb: {
    ai_status: 'pending' | 'queued' | 'done' | 'failed';
    ai_error: string | null;
    draft: Feedback | null;
    released: Feedback | null;
    material_text: string | null;
    draft_saved_at: string | null;
    saver: { full_name: string } | null;
  };
}

export function useReviewItem(id: string | undefined) {
  return useQuery({
    queryKey: ['review', id],
    enabled: !!id,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('submissions')
          .select(
            'id, slot, version, status, source_kind, file_path, file_name, link_url, pasted_text, note, due_at, created_at, student:profiles!submissions_student_id_fkey(full_name, studio, group_name), fb:feedbacks(ai_status, ai_error, draft, released, material_text, draft_saved_at, saver:profiles!feedbacks_draft_saved_by_fkey(full_name))',
          )
          .eq('id', id!)
          .single(),
      ) as unknown as ReviewItem,
    refetchInterval: (q) => (q.state.data && ['pending', 'queued'].includes(q.state.data.fb.ai_status) ? 8_000 : false),
  });
}
