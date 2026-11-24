-- Ajustes da reunião de 23/11: apresentação do studio, foto de perfil, grupos editáveis e prazo de acesso.

-- 1) Novo tipo de documento: apresentação do studio (o PowerPoint da reunião com construtora).
alter type doc_slot add value if not exists 'apresentacao';

-- 2) Foto de perfil (caminho no bucket "files").
alter table profiles add column if not exists avatar_path text;

-- 3) Grupos: renomear não pode quebrar ninguém (o nome propaga para alunos, códigos e critérios).
alter table class_codes drop constraint if exists class_codes_group_name_fkey;
alter table class_codes add constraint class_codes_group_name_fkey foreign key (group_name) references groups(name) on update cascade;
alter table profiles drop constraint if exists profiles_group_name_fkey;
alter table profiles add constraint profiles_group_name_fkey foreign key (group_name) references groups(name) on update cascade on delete set null;
alter table criteria drop constraint if exists criteria_group_name_fkey;
alter table criteria add constraint criteria_group_name_fkey foreign key (group_name) references groups(name) on update cascade on delete set null;
drop policy if exists "equipe gerencia grupos" on groups;
create policy "equipe gerencia grupos" on groups for all to authenticated using (is_staff()) with check (is_staff());

-- 4) Prazo de acesso: depois de access_until o aluno continua vendo tudo, mas não envia material novo.
alter table profiles add column if not exists access_until date;
alter table profiles add column if not exists plan text not null default '';

create or replace function access_active(uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (access_until is null or access_until >= (now() at time zone 'America/Sao_Paulo')::date) and status <> 'encerrado'
                   from profiles where id = uid), false)
$$;
grant execute on function access_active(uuid) to authenticated;

alter table profiles drop constraint if exists profiles_status_check;
alter table profiles add constraint profiles_status_check check (status in ('ativo', 'onboarding', 'pausado', 'encerrado'));

-- O aluno não mexe no próprio prazo nem no plano.
create or replace function protect_profile_fields() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not is_staff() then
    new.role := old.role;
    new.group_name := old.group_name;
    new.email := old.email;
    new.created_at := old.created_at;
    new.status := old.status;
    new.access_until := old.access_until;
    new.plan := old.plan;
  end if;
  return new;
end $$;

drop policy if exists "aluno cria os próprios envios" on submissions;
create policy "aluno cria os próprios envios" on submissions for insert to authenticated
  with check (is_staff() or (student_id = auth.uid() and access_active()));
