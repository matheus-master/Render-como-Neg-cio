-- Relatório quinzenal com conquistas, dificuldades e foco da próxima quinzena.
alter table reports
  add column if not exists wins text not null default '',
  add column if not exists struggles text not null default '',
  add column if not exists next_focus text not null default '';
