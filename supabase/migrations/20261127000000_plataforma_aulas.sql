-- =====================================================================
-- Plataforma de aulas (estilo streaming): cursos, módulos, aulas e progresso.
-- A equipe monta tudo no painel; o aluno só vê o que está publicado e
-- liberado para a turma dele (groups vazio = todas as turmas).
-- Vídeos ficam no YouTube/Vimeo/Panda/Bunny etc.; aqui guardamos o link.
-- =====================================================================

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  subtitle text not null default '',
  description text not null default '',
  category text not null default '',
  cover_path text,
  accent text not null default '#1F3A5E' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  featured boolean not null default false,
  groups text[] not null default '{}',
  published boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null default '',
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists course_modules_course on course_modules(course_id, position);

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  module_id uuid not null references course_modules(id) on delete cascade,
  title text not null default '',
  description text not null default '',
  video_url text not null default '',
  duration_min int check (duration_min is null or duration_min between 0 and 1000),
  materials jsonb not null default '[]',
  published boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lessons_course on lessons(course_id, position);
create index if not exists lessons_module on lessons(module_id, position);

create table if not exists lesson_progress (
  student_id uuid not null references profiles(id) on delete cascade,
  lesson_id uuid not null references lessons(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  watched_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (student_id, lesson_id)
);
create index if not exists lesson_progress_student on lesson_progress(student_id, watched_at desc);

-- Quem vê o curso: a equipe sempre; o aluno se estiver publicado e liberado para a turma dele.
create or replace function can_see_course(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_staff() or exists (
    select 1 from courses c
     where c.id = p_course and c.published
       and (cardinality(c.groups) = 0 or (select group_name from profiles where id = auth.uid()) = any(c.groups))
  );
$$;
grant execute on function can_see_course(uuid) to authenticated;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists courses_touch on courses;
create trigger courses_touch before update on courses for each row execute function touch_updated_at();
drop trigger if exists lessons_touch on lessons;
create trigger lessons_touch before update on lessons for each row execute function touch_updated_at();

alter table courses enable row level security;
alter table course_modules enable row level security;
alter table lessons enable row level security;
alter table lesson_progress enable row level security;

drop policy if exists "vê cursos liberados" on courses;
create policy "vê cursos liberados" on courses for select to authenticated using (can_see_course(id));
drop policy if exists "equipe edita cursos" on courses;
create policy "equipe edita cursos" on courses for all to authenticated using (is_staff()) with check (is_staff());

drop policy if exists "vê módulos liberados" on course_modules;
create policy "vê módulos liberados" on course_modules for select to authenticated using (can_see_course(course_id));
drop policy if exists "equipe edita módulos" on course_modules;
create policy "equipe edita módulos" on course_modules for all to authenticated using (is_staff()) with check (is_staff());

drop policy if exists "vê aulas liberadas" on lessons;
create policy "vê aulas liberadas" on lessons for select to authenticated using (is_staff() or (published and can_see_course(course_id)));
drop policy if exists "equipe edita aulas" on lessons;
create policy "equipe edita aulas" on lessons for all to authenticated using (is_staff()) with check (is_staff());

drop policy if exists "progresso próprio" on lesson_progress;
create policy "progresso próprio" on lesson_progress for select to authenticated using (student_id = auth.uid() or is_staff());
drop policy if exists "registra progresso" on lesson_progress;
create policy "registra progresso" on lesson_progress for insert to authenticated
  with check (student_id = auth.uid() and can_see_course(course_id) and exists (select 1 from lessons l where l.id = lesson_id and l.course_id = lesson_progress.course_id));
drop policy if exists "atualiza progresso" on lesson_progress;
create policy "atualiza progresso" on lesson_progress for update to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid() and can_see_course(course_id));

-- Capas e materiais: files/aulas/{curso}/... · o aluno lê só dos cursos que pode ver.
drop policy if exists "aluno lê capas e materiais das aulas" on storage.objects;
create policy "aluno lê capas e materiais das aulas" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = 'aulas'
         and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
         and public.can_see_course(((storage.foldername(name))[2])::uuid));
