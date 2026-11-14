# Portal do Aluno RCN

Portal do aluno da Render como Negócio, com o módulo de **análise de materiais**: o aluno envia proposta, contrato ou portfólio; a IA gera um rascunho de devolutiva; a equipe revisa, edita e libera; o aluno recebe e-mail, vê a devolutiva, marca os próximos passos e envia nova versão.

## Arquitetura

| Parte | Onde roda | O que faz |
|---|---|---|
| Banco, login, arquivos | **Supabase** | Tabelas, regras de acesso (RLS), storage dos PDFs |
| Site (React + Vite) | **Cloudflare Worker** (embutido no código pelo `scripts/embed-assets.mjs`) | Telas do aluno e da equipe |
| API, fila da IA, tarefa agendada | **Cloudflare Worker** | `/api/*`, consumidor da fila `rcn-analysis`, cron a cada 5 min |
| IA | **Claude Opus 5.5** (API da Anthropic) | Lê o material e escreve o rascunho em JSON |
| E-mail | **Resend** (opcional) | Aviso de devolutiva liberada |

```
aluno envia ──> submissions (status analise) ──> /api/.../analyze ──> fila
                                                                       │
            Worker lê o PDF/Word/link, chama a IA, grava ai_draft + draft
                                                                       │
                                  status revisao <────────────────────┘
equipe edita e clica "Aprovar e liberar" ──> release_feedback() ──> status pronta + e-mail
```

Falha da IA ou mais de 15 min em análise: o envio vai para `revisao` sem rascunho e a equipe escreve do zero ou clica "Gerar de novo".

## Pastas

```
supabase/migrations/   esquema completo (tabelas, RLS, storage, funções)
worker/                API, fila, cron, prompt da IA, e-mail
shared/domain.ts       regras compartilhadas (tipos, vereditos, termos proibidos)
src/                   telas (React)
  pages/Inicio, Documentos, NovaAnalise, DocFlow (status, devolutiva, histórico)
  pages/OtherPages     gamificação, relatórios, sessões, calendário, feedback, perfil
  pages/staff/Staff    fila e revisão da equipe
```

## Colocar no ar (passo a passo)

Pré-requisitos: conta Supabase, conta Cloudflare com **Workers Paid** (US$ 5/mês, exigido pelas filas e pelo limite de CPU), chave da API da Anthropic, e opcionalmente conta Resend com domínio verificado.

### 1. Supabase
1. Crie um projeto em supabase.com.
2. Abra **SQL Editor**, cole o conteúdo de `supabase/migrations/20261112000000_portal.sql` e rode.
3. Em **Authentication → URL Configuration**, coloque a URL do portal em *Site URL* e em *Redirect URLs* (`https://SEU-PORTAL/**`).
4. Decida a confirmação de e-mail em **Authentication → Providers → Email**. Ligada: o aluno confirma pelo link antes de entrar. Desligada: entra direto.
5. Troque os códigos de turma de exemplo (`ZT-4821`, `OP-1093`) na tabela `class_codes`.
6. Anote em **Project Settings → API**: URL, `anon key` e `service_role key`.

### 2. Cloudflare
```bash
npm install
```
```bash
npx wrangler login
```
```bash
npx wrangler queues create rcn-analysis
```
```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```
```bash
npx wrangler secret put ANTHROPIC_API_KEY
```
```bash
npx wrangler secret put RESEND_API_KEY
```
`SUPABASE_URL`, a chave publicável (`SUPABASE_ANON_KEY`) e `PORTAL_URL` ficam em `wrangler.jsonc` (não são secretas). Edite `EMAIL_FROM` quando tiver o domínio no Resend. Crie o `.env` a partir do `.env.example` com a URL e a anon key do Supabase. Depois:
```bash
npm run deploy
```

### 3. Equipe
Cada pessoa da equipe cria a conta pelo "Primeiro acesso" com qualquer código válido. Depois, no SQL Editor:
```sql
update profiles set role = 'staff' where email = 'taty@exemplo.com';
```
Quem é `staff` cai direto em `/equipe` ao entrar.

## Desenvolvimento local
```bash
cp .env.example .env
```
```bash
cp .dev.vars.example .dev.vars
```
```bash
npm run build && npm run worker:dev
```
Em outro terminal:
```bash
npm run dev
```
O Vite (porta 5173) repassa `/api` para o Worker (porta 8787). Para disparar a tarefa agendada localmente: `curl "http://localhost:8787/cdn-cgi/local/scheduled"`.

## Regras de produto implementadas
- **Termos proibidos** (`RCN`, `modelo(s)`, `padrão/padrões`): o prompt da IA proíbe; na revisão, o campo fica com borda âmbar e uma barra conta os trechos. **Não bloqueia** a liberação. Regex em `shared/domain.ts`.
- **IA discreta para o aluno**: as telas do aluno só falam em "análise" e "revisão pela equipe".
- **Assinatura**: `release_feedback()` grava quem liberou (`auth.uid()`), e a devolutiva mostra "Revisado por {nome}".
- **Prazo de 48h**: calculado no banco, no insert.
- **Uma versão por vez**: o banco recusa nova versão enquanto a anterior está em análise ou revisão.
- **O aluno nunca lê `ai_draft` nem `draft`**: a tabela `feedbacks` é só da equipe; o aluno lê a view `student_feedbacks`, que expõe só o que foi liberado.
- **Gamificação**: tarefas com `auto_slot` se marcam sozinhas quando a última versão daquele documento vem `ok`, e o banco recusa marcação manual.

## Equipe
- **Painel** (`/equipe`): alunos ativos, relatórios atrasados (mais de 16 dias), devolutivas pendentes, faturamento dos últimos 15 dias por grupo, Botão Vermelho acionado, tabela de alunos com busca e filtros e atividade recente.
- **Ficha do aluno** (`/equipe/aluno/:id`): grupo e situação editáveis; abas Resumo, Relatórios (com "Feedback da equipe RCN"), Documentos, Gamificação (a equipe pode marcar tarefas) e Sessões (Botão Vermelho com motivo, situação e anotações).
- **Fila de revisão** (`/equipe/fila`) e **Revisão** da devolutiva.
- **Configurações** (`/equipe/config`): códigos de turma, endereço iCal da agenda e lista da equipe.

## Decisões em aberto (do handoff)
1. **Fonte**: mantida Onest em tudo.
2. **Menu "Feedback"**: mantido. Para renomear para "Pesquisa da mentoria", troque o rótulo em `src/components/StudentLayout.tsx`.
3. **Gamificação**: importada de `materiais/RCN_Checklist_Gamificacao.xlsx` (94 tarefas principais + 18 missões bônus, 6 níveis).
4. **Critérios (tela D) e Ficha do aluno (tela C)**: a tabela `criteria` já existe e a IA já usa os critérios publicados do tipo e do grupo. Falta a tela de edição.

## Testes feitos
- **Banco**: migração rodada num Postgres 16 com `auth` e `storage` simulados, mais um roteiro de testes de RLS (aluno não lê rascunho nem envio de outro aluno, aluno não libera, não envia v2 com v1 em andamento, tarefa automática bloqueada, storage só na própria pasta).
- **Telas**: todas as páginas do aluno (celular e computador) e da equipe abertas no Chromium com dados de exemplo, sem erros no console.
- **Worker**: rodando no `workerd` local (health, 401 sem login, SPA, fila); leitura de `.docx` validada no runtime; bundle de deploy gerado.
- **Ainda não testado**: a chamada real à IA e o ciclo completo contra um Supabase de verdade. Faça um envio de teste logo depois do primeiro deploy.
