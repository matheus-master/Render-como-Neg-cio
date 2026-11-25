# Agentes do portal

Cada agente tem uma pasta com um `SKILL.md`. O mesmo arquivo serve para duas coisas:

1. **Dentro do portal:** o texto do `SKILL.md` (sem o cabeçalho entre `---`) é o prompt de sistema do agente. Editou o arquivo, publicou o portal, o agente muda.
2. **No Claude (claude.ai):** a pasta zipada (`harvey/SKILL.md`) pode ser enviada como skill em Configurações → Capacidades → Skills.

## Harvey (vendas)

- Tela: `/harvey` no Portal do Aluno (menu Mentoria → "Harvey · Vendas").
- Servidor: `worker/harvey.ts` → `POST /api/agents/harvey` (resposta em fluxo).
- Além da skill, o portal envia ao modelo um bloco com os números dos relatórios quinzenais do aluno e o plano de ação ativo, para o modo Diretor usar dados reais.
- Conversas ficam em `agent_threads` / `agent_messages`. O aluno vê as dele; a equipe pode ler para acompanhar.
- Limite diário por aluno: configuração `harvey_daily_limit` (padrão 60 mensagens).
- Precisa só do segredo `ANTHROPIC_API_KEY` no Worker para funcionar.

## Análise de Instagram (equipe)

- Skill: `agentes/analise-instagram/SKILL.md` (critérios da Taty), usada sem alteração.
- Tela: painel da equipe → ficha do aluno → aba **Instagram** → "Análise do Instagram com IA".
- Como funciona: a equipe sobe os prints do perfil (ou usa os de antes/acompanhamento), a IA escreve a devolutiva no formato da skill, a equipe revisa/edita e **libera**. O aluno vê a liberada em **Perfil**.
- No portal a IA não navega no Instagram: trabalha com os prints e lista no fim o que não deu para conferir por eles.
- Servidor: `worker/instagram.ts` → `POST /api/agents/instagram` (só equipe). Rascunhos e liberadas ficam em `instagram_reviews`.

## Análise de documentos (robô das devolutivas)

- Skill: `agentes/analise-documentos/SKILL.md` (critérios da Taty, Laboratório de portfólio e aula de processos), usada sem alteração como instrução do robô.
- O portal não gera a página HTML A4 da skill: o robô devolve um JSON que vira a tela de devolutiva. Cada ponto tem **seção** (Ajustes obrigatórios, Regras do Studio, Marca e visual, Imagens, Português, Sugestões, Observações) e **página**. Resultado: Aprovado = ok, Aprovado com ajustes = aj, Refazer = re.
- Os documentos de referência internos (`worker/referencias.ts`) e os critérios extras que a equipe cadastrar continuam indo junto.
- A equipe revisa e libera como antes; no editor, cada ponto tem seção e página.
- Precisa dos segredos `ANTHROPIC_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no Worker.
