# Front-end — Arquitetura e Tasks

> Hackathon Aprova · Desafio **Implantação**: "Como coletar e validar a regra de negócio de ~100 processos sem depender de reunião?"
> Metas do desafio: menos horas de reunião, menos idas e vindas, menos tempo validando form clonado, mais processos no ar com regra inteligente.

## 1. Escopo do front

2 telas, 3 perfis:

| Perfil | Acesso | Login | Vê |
|---|---|---|---|
| Prefeitura | `/chat` | Não (pede telefone → se desconhecido, pede prefeitura + secretaria) | Só o chat |
| Implantador | `/chat` (não) · `/dashboard` | username + senha | Só seus clientes: conversas, regras coletadas, métricas |
| Head de implantação | `/dashboard` | username + senha | Tudo: todos implantadores, clientes, ranking, drill-down |

**Métricas de sucesso (headline do dash):**
1. **Reuniões** por processo/cliente — sucesso = *diminui* (comparar com baseline).
2. **Tempo economizado do implantador** (horas) — estimado pela IA.
3. **Tempo de criação do fluxo** (do 1º contato ao fluxo validado) — sucesso = *diminui*.

Secundárias úteis: processos com regra completa / total (~100 por prefeitura), idas e vindas por processo, tempo de validação de form clonado.

## 2. Stack

- **Vite + React 18 + TypeScript**
- **React Router** (rotas + guards por papel)
- **TanStack Query** (cache/estado de servidor; troca mock→API sem mexer em telas)
- **Zustand** (auth, tema, sessão do chat) — leve
- **Tailwind CSS** com tokens via CSS variables (tema claro/escuro trocando só as variáveis)
- **Recharts** (gráficos) · **lucide-react** (ícones)
- **MSW** (Mock Service Worker) para simular o backend Node enquanto ele não existe
- **Zod** para validar respostas da API (contrato único)

## 3. Design system

**Paleta (extraída dos sites da Aprova):**

| Token | Dash escuro (zenith) | Claro (aprova.com.br / chat) |
|---|---|---|
| `--bg` | `#0B1416` | `#FDFDFD` |
| `--surface` | `#111D20` | `#FFFFFF` |
| `--soft` | `#0F2A2E` | `#E6F9FA` |
| `--line` | `#26363A` | `#D9D9D9` |
| `--ink` | `#FDFDFD` | `#222222` |
| `--muted` | `#9AA8AB` | `#5E6466` |
| `--petrol` (destaque texto) | `#8FE6EC` | `#0B4D55` |
| `--cyan` (primária/CTA) | `#00DAE7` | `#00DAE7` |
| `--on-cyan` | `#020A0F` | `#020A0F` |

Semânticos: sucesso `#16A34A`, alerta `#F59E0B`, erro `#DC2626`.
**Fontes:** títulos **Geist**, corpo **Inter** (mesmas da Aprova; limpas e legíveis para dashboard). Números de KPI com `tabular-nums`.

**Regras de tema:** chat = sempre claro. Dash = escuro por padrão, toggle claro/escuro persistido em `localStorage`.

## 4. Estrutura de pastas

```
src/
  app/            # router, providers (Query, Theme), guards
  pages/
    ChatPage/
    LoginPage/
    DashboardPage/   # monta seções conforme papel
  features/
    chat/            # ChatWindow, MessageList, Composer, IdentifyFlow, AttachmentButton
    auth/            # LoginForm, useAuth, RoleGuard
    dashboard/
      overview/      # KPIs + gráficos de tendência
      clients/       # lista de prefeituras, detalhe do cliente
      conversations/ # histórico de conversas
      rules/         # regras de negócio coletadas (por processo/secretaria)
      team/          # (head) ranking e comparação de implantadores
  components/ui/     # Button, Card, Table, Badge, Tabs, Modal, Skeleton, ThemeToggle...
  lib/
    api/             # client.ts (fetch + token), endpoints por domínio, schemas zod
    mocks/           # handlers MSW + fixtures
    theme/           # tokens, hook de tema
    utils/           # format (horas, %, datas pt-BR)
  types/             # contratos compartilhados
```

## 5. Contrato com o backend (a alinhar com o time)

Base: `VITE_API_URL`. Todas retornam JSON; auth via `Authorization: Bearer <jwt>`.

