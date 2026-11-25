-- Análise de Instagram com IA (skill analise-instagram-rcn): a equipe gera, revisa e libera; o aluno vê a liberada.
create table if not exists instagram_reviews (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'rascunho' check (status in ('rascunho', 'liberada')),
  content text not null default '',
  prints text[] not null default '{}',
  note text not null default '',
  usage jsonb,
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  released_by uuid references profiles(id),
  released_at timestamptz,
  seen_at timestamptz
);
create index if not exists instagram_reviews_student on instagram_reviews (student_id, created_at desc);
alter table instagram_reviews enable row level security;
drop policy if exists "equipe gerencia análises de instagram" on instagram_reviews;
create policy "equipe gerencia análises de instagram" on instagram_reviews for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists "aluno vê a análise liberada" on instagram_reviews;
create policy "aluno vê a análise liberada" on instagram_reviews for select to authenticated using (student_id = auth.uid() and status = 'liberada');
drop policy if exists "aluno marca como vista" on instagram_reviews;
create policy "aluno marca como vista" on instagram_reviews for update to authenticated using (student_id = auth.uid() and status = 'liberada') with check (student_id = auth.uid() and status = 'liberada');

-- O aluno só marca como vista; o resto é da equipe.
create or replace function instagram_review_protect() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and not is_staff() then
    new := old;
    new.seen_at := coalesce(old.seen_at, now());
  end if;
  return new;
end $$;
drop trigger if exists instagram_reviews_bu on instagram_reviews;
create trigger instagram_reviews_bu before update on instagram_reviews for each row execute function instagram_review_protect();
