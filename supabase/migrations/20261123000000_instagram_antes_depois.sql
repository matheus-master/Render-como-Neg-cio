-- Instagram: prints do perfil "antes" (quando entrou) e "depois" (evolução), por aluno.
create table if not exists instagram_shots (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('antes', 'depois')),
  file_path text not null,
  taken_on date not null default current_date,
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists instagram_shots_student on instagram_shots (student_id, kind, taken_on desc);
alter table instagram_shots enable row level security;
drop policy if exists "vê prints" on instagram_shots;
create policy "vê prints" on instagram_shots for select to authenticated using (student_id = auth.uid() or is_staff());
drop policy if exists "envia prints" on instagram_shots;
create policy "envia prints" on instagram_shots for insert to authenticated with check (student_id = auth.uid() or is_staff());
drop policy if exists "apaga prints" on instagram_shots;
create policy "apaga prints" on instagram_shots for delete to authenticated using (student_id = auth.uid() or is_staff());

-- A equipe também pode subir e apagar prints na pasta do aluno (bucket "files").
drop policy if exists "equipe envia arquivos de aluno" on storage.objects;
create policy "equipe envia arquivos de aluno" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and is_staff());
drop policy if exists "equipe apaga arquivos de aluno" on storage.objects;
create policy "equipe apaga arquivos de aluno" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and is_staff());
