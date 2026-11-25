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
