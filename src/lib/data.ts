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
  file_name: string | null;
  file_size: number | null;
  link_url: string | null;
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
          .select('id, slot, version, status, source_kind, file_name, file_size, link_url, note, due_at, created_at')
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
export interface Task { id: number; level: number; position: number; title: string; description: string; category: string; xp: number; auto_slot: Slot | null }

export function useGami() {
  const uid = useUid();
  const levels = useQuery({ queryKey: ['levels'], queryFn: async () => unwrap(await supabase.from('levels').select('*').order('n')) as Level[], staleTime: 600_000 });
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: async () => unwrap(await supabase.from('tasks').select('*').order('level').order('position')) as Task[], staleTime: 600_000 });
  const comp = useQuery({
    queryKey: ['task_completions', uid],
    enabled: !!uid,
    queryFn: async () => (unwrap(await supabase.from('task_completions').select('task_id')) as { task_id: number }[]).map((r) => r.task_id),
  });
  const { docs, isLoading: dl, isError: de } = useDocs();

  const isDone = (t: Task) =>
    t.auto_slot ? docs[t.auto_slot].status === 'pronta' && docs[t.auto_slot].latest?.verdict === 'ok' : !!comp.data?.includes(t.id);

  const lv = levels.data || [];
  const ts = tasks.data || [];
  const byLevel = (n: number) => ts.filter((t) => t.level === n);
  // Nível atual: o primeiro com tarefas e alguma pendente (níveis sem tarefas cadastradas contam como concluídos se anteriores).
  const current = lv.find((l) => byLevel(l.n).length > 0 && byLevel(l.n).some((t) => !isDone(t))) ?? lv[lv.length - 1];
  const curTasks = current ? byLevel(current.n) : [];
  const xpMax = curTasks.reduce((a, t) => a + t.xp, 0);
  const xpLevel = curTasks.filter(isDone).reduce((a, t) => a + t.xp, 0);
  const xpTotal = ts.filter(isDone).reduce((a, t) => a + t.xp, 0);
  return {
    levels: lv,
    tasks: ts,
    byLevel,
    isDone,
    current,
    xpMax,
    xpLevel,
    xpTotal,
    tasksDone: curTasks.filter(isDone).length,
    tasksTotal: curTasks.length,
    isLoading: levels.isLoading || tasks.isLoading || comp.isLoading || dl,
    isError: levels.isError || tasks.isError || comp.isError || de,
    refetch: () => Promise.all([levels.refetch(), tasks.refetch(), comp.refetch()]),
  };
}

export function useToggleTask() {
  const qc = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: async ({ taskId, done }: { taskId: number; done: boolean }) =>
      done
        ? unwrap(await supabase.from('task_completions').insert({ task_id: taskId }))
        : unwrap(await supabase.from('task_completions').delete().eq('task_id', taskId).eq('student_id', uid!)),
    onMutate: ({ taskId, done }) =>
      qc.setQueryData<number[]>(['task_completions', uid], (old = []) => (done ? [...old, taskId] : old.filter((x) => x !== taskId))),
    onSettled: () => qc.invalidateQueries({ queryKey: ['task_completions'] }),
  });
}

// ---------------------------------------------------------------------
// Relatórios, sessões, pesquisa, arquivos, configurações
// ---------------------------------------------------------------------
export interface Report { id: string; period_start: string; period_end: string; revenue: number; contacts: number; proposals: number; closed: number; created_at: string }

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
    queryFn: async () => unwrap(await supabase.from('red_button').select('used_at').maybeSingle()) as { used_at: string } | null,
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
