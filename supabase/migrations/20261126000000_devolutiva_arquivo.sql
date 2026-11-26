-- Devolutiva em arquivo: a equipe sobe o PDF/Word comentado em files/devolutivas/{submission_id}/...
-- A equipe já lê e grava em "files" (políticas anteriores). O aluno só lê o arquivo da própria
-- devolutiva, e só depois de liberada (antes disso nem o veredito aparece para ele).
create or replace function public.devolutiva_visivel(p_sub text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from submissions s
     where s.id::text = p_sub and s.student_id = auth.uid() and s.status = 'pronta'
  );
$$;
revoke execute on function public.devolutiva_visivel(text) from anon, public;
grant execute on function public.devolutiva_visivel(text) to authenticated;

drop policy if exists "aluno lê a devolutiva em arquivo liberada" on storage.objects;
create policy "aluno lê a devolutiva em arquivo liberada" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = 'devolutivas' and public.devolutiva_visivel((storage.foldername(name))[2]));
