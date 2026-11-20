-- Feedback da mentoria: o aluno pode mandar quantos quiser (antes era um só) e deixar uma sugestão.
alter table survey_responses add column if not exists id uuid not null default gen_random_uuid();
alter table survey_responses drop constraint if exists survey_responses_pkey;
alter table survey_responses add primary key (id);
alter table survey_responses add column if not exists suggestion text not null default '';
create index if not exists survey_responses_student on survey_responses (student_id, created_at desc);
