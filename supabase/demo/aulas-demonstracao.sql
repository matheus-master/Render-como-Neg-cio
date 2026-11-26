-- Demonstração da plataforma de aulas (para apresentar).
-- Publica 4 cursos de exemplo (vídeos abertos da Blender Foundation) para TODAS as turmas,
-- e deixa progresso de exemplo na conta de teste mastertime.im+aluno.
-- Rodar no SQL Editor do Supabase. Para tirar: supabase/demo/aulas-demonstracao-remover.sql

begin;

insert into courses (id, title, subtitle, description, category, accent, featured, groups, published, position, created_at) values
 ('d0000000-0000-4000-8000-000000000001','Vendas para escritórios de arquitetura','Do primeiro contato ao contrato assinado','Como abordar escritórios, apresentar o portfólio e conduzir a negociação até o fechamento, sem baixar o preço.','Vendas','#1F3A5E',true,'{}',true,1, now() - interval '40 days'),
 ('d0000000-0000-4000-8000-000000000002','Instagram que traz cliente','Posicionamento e conteúdo para o render','Bio, destaques, calendário e os posts que geram conversa com arquitetos e construtoras.','Vendas','#8E3B2E',false,'{}',true,2, now() - interval '3 days'),
 ('d0000000-0000-4000-8000-000000000003','Precificação sem achismo','Calcule o preço de cada projeto com segurança','Custos, margem, hora técnica e como apresentar o valor ao cliente sem medo.','Precificação','#2F5B56',false,'{}',true,3, now() - interval '40 days'),
 ('d0000000-0000-4000-8000-000000000004','Proposta e contrato','Feche com segurança e receba em dia','Modelo de proposta, cláusulas essenciais, sinal e cronograma de entregas.','Gestão do estúdio','#386A94',false,'{}',true,4, now() - interval '20 days');

insert into course_modules (id, course_id, title, position) values
 ('d1000000-0000-4000-8000-000000000011','d0000000-0000-4000-8000-000000000001','Prospecção',1),
 ('d1000000-0000-4000-8000-000000000012','d0000000-0000-4000-8000-000000000001','Negociação e fechamento',2),
 ('d1000000-0000-4000-8000-000000000021','d0000000-0000-4000-8000-000000000002','Aulas',1),
 ('d1000000-0000-4000-8000-000000000031','d0000000-0000-4000-8000-000000000003','Aulas',1),
 ('d1000000-0000-4000-8000-000000000041','d0000000-0000-4000-8000-000000000004','Aulas',1);

insert into lessons (id, course_id, module_id, title, description, video_url, duration_min, materials, published, position, created_at) values
 ('d2000000-0000-4000-8000-000000000101','d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000011','Quem é o cliente ideal','Mapeie os escritórios que mais combinam com o seu trabalho.','https://www.youtube.com/watch?v=aqz-KE-bpKQ',18,'[{"name":"Planilha de prospecção","url":"https://example.com/planilha"}]',true,1, now() - interval '40 days'),
 ('d2000000-0000-4000-8000-000000000102','d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000011','A primeira mensagem','O roteiro da abordagem que gera resposta.','https://youtu.be/eRsGyueVLvQ',22,'[]',true,2, now() - interval '40 days'),
 ('d2000000-0000-4000-8000-000000000103','d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000011','Portfólio que vende','O que mostrar e em que ordem.','https://www.youtube.com/watch?v=R6MlUcmOul8',15,'[]',true,3, now() - interval '40 days'),
 ('d2000000-0000-4000-8000-000000000104','d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000012','Respondendo "está caro"','Como sustentar o valor sem dar desconto.','https://www.youtube.com/watch?v=WhWc3b3KhnY',26,'[]',true,1, now() - interval '5 days'),
 ('d2000000-0000-4000-8000-000000000105','d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000012','Fechando o contrato','Proposta, sinal e próximos passos.','https://vimeo.com/76979871',19,'[]',true,2, now() - interval '5 days'),
 ('d2000000-0000-4000-8000-000000000201','d0000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000021','Bio e destaques','O que o cliente vê primeiro no seu perfil.','https://youtu.be/WhWc3b3KhnY',12,'[]',true,1, now() - interval '2 days'),
 ('d2000000-0000-4000-8000-000000000202','d0000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000021','Calendário de 30 dias','Os posts que geram conversa.','https://youtu.be/aqz-KE-bpKQ',17,'[]',true,2, now() - interval '2 days'),
 ('d2000000-0000-4000-8000-000000000203','d0000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000021','Antes e depois que vende','Como mostrar a transformação do projeto.','https://youtu.be/eRsGyueVLvQ',14,'[]',true,3, now() - interval '1 days'),
 ('d2000000-0000-4000-8000-000000000301','d0000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000031','Seus custos de verdade','Levante tudo que entra no preço.','https://youtu.be/R6MlUcmOul8',21,'[]',true,1, now() - interval '40 days'),
 ('d2000000-0000-4000-8000-000000000302','d0000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000031','Margem e hora técnica','Quanto cobrar por imagem.','https://youtu.be/eRsGyueVLvQ',24,'[]',true,2, now() - interval '40 days'),
 ('d2000000-0000-4000-8000-000000000303','d0000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000031','Apresentando o valor','Como mostrar o preço sem pedir desculpa.','https://youtu.be/aqz-KE-bpKQ',16,'[]',true,3, now() - interval '40 days'),
 ('d2000000-0000-4000-8000-000000000401','d0000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000041','A proposta que fecha','Estrutura e linguagem da proposta.','https://youtu.be/WhWc3b3KhnY',20,'[]',true,1, now() - interval '20 days'),
 ('d2000000-0000-4000-8000-000000000402','d0000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000041','Cláusulas essenciais','O que não pode faltar no contrato.','https://youtu.be/R6MlUcmOul8',18,'[]',true,2, now() - interval '20 days');

insert into lesson_progress (student_id, lesson_id, course_id, watched_at, completed_at)
select p.id, x.lesson::uuid, x.course::uuid, now() - x.ago::interval, case when x.done then now() - x.ago::interval end
from profiles p, (values
  ('d2000000-0000-4000-8000-000000000101','d0000000-0000-4000-8000-000000000001','2 days',true),
  ('d2000000-0000-4000-8000-000000000102','d0000000-0000-4000-8000-000000000001','1 day',true),
  ('d2000000-0000-4000-8000-000000000103','d0000000-0000-4000-8000-000000000001','2 hours',false),
  ('d2000000-0000-4000-8000-000000000301','d0000000-0000-4000-8000-000000000003','6 days',true),
  ('d2000000-0000-4000-8000-000000000302','d0000000-0000-4000-8000-000000000003','5 days',true),
  ('d2000000-0000-4000-8000-000000000303','d0000000-0000-4000-8000-000000000003','5 days',true),
  ('d2000000-0000-4000-8000-000000000201','d0000000-0000-4000-8000-000000000002','1 day',false)
) as x(lesson, course, ago, done)
where p.email = 'mastertime.im+aluno@gmail.com';
commit;
