-- Remove a demonstração da plataforma de aulas (cursos, aulas e progresso de exemplo).
delete from courses where id::text like 'd0000000-0000-4000-8000-%';
