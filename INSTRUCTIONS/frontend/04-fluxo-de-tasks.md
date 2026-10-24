# Fluxo de trabalho por tasks

Cada task é uma entrega pequena, **verificada no navegador** e commitada. Plano completo em [`docs/FRONTEND_PLAN.md`](../../docs/FRONTEND_PLAN.md).

| Fase | Tasks | Entrega |
|---|---|---|
| Fundação | T1–T4 | Scaffold, tema claro/escuro (paleta Aprova), componentes base, contrato zod, API e mocks MSW |
| Chat | T5–T7, T8 | Identificação, conversa, anexos, retomada; formulário editável com envio |
| Acesso | T9–T11 | Login, guards por perfil, casca do dashboard |
| Dashboard | T12–T16 | Visão geral (3 KPIs), clientes, processos/regras, conversas, time da head |
| Acabamento | T17 | Contraste AA, títulos, 404, responsivo 375 px |
| Entrega | T18–T19 | Troca de mocks pelo back real; README, demo e esta pasta |

**Critério de pronto:** `npm run build` sem erro + fluxo testado no navegador (desktop e, quando há layout novo, 375 px) + commit com mensagem descrevendo a task.
