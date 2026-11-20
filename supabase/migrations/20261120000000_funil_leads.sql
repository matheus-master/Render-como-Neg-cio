-- Funil do relatório: leads prospectados entram como primeira etapa (leads → contatos → respostas → agendamentos → reuniões → propostas → fechados).
alter table reports add column if not exists leads int not null default 0;
