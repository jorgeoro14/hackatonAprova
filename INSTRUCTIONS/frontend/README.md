# INSTRUCTIONS · Front-end

Instruções que guiam o **agente de código (Claude Code)** que construiu o front-end e as regras que o **front segue ao exibir as saídas do agente de IA** de implantação. Cada arquivo tem uma responsabilidade única:

| Arquivo | Responsabilidade | Quando é usado |
|---|---|---|
| [`01-convencoes-do-projeto.md`](01-convencoes-do-projeto.md) | Stack, estrutura de pastas, estilo de código, tema e regras de acessibilidade que o agente de código deve respeitar | Carregado automaticamente por `frontend/CLAUDE.md` em toda sessão |
| [`02-regras-de-produto.md`](02-regras-de-produto.md) | Regras de negócio da interface: 3 perfis de acesso, métricas de sucesso e o que cada tela mostra | Antes de criar ou alterar qualquer tela |
| [`03-saidas-do-agente-no-chat.md`](03-saidas-do-agente-no-chat.md) | Como o chat interpreta e exibe cada saída do agente de IA (texto, respostas rápidas, formulário preenchido) e o que devolve ao back | Ao mexer no chat ou no contrato com o back |
| [`04-fluxo-de-tasks.md`](04-fluxo-de-tasks.md) | Como o trabalho foi dividido em tasks (T1–T19), a ordem e o critério de "pronto" | Ao planejar ou retomar o trabalho |

Contrato completo com o back-end: [`docs/BACKEND_CONTRACT.md`](../../docs/BACKEND_CONTRACT.md). Plano: [`docs/FRONTEND_PLAN.md`](../../docs/FRONTEND_PLAN.md).

> As instruções do **agente de IA (back-end)** ficam no repositório do back (`CLAUDE.md`, `knowledge/sistema/`). Esta pasta cobre a parte do front.
