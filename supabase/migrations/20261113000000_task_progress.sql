-- Tarefas da Gamificação com estado "em andamento".
-- Uma linha em task_completions agora pode ser 'andamento' ou 'feita'. Sem linha = pendente.

alter table task_completions
  add column if not exists status text not null default 'feita'
    check (status in ('andamento', 'feita')),
  add column if not exists updated_at timestamptz not null default now();

drop policy if exists "atualiza tarefa" on task_completions;
create policy "atualiza tarefa" on task_completions for update to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());

-- Também barra tarefa automática no update (não só no insert).
drop trigger if exists task_completions_bu on task_completions;
create trigger task_completions_bu before update on task_completions
  for each row execute function task_completions_guard();
