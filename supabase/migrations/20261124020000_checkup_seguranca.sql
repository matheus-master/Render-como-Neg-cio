-- Check-up de segurança (relatório do Supabase).

-- A visão das devolutivas liberadas é só leitura, e só para quem está logado.
revoke all on public.student_feedbacks from anon;
revoke insert, update, delete, truncate, references, trigger on public.student_feedbacks from authenticated;

-- Funções de gatilho com search_path fixo.
alter function public.task_completions_guard() set search_path = public;
alter function public.protect_profile_fields() set search_path = public;
alter function public.reports_protect() set search_path = public;
alter function public.action_item_protect() set search_path = public;
alter function public.attendee_protect() set search_path = public;

-- Ninguém de fora chama as funções privilegiadas pela API (só o código da turma, usado no primeiro acesso).
revoke execute on function public.access_active(uuid) from anon, public;
revoke execute on function public.is_attendee(uuid) from anon, public;
revoke execute on function public.is_staff() from anon, public;
revoke execute on function public.owns_plan(uuid) from anon, public;
revoke execute on function public.mark_feedback_seen(uuid) from anon, public;
revoke execute on function public.set_feedback_checks(uuid, boolean[]) from anon, public;
revoke execute on function public.release_feedback(uuid, jsonb) from anon, public;
grant execute on function public.access_active(uuid), public.is_attendee(uuid), public.is_staff(), public.owns_plan(uuid),
  public.mark_feedback_seen(uuid), public.set_feedback_checks(uuid, boolean[]), public.release_feedback(uuid, jsonb) to authenticated;
-- Funções de gatilho não são chamadas pela API.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.submissions_after_insert() from anon, authenticated, public;
revoke execute on function public.submissions_before_insert() from anon, authenticated, public;
