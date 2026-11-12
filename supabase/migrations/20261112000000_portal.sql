-- =====================================================================
-- Portal do Aluno RCN · esquema inicial
-- Rodar no SQL Editor do Supabase (ou `supabase db push`).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type doc_slot as enum ('portfolio','proposta_arquitetos','proposta_construtoras','contrato');
create type submission_status as enum ('analise','revisao','pronta');
create type verdict as enum ('ok','aj','re');
create type ai_status as enum ('pending','queued','done','failed');
create type user_role as enum ('aluno','staff');

-- ---------------------------------------------------------------------
-- Grupos e códigos de turma
-- ---------------------------------------------------------------------
create table groups (
  name text primary key,
  color text not null
);
insert into groups (name, color) values
  ('Zorango Tango', '#7A4FD0'),
  ('Octa Performance', '#0E7C66');

create table class_codes (
  code text primary key check (code = upper(code)),
  group_name text not null references groups(name),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Troque pelos códigos reais das turmas.
insert into class_codes (code, group_name) values
  ('ZT-4821', 'Zorango Tango'),
  ('OP-1093', 'Octa Performance');

-- ---------------------------------------------------------------------
-- Perfis
-- ---------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  studio text not null default '',
  city text not null default '',
  whatsapp text not null default '',
  instagram text not null default '',
  group_name text references groups(name),
  role user_role not null default 'aluno',
  email_notify boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'staff');
$$;

-- Valida um código de turma sem expor a tabela (usado na tela de primeiro acesso).
create or replace function check_class_code(p_code text) returns text
language sql stable security definer set search_path = public as $$
  select group_name from class_codes where code = upper(trim(p_code)) and active;
$$;
grant execute on function check_class_code(text) to anon, authenticated;

-- Cria o perfil quando a conta nasce. O código da turma vem em raw_user_meta_data.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare g text;
begin
  select group_name into g from class_codes
   where code = upper(trim(coalesce(new.raw_user_meta_data->>'class_code', ''))) and active;
  if g is null then
    raise exception 'Código da turma inválido';
  end if;
  insert into profiles (id, full_name, email, group_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), coalesce(new.email, ''), g);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- O aluno não pode mudar o próprio grupo, papel nem e-mail.
-- (auth.uid() nulo = SQL Editor ou service role: liberado.)
create or replace function protect_profile_fields() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not is_staff() then
    new.role := old.role;
    new.group_name := old.group_name;
    new.email := old.email;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on profiles
  for each row execute function protect_profile_fields();

-- ---------------------------------------------------------------------
-- Envios e devolutivas
-- ---------------------------------------------------------------------
create table submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  slot doc_slot not null,
  version int not null,
  source_kind text not null check (source_kind in ('file','link','text')),
  file_path text, file_name text, file_size bigint,
  link_url text, pasted_text text,
  note text,
  status submission_status not null default 'analise',
  due_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (student_id, slot, version),
  check (
    (source_kind = 'file' and file_path is not null) or
    (source_kind = 'link' and link_url is not null) or
    (source_kind = 'text' and char_length(pasted_text) >= 80)
  )
);
create index submissions_status_due on submissions (status, due_at);

create table feedbacks (
  submission_id uuid primary key references submissions(id) on delete cascade,
  ai_status ai_status not null default 'pending',
  ai_error text,
  ai_attempts int not null default 0,
  ai_draft jsonb,                       -- rascunho original da IA (auditoria)
  material_text text,                   -- texto extraído (docx/link), para a equipe ler
  draft jsonb,                          -- versão em edição pela equipe
  draft_saved_by uuid references profiles(id), draft_saved_at timestamptz,
  released jsonb,                       -- o que o aluno vê
  verdict verdict,
  reviewer_id uuid references profiles(id), released_at timestamptz,
  notified_at timestamptz,
  checks boolean[] not null default '{}',
  seen_at timestamptz
);

