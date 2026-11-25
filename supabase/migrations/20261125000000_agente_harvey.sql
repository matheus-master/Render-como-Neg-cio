-- Agente Harvey (vendas): conversas do aluno com o agente, guardadas por conversa.
create table if not exists agent_threads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade default auth.uid(),
  agent text not null default 'harvey',
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_threads_student on agent_threads (student_id, agent, updated_at desc);

create table if not exists agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references agent_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  images text[] not null default '{}',   -- caminhos no bucket "files" ({aluno}/harvey/…)
  usage jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_messages_thread on agent_messages (thread_id, created_at);

create or replace function owns_thread(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from agent_threads where id = tid and student_id = auth.uid())
$$;
revoke execute on function owns_thread(uuid) from anon, public;
grant execute on function owns_thread(uuid) to authenticated;

alter table agent_threads enable row level security;
alter table agent_messages enable row level security;
-- O aluno vê e mexe nas próprias conversas; a equipe pode ler para acompanhar o aluno.
drop policy if exists "vê conversas" on agent_threads;
create policy "vê conversas" on agent_threads for select to authenticated using (student_id = auth.uid() or is_staff());
drop policy if exists "cria conversa" on agent_threads;
create policy "cria conversa" on agent_threads for insert to authenticated with check (student_id = auth.uid());
drop policy if exists "edita conversa" on agent_threads;
create policy "edita conversa" on agent_threads for update to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists "apaga conversa" on agent_threads;
create policy "apaga conversa" on agent_threads for delete to authenticated using (student_id = auth.uid());
drop policy if exists "vê mensagens" on agent_messages;
create policy "vê mensagens" on agent_messages for select to authenticated using (owns_thread(thread_id) or is_staff());
drop policy if exists "grava mensagem" on agent_messages;
create policy "grava mensagem" on agent_messages for insert to authenticated with check (owns_thread(thread_id));

insert into settings (key, value) values ('harvey_daily_limit', '60') on conflict (key) do nothing;
