-- Remove a demonstração da plataforma de aulas (cursos, aulas e progresso de exemplo).
-- A conta de teste volta para a turma Zorango Tango e a turma "Demonstração" é apagada.
begin;
delete from courses where id::text like 'd0000000-0000-4000-8000-%';
update profiles set group_name = 'Zorango Tango' where email = 'mastertime.im+aluno@gmail.com';
delete from groups where name = 'Demonstração' and not exists (select 1 from profiles where group_name = 'Demonstração') and not exists (select 1 from class_codes where group_name = 'Demonstração');
commit;
