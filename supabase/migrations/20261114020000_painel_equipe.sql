-- Painel da equipe: situação do aluno, motivo do Botão Vermelho e a equipe marcando tarefas.

alter table profiles
  add column if not exists status text not null default 'ativo'
    check (status in ('ativo', 'onboarding', 'pausado'));

-- O aluno não muda a própria situação (além de papel, grupo e e-mail, que já eram protegidos).
create or replace function protect_profile_fields() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not is_staff() then
    new.role := old.role;
    new.group_name := old.group_name;
    new.email := old.email;
    new.created_at := old.created_at;
    new.status := old.status;
  end if;
  return new;
end $$;

alter table red_button
  add column if not exists reason text not null default '',
  add column if not exists staff_status text not null default 'solicitado'
    check (staff_status in ('solicitado', 'agendado', 'realizado')),
  add column if not exists staff_notes text not null default '';

drop policy if exists "equipe atualiza botão vermelho" on red_button;
create policy "equipe atualiza botão vermelho" on red_button for update to authenticated
  using (is_staff()) with check (is_staff());

-- A equipe também pode marcar e desmarcar tarefas pela ficha do aluno.
drop policy if exists "equipe marca tarefa" on task_completions;
create policy "equipe marca tarefa" on task_completions for insert to authenticated with check (is_staff());
drop policy if exists "equipe atualiza tarefa" on task_completions;
create policy "equipe atualiza tarefa" on task_completions for update to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "equipe desmarca tarefa" on task_completions;
create policy "equipe desmarca tarefa" on task_completions for delete to authenticated using (is_staff());

-- Tarefas e níveis: a equipe já edita (políticas da migração inicial).