-- Numera a versão, calcula o prazo e cria a linha de devolutiva.
create or replace function submissions_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare last_status submission_status;
begin
  if not is_staff() and new.student_id is distinct from auth.uid() then
    raise exception 'Envio de outro aluno';
  end if;
  select status into last_status from submissions
   where student_id = new.student_id and slot = new.slot
   order by version desc limit 1;
  if last_status is not null and last_status <> 'pronta' then
    raise exception 'Já existe uma versão deste material em andamento';
  end if;
  new.version := coalesce((select max(version) from submissions
                            where student_id = new.student_id and slot = new.slot), 0) + 1;
  new.status := 'analise';
  new.created_at := now();
  new.due_at := now() + interval '48 hours';
  return new;
end $$;
create trigger submissions_bi before insert on submissions
  for each row execute function submissions_before_insert();

create or replace function submissions_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into feedbacks (submission_id) values (new.id);
  return new;
end $$;
create trigger submissions_ai after insert on submissions
  for each row execute function submissions_after_insert();

-- Libera a devolutiva numa transação. Chamada pela equipe (via Worker, com o JWT de quem revisou).
create or replace function release_feedback(p_submission uuid, p_draft jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare n_steps int;
begin
  if not is_staff() then raise exception 'Apenas a equipe pode liberar'; end if;
  if p_draft->>'verdict' not in ('ok','aj','re') then raise exception 'Escolha um veredito'; end if;
  n_steps := coalesce(jsonb_array_length(p_draft->'steps'), 0);
  update feedbacks set
    draft = p_draft, released = p_draft,
    verdict = (p_draft->>'verdict')::verdict,
    reviewer_id = auth.uid(), released_at = now(),
    draft_saved_by = auth.uid(), draft_saved_at = now(),
    checks = array_fill(false, array[n_steps]),
    seen_at = null
  where submission_id = p_submission;
  if not found then raise exception 'Envio não encontrado'; end if;
  update submissions set status = 'pronta' where id = p_submission;
end $$;

-- O aluno marca os próximos passos e a devolutiva como vista.
create or replace function set_feedback_checks(p_submission uuid, p_checks boolean[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  update feedbacks f set checks = p_checks
    from submissions s
   where f.submission_id = p_submission and s.id = f.submission_id
     and s.student_id = auth.uid() and s.status = 'pronta';
end $$;

create or replace function mark_feedback_seen(p_submission uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update feedbacks f set seen_at = coalesce(f.seen_at, now())
    from submissions s
   where f.submission_id = p_submission and s.id = f.submission_id
     and s.student_id = auth.uid() and s.status = 'pronta';
end $$;

-- O que o aluno pode ler: só a devolutiva liberada, nunca ai_draft nem draft.
create view student_feedbacks with (security_barrier) as
  select s.id as submission_id, s.slot, s.version,
         f.released, f.verdict, f.released_at, f.checks, f.seen_at,
         r.full_name as reviewer_name
    from submissions s
    join feedbacks f on f.submission_id = s.id
    left join profiles r on r.id = f.reviewer_id
   where s.status = 'pronta' and s.student_id = auth.uid();

-- ---------------------------------------------------------------------
-- Critérios da IA (tela D, fase seguinte)
-- ---------------------------------------------------------------------
create table criteria (
  id uuid primary key default gen_random_uuid(),
  slot doc_slot not null,
  group_name text references groups(name),     -- null = vale para todos
  name text not null,
  guidance text not null default '',
  weight text not null default 'medio' check (weight in ('baixo','medio','alto')),
  good_examples text[] not null default '{}',
  bad_examples text[] not null default '{}',
  position int not null default 0,
  published boolean not null default false
);

-- ---------------------------------------------------------------------
-- Outros envios (sem devolutiva)
-- ---------------------------------------------------------------------
create table student_files (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('apresentacao','outros')),
  file_path text not null, file_name text not null, file_size bigint,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Gamificação
-- ---------------------------------------------------------------------
create table levels (
  n int primary key,
  name text not null,
  tagline text,
  goal text
);
insert into levels (n, name, tagline, goal) values
  (1, 'Pioneiro', null, null),
  (2, 'Criador', 'Quem transforma talento em valor.', 'R$ 3.000/mês'),
  (3, 'Elite', null, null),
  (4, 'Titã', null, null),
  (5, 'Lenda', null, null),
  (6, 'Magnata', null, null);

create table tasks (
  id serial primary key,
  level int not null references levels(n),
  position int not null default 0,
  title text not null,
  description text not null default '',
  category text not null default '',
  xp int not null default 0,
  auto_slot doc_slot              -- conclui sozinha quando a última versão deste documento vem 'ok'
);
-- Tarefas de exemplo do protótipo. Substituir pelas 17 reais.
insert into tasks (level, position, title, description, category, xp, auto_slot) values
  (2, 1, '9 Imagens Portfólio', 'Finalizar 9 imagens para o portfólio', 'Portfólio', 80, null),
  (2, 2, '9 Imagens Instagram', 'Publicar as 9 imagens no Instagram', 'Conteúdo', 60, null),
  (2, 3, 'Portfólio Completo', 'Portfólio organizado no Instagram, Behance e PDF', 'Portfólio', 70, null),
  (2, 4, 'Calendário 30 dias', 'Programar o calendário editorial para 30 dias', 'Conteúdo', 50, null),
  (2, 5, 'Papo de Aluno', 'Dar aula no Papo de Aluno', 'Comunidade', 80, null),
  (2, 6, 'Encontros ao Vivo', 'Participar dos encontros ao vivo', 'Comunidade', 30, null),
  (2, 7, 'Proposta para construtoras aprovada', 'Receber "Aprovado" na devolutiva', 'Documentos', 100, 'proposta_construtoras'),
  (2, 8, 'Contrato aprovado', 'Receber "Aprovado" na devolutiva', 'Documentos', 100, 'contrato');

create table task_completions (
  student_id uuid not null references profiles(id) on delete cascade default auth.uid(),
  task_id int not null references tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, task_id)
);
-- Tarefas automáticas não podem ser marcadas à mão.
create or replace function task_completions_guard() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from tasks where id = new.task_id and auto_slot is not null) then
    raise exception 'Esta tarefa conclui sozinha pela devolutiva';
  end if;
  return new;
end $$;
create trigger task_completions_bi before insert on task_completions
  for each row execute function task_completions_guard();

-- ---------------------------------------------------------------------
-- Relatórios, sessões, pesquisa, configurações
-- ---------------------------------------------------------------------
create table reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade default auth.uid(),
  period_start date not null,
  period_end date not null,
  revenue numeric(12,2) not null default 0,
  contacts int not null default 0,
  proposals int not null default 0,
  closed int not null default 0,
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create table red_button (
  student_id uuid primary key references profiles(id) on delete cascade default auth.uid(),
  used_at timestamptz not null default now()
);

create table survey_responses (
  student_id uuid primary key references profiles(id) on delete cascade default auth.uid(),
  time_in_mentoring text not null,
  satisfaction int not null check (satisfaction between 0 and 10),
  contribution int not null check (contribution between 0 and 10),
  transformation text not null check (char_length(trim(transformation)) > 0),
  created_at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value text not null
);
insert into settings (key, value) values ('calendar_url', 'https://calendar.google.com/');

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table groups enable row level security;
alter table class_codes enable row level security;
alter table profiles enable row level security;
alter table submissions enable row level security;
alter table feedbacks enable row level security;
alter table criteria enable row level security;
alter table student_files enable row level security;
alter table levels enable row level security;
alter table tasks enable row level security;
alter table task_completions enable row level security;
alter table reports enable row level security;
alter table red_button enable row level security;
alter table survey_responses enable row level security;
alter table settings enable row level security;

create policy "todos leem grupos" on groups for select to authenticated using (true);
create policy "equipe gerencia códigos" on class_codes for all to authenticated using (is_staff()) with check (is_staff());

create policy "lê o próprio perfil" on profiles for select to authenticated using (id = auth.uid() or is_staff());
create policy "edita o próprio perfil" on profiles for update to authenticated using (id = auth.uid() or is_staff()) with check (id = auth.uid() or is_staff());

create policy "aluno lê os próprios envios" on submissions for select to authenticated using (student_id = auth.uid() or is_staff());
create policy "aluno cria os próprios envios" on submissions for insert to authenticated with check (student_id = auth.uid() or is_staff());
create policy "equipe edita envios" on submissions for update to authenticated using (is_staff()) with check (is_staff());

-- feedbacks: só a equipe acessa a tabela. O aluno usa a view student_feedbacks e as RPCs.
create policy "equipe acessa devolutivas" on feedbacks for all to authenticated using (is_staff()) with check (is_staff());

create policy "todos leem critérios publicados" on criteria for select to authenticated using (published or is_staff());
create policy "equipe edita critérios" on criteria for all to authenticated using (is_staff()) with check (is_staff());

create policy "arquivos próprios" on student_files for select to authenticated using (student_id = auth.uid() or is_staff());
create policy "envia arquivos próprios" on student_files for insert to authenticated with check (student_id = auth.uid());

create policy "todos leem níveis" on levels for select to authenticated using (true);
create policy "todos leem tarefas" on tasks for select to authenticated using (true);
create policy "equipe edita níveis" on levels for all to authenticated using (is_staff()) with check (is_staff());
create policy "equipe edita tarefas" on tasks for all to authenticated using (is_staff()) with check (is_staff());

create policy "tarefas próprias" on task_completions for select to authenticated using (student_id = auth.uid() or is_staff());
create policy "marca tarefa" on task_completions for insert to authenticated with check (student_id = auth.uid());
create policy "desmarca tarefa" on task_completions for delete to authenticated using (student_id = auth.uid());

create policy "relatórios próprios" on reports for select to authenticated using (student_id = auth.uid() or is_staff());
create policy "envia relatório" on reports for insert to authenticated with check (student_id = auth.uid());

create policy "botão vermelho próprio" on red_button for select to authenticated using (student_id = auth.uid() or is_staff());
create policy "aciona botão vermelho" on red_button for insert to authenticated with check (student_id = auth.uid());

create policy "pesquisa própria" on survey_responses for select to authenticated using (student_id = auth.uid() or is_staff());
create policy "responde pesquisa" on survey_responses for insert to authenticated with check (student_id = auth.uid());

create policy "todos leem configurações" on settings for select to authenticated using (true);
create policy "equipe edita configurações" on settings for all to authenticated using (is_staff()) with check (is_staff());

grant select on student_feedbacks to authenticated;
grant execute on function release_feedback(uuid, jsonb) to authenticated;
grant execute on function set_feedback_checks(uuid, boolean[]) to authenticated;
grant execute on function mark_feedback_seen(uuid) to authenticated;
grant execute on function is_staff() to authenticated;

-- ---------------------------------------------------------------------
-- Storage
-- Caminhos: submissions/{student_id}/{slot}/{arquivo} · files/{student_id}/{kind}/{arquivo}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('submissions', 'submissions', false, 52428800),
       ('files', 'files', false, 52428800)
on conflict (id) do nothing;

create policy "aluno envia para a própria pasta" on storage.objects for insert to authenticated
  with check (bucket_id in ('submissions','files') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "aluno lê a própria pasta; equipe lê tudo" on storage.objects for select to authenticated
  using (bucket_id in ('submissions','files') and ((storage.foldername(name))[1] = auth.uid()::text or is_staff()));
create policy "aluno apaga arquivo próprio" on storage.objects for delete to authenticated
  using (bucket_id in ('submissions','files') and (storage.foldername(name))[1] = auth.uid()::text);
