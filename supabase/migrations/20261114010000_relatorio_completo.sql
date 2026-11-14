-- Relatório quinzenal igual ao modelo em Word (RCN_Template_Relatorio_Quinzenal_Gamificacao)
-- + comentário da equipe ("Feedback da equipe RCN").
-- Mapeamento: wins = principais conquistas · struggles = principais desafios · next_focus = combinado / próximo passo.

alter table reports
  add column if not exists executed boolean not null default true,      -- Conseguiu executar ações nesta quinzena?
  add column if not exists actions text not null default '',            -- Ações realizadas na quinzena
  add column if not exists responses int not null default 0,            -- Respostas recebidas
  add column if not exists appointments int not null default 0,         -- Agendamentos
  add column if not exists meetings int not null default 0,             -- Reuniões feitas
  add column if not exists notes text not null default '',              -- Observações das métricas
  add column if not exists blocker text not null default '',            -- O que impediu a execução
  add column if not exists needs text not null default '',              -- O que precisa para destravar
  add column if not exists staff_comment text,
  add column if not exists staff_comment_by uuid references profiles(id),
  add column if not exists staff_comment_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- O aluno pode editar o próprio relatório; a equipe pode comentar qualquer um.
drop policy if exists "edita relatório" on reports;
create policy "edita relatório" on reports for update to authenticated
  using (student_id = auth.uid() or is_staff()) with check (student_id = auth.uid() or is_staff());

-- O aluno não mexe no comentário da equipe; a equipe só mexe no comentário.
create or replace function reports_protect() returns trigger
language plpgsql as $$
declare c text := new.staff_comment;
begin
  if auth.uid() is null then return new; end if;  -- SQL Editor / service role
  if is_staff() and old.student_id <> auth.uid() then
    new := old;                                     -- a equipe só altera o comentário
    new.staff_comment := nullif(trim(c), '');
    new.staff_comment_by := auth.uid();
    new.staff_comment_at := now();
  else
    new.staff_comment := old.staff_comment;         -- o aluno não altera o comentário
    new.staff_comment_by := old.staff_comment_by;
    new.staff_comment_at := old.staff_comment_at;
    new.student_id := old.student_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists reports_bu on reports;
create trigger reports_bu before update on reports for each row execute function reports_protect();
