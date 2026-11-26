-- Avatar em personagem: as escolhas ficam guardadas para a pessoa editar depois.
-- A imagem gerada vai para avatar_path (como uma foto), então aparece em todo o portal sem mudar nada.
alter table profiles add column if not exists avatar_config jsonb;
