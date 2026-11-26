-- =====================================================================
-- Ranking da gamificação.
-- Mesma regra de XP da tela do aluno: tarefa marcada como feita, ou tarefa
-- automática cuja última versão do documento veio Aprovado.
-- Devolve só nome curto, foto, turma, nível e XP (nada de faturamento).
-- O aluno pode esconder o nome (ranking_visivel = false): continua na
-- contagem, mas aparece como "Participante" para os outros.
-- =====================================================================

alter table profiles add column if not exists ranking_visivel boolean not null default true;

create or replace function ranking_alunos()
returns table (
  pos_total int, pos_mes int, student_id uuid, nome text, avatar_path text, grupo text,
  nivel int, nivel_nome text, xp_total int, xp_mes int, tarefas int, eu boolean
)
language sql stable security definer set search_path = public as $$
  with alunos as (
    select id, full_name, avatar_path, group_name, ranking_visivel
      from profiles
     where role = 'aluno' and status <> 'encerrado'
  ),
  ultima as ( -- última versão de cada documento de cada aluno
    select distinct on (s.student_id, s.slot) s.student_id, s.slot, s.status, f.verdict, f.released_at
      from submissions s
      left join feedbacks f on f.submission_id = s.id
     order by s.student_id, s.slot, s.version desc
  ),
  feitas as (
    select c.student_id, t.id as task_id, t.xp, c.updated_at as quando
      from task_completions c
      join tasks t on t.id = c.task_id
     where c.status = 'feita' and t.auto_slot is null
    union all
    select u.student_id, t.id, t.xp, u.released_at
      from ultima u
      join tasks t on t.auto_slot = u.slot
     where u.status = 'pronta' and u.verdict = 'ok'
  ),
  mes as (select (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as inicio),
  tot as (
    select a.id,
           coalesce(sum(f.xp), 0)::int as xp_total,
           coalesce(sum(f.xp) filter (where f.quando >= (select inicio from mes)), 0)::int as xp_mes,
           count(f.task_id)::int as tarefas
      from alunos a
      left join feitas f on f.student_id = a.id
     group by a.id
  ),
  nivel as ( -- primeiro nível com alguma tarefa principal ainda não feita
    select a.id,
           coalesce(
             (select min(l.n) from levels l
               where exists (select 1 from tasks t where t.level = l.n and not t.bonus
                               and not exists (select 1 from feitas f where f.student_id = a.id and f.task_id = t.id))),
             (select max(n) from levels)
           ) as n
      from alunos a
  ),
  base as (
    select a.id, a.full_name, a.avatar_path, a.group_name, a.ranking_visivel, t.xp_total, t.xp_mes, t.tarefas, n.n as nivel
      from alunos a join tot t on t.id = a.id join nivel n on n.id = a.id
  )
  select
    (rank() over (order by b.xp_total desc, b.tarefas desc))::int,
    (rank() over (order by b.xp_mes desc, b.xp_total desc))::int,
    b.id,
    case when b.ranking_visivel or b.id = auth.uid() then
      split_part(trim(b.full_name), ' ', 1) ||
      case when position(' ' in trim(b.full_name)) > 0 then ' ' || left(regexp_replace(trim(b.full_name), '^.*\s', ''), 1) || '.' else '' end
    else 'Participante' end,
    case when b.ranking_visivel or b.id = auth.uid() then b.avatar_path end,
    b.group_name,
    b.nivel,
    (select name from levels where n = b.nivel),
    b.xp_total, b.xp_mes, b.tarefas,
    b.id = auth.uid()
  from base b
  where auth.uid() is not null
  order by 1, 5;
$$;
revoke all on function ranking_alunos() from public, anon;
grant execute on function ranking_alunos() to authenticated;

-- Fotos de perfil visíveis para quem está logado (aparecem no ranking).
drop policy if exists "logados veem fotos de perfil" on storage.objects;
create policy "logados veem fotos de perfil" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[2] = 'avatar');
