-- Agenda feita no painel da equipe (reflete no calendário do aluno) e planos de ação com acompanhamento.

-- ---------------------------------------------------------------- Agenda
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) > 0),
  kind text not null default 'aula' check (kind in ('aula', 'lab', 'massa', 'direcionamento', 'emergencia', 'outro')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  meet_url text not null default '',
  location text not null default '',
  description text not null default '',
  audience text not null default 'todos' check (audience in ('todos', 'grupo', 'alunos')),
  group_name text references groups(name) on update cascade on delete set null,
  canceled boolean not null default false,
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists events_start on events (starts_at);

-- Quem foi convidado, a resposta e o aviso pendente (novo, alterado, cancelado).
create table if not exists event_attendees (
  event_id uuid not null references events(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  response text not null default 'pendente' check (response in ('pendente', 'vou', 'nao_vou')),
  notice text check (notice in ('novo', 'alterado', 'cancelado')),
  notice_text text not null default '',
  responded_at timestamptz,
  primary key (event_id, student_id)
);
create index if not exists event_attendees_student on event_attendees (student_id);

create table if not exists event_files (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  created_at timestamptz not null default now()
);

create or replace function is_attendee(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from event_attendees where event_id = eid and student_id = auth.uid())
$$;
grant execute on function is_attendee(uuid) to authenticated;

alter table events enable row level security;
alter table event_attendees enable row level security;
alter table event_files enable row level security;
drop policy if exists "vê eventos" on events;
create policy "vê eventos" on events for select to authenticated using (is_staff() or is_attendee(id));
drop policy if exists "equipe gerencia eventos" on events;
create policy "equipe gerencia eventos" on events for all to authenticated using (is_staff()) with check (is_staff());

drop policy if exists "vê convites" on event_attendees;
create policy "vê convites" on event_attendees for select to authenticated using (is_staff() or student_id = auth.uid());
drop policy if exists "equipe gerencia convites" on event_attendees;
create policy "equipe gerencia convites" on event_attendees for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "aluno responde convite" on event_attendees;
create policy "aluno responde convite" on event_attendees for update to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "vê arquivos do evento" on event_files;
create policy "vê arquivos do evento" on event_files for select to authenticated using (is_staff() or is_attendee(event_id));
drop policy if exists "equipe gerencia arquivos do evento" on event_files;
create policy "equipe gerencia arquivos do evento" on event_files for all to authenticated using (is_staff()) with check (is_staff());

-- Arquivos do evento ficam em files/eventos/{event_id}/…; o aluno convidado pode abrir.
drop policy if exists "aluno lê arquivos de evento" on storage.objects;
create policy "aluno lê arquivos de evento" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = 'eventos' and is_attendee(((storage.foldername(name))[2])::uuid));

-- O aluno só muda a própria resposta (e limpa o aviso); o resto é da equipe.
create or replace function attendee_protect() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not is_staff() then
    new.event_id := old.event_id;
    new.student_id := old.student_id;
    new.notice_text := old.notice_text;
    if new.notice is not null then new.notice := old.notice; end if;
    new.responded_at := now();
  end if;
  return new;
end $$;
drop trigger if exists event_attendees_bu on event_attendees;
create trigger event_attendees_bu before update on event_attendees for each row execute function attendee_protect();

-- ---------------------------------------------------------------- Planos de ação
create table if not exists action_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  title text not null default 'Plano de ação',
  event_id uuid references events(id) on delete set null,
  archived boolean not null default false,
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists action_plans_student on action_plans (student_id);

create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references action_plans(id) on delete cascade,
  position int not null default 0,
  text text not null check (char_length(trim(text)) > 0),
  due_date date,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists action_items_plan on action_items (plan_id, position);

-- Registro de quando a equipe cobrou o aluno.
create table if not exists plan_nudges (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references action_plans(id) on delete cascade,
  channel text not null default 'whatsapp',
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function owns_plan(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from action_plans where id = pid and student_id = auth.uid())
$$;
grant execute on function owns_plan(uuid) to authenticated;

alter table action_plans enable row level security;
alter table action_items enable row level security;
alter table plan_nudges enable row level security;
drop policy if exists "vê planos" on action_plans;
create policy "vê planos" on action_plans for select to authenticated using (is_staff() or student_id = auth.uid());
drop policy if exists "equipe gerencia planos" on action_plans;
create policy "equipe gerencia planos" on action_plans for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "vê itens" on action_items;
create policy "vê itens" on action_items for select to authenticated using (is_staff() or owns_plan(plan_id));
drop policy if exists "equipe gerencia itens" on action_items;
create policy "equipe gerencia itens" on action_items for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "aluno marca item" on action_items;
create policy "aluno marca item" on action_items for update to authenticated using (owns_plan(plan_id)) with check (owns_plan(plan_id));
drop policy if exists "equipe vê cobranças" on plan_nudges;
create policy "equipe vê cobranças" on plan_nudges for all to authenticated using (is_staff()) with check (is_staff());

-- O aluno só marca/desmarca: não muda o texto, a ordem nem o prazo.
create or replace function action_item_protect() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not is_staff() then
    new.plan_id := old.plan_id;
    new.text := old.text;
    new.position := old.position;
    new.due_date := old.due_date;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists action_items_bu on action_items;
create trigger action_items_bu before update on action_items for each row execute function action_item_protect();