| Método | Rota | Quem | Descrição |
|---|---|---|---|
| POST | `/auth/login` | impl/head | `{username,password}` → `{token,user:{id,name,role}}` |
| GET | `/auth/me` | impl/head | usuário atual |
| POST | `/chat/identify` | pública | `{phone}` → `{known:boolean, municipality?, secretariat?, sessionId}` |
| POST | `/chat/register` | pública | `{phone,municipality,secretariat}` → `{sessionId}` |
| POST | `/chat/message` | pública | `{sessionId,text,attachments?}` → resposta do agente (stream SSE opcional em `/chat/stream`) |
| GET | `/chat/history/:sessionId` | pública | retoma conversa |
| GET | `/metrics/summary?from&to&implementerId?` | impl/head | 3 KPIs + deltas vs baseline |
| GET | `/metrics/timeseries?metric&...` | impl/head | série para gráficos |
| GET | `/clients` | impl/head | impl: só os seus; head: todos (`?implementerId=`) |
| GET | `/clients/:id` | impl/head | detalhe + progresso de processos |
| GET | `/clients/:id/conversations` | impl/head | conversas |
| GET | `/conversations/:id` | impl/head | mensagens |
| GET | `/clients/:id/rules` | impl/head | regras de negócio coletadas (status: completo / pendente / validar) |
| GET | `/implementers` | head | lista + métricas por pessoa |
| GET | `/implementers/:id` | head | detalhe do implantador |

**Regra de ouro:** o filtro por papel é feito **no backend**; o front só *esconde* UI. Tipos em `src/types` espelham o contrato.

**Integração WhatsApp (futuro):** `identify` passará a receber o telefone do remetente automaticamente; a tela de chat é só mais um canal. Manter `ChatWindow` desacoplado de "pedir telefone" (fluxo `IdentifyFlow` plugável) e `sessionId` como chave única.

## 6. Tasks (ordem de execução)

**Fase 0 — Fundação**
- **T1** Scaffold Vite+React+TS, Tailwind, ESLint/Prettier, aliases, `.env.example`, README com run steps.
- **T2** Design tokens (CSS vars claro/escuro), fontes Geist/Inter, `ThemeProvider` + `ThemeToggle`.
- **T3** Biblioteca UI base (Button, Card, Input, Badge, Table, Tabs, Skeleton, EmptyState, Modal).
- **T4** Camada de API: client fetch, schemas zod, hooks TanStack Query, MSW com fixtures realistas (prefeituras, secretarias, ~100 processos, 3 implantadores, 1 head).

**Fase 1 — Chat (público, fundo claro)**
- **T5** Layout do chat: header com marca, lista de mensagens, composer, estados (digitando, erro, reconexão), responsivo mobile-first (futuro WhatsApp-like).
- **T6** `IdentifyFlow`: pedir telefone (máscara BR) → `identify` → se desconhecido, pedir prefeitura + secretaria (selects/autocomplete) → liberar conversa.
- **T7** Conversa com agente: envio, render de respostas (markdown simples, listas, perguntas com botões de resposta rápida), anexos (PDF/foto/planilha — o desafio cita esses formatos), persistência de `sessionId`, retomada de histórico.
- **T8** (depois, quando o formulário for definido) Mensagem `kind: "form"` no chat: renderiza o formulário já preenchido pelo agente (campos genéricos key/label/type/value), cada campo editável, com **um único botão** "Confirmar e enviar ao time" (`submit` envia todos os valores). Sem botão de alterar. O formulário é preenchido no **back**. Contrato em `BACKEND_CONTRACT.md`.

**Fase 2 — Auth e shell do dashboard**
- **T9** Login (username+senha), store de auth, interceptor de token, logout, expiração.
- **T10** Router + `RoleGuard` (`implementer`, `head`); redirecionamentos; 403/404.
- **T11** Shell do dashboard: sidebar/topbar, toggle de tema (escuro padrão), filtro de período, seletor de implantador (só head).

**Fase 3 — Dashboard**
- **T12** Overview: 3 KPIs principais (reuniões ↓, horas economizadas, tempo de criação do fluxo) com delta vs baseline e sparkline; gráficos de tendência.
- **T13** Clientes: lista (prefeituras) com progresso de processos, status e KPIs por cliente; detalhe do cliente.
- **T14** Regras de negócio: tabela por secretaria/processo com status (completo / pendente / a validar), busca, filtros, detalhe da regra com fonte (mensagem/anexo de origem).
- **T15** Conversas: lista por cliente, visualizar transcrição, destacar o que a IA extraiu.
- **T16** (Head) Time: ranking/comparativo de implantadores, drill-down em cada um (reusa as telas T12–T15 com `implementerId`), clientes em risco.

**Fase 4 — Acabamento**
- **T17** Estados de loading/erro/vazio, acessibilidade (contraste nos dois temas, foco, teclado), responsividade.
- **T18** Trocar MSW por backend real (`VITE_API_URL`), ajustar contratos, tratar SSE do agente.
- **T19** Polimento para demo: dados de seed convincentes, vídeo-backup, README (problema + como rodar) e pasta `INSTRUCTIONS` conforme exige o hackathon.

**Caminho crítico para a demo (se faltar tempo):** T1–T7 → T9–T12 → T16 → T19. T8, T14 e T15 podem ser simplificadas.

## 7. Decisões

Resolvidas: o implantador não usa o chat; o cálculo das métricas é do back (o front só exibe); anexos até 10 MB, 5 por mensagem; formulário é preenchido pelo agente no back.
Em aberto (com o back): ver seção 10 de `BACKEND_CONTRACT.md` (tempo de resposta do agente, fórmulas das métricas, origem dos dados de reuniões).
