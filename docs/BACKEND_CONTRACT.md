# Contrato Front ↔ Back (v0.2)

Documento para o time de back-end (Node.js). Define **o que o front consome** e **o que o back precisa entregar**. O front já trabalha com mocks idênticos a este contrato, então basta implementar igual e trocar a `VITE_API_URL`.

> Qualquer mudança neste contrato deve ser avisada ao front. Dúvidas ou divergências: anotar na seção 10.

## 1. Visão geral

- **Chat (público):** pessoa da prefeitura conversa com o agente. O agente **preenche o formulário do processo por conta própria no back** (o front não o mostra enquanto é preenchido). Ao terminar a coleta, o agente manda o **formulário já preenchido**; a pessoa edita o que estiver errado direto nos campos e clica em um único botão, "Confirmar e enviar ao time".
- **Dashboard (login):** implantador vê só os seus clientes; head vê tudo. Mostra conversas, dados/regras coletados e métricas.
- **O front só exibe.** Todo cálculo (horas economizadas, reuniões, tempos) é do back.
- **Permissão é responsabilidade do back.** O front esconde UI por papel, mas o back **deve filtrar** os dados (implantador nunca recebe cliente de outro implantador).

## 2. Convenções

| Item | Padrão |
|---|---|
| Base URL | `/api/v1` |
| Formato | JSON, `Content-Type: application/json` (exceto upload) |
| Chaves | `camelCase` |
| Datas | ISO 8601 UTC (`2026-10-24T14:30:00Z`) |
| Durações | sempre em **minutos** (inteiro) nos campos `...Minutes`; o front formata em h/min |
| IDs | string (uuid ou similar) |
| Auth dashboard | `Authorization: Bearer <jwt>` |
| Auth chat | `X-Session-Token: <sessionToken>` (veja seção 4) |
| Paginação | `?page=1&pageSize=20` → `{ items: [], page, pageSize, total }` |
| CORS | liberar a origem do front (`http://localhost:5173` em dev) |
| Idioma | textos em pt-BR |

**Erros** (qualquer status ≥ 400):
```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Usuário ou senha inválidos", "details": {} } }
```
Status usados: `400` validação, `401` sem/expirado token, `403` sem permissão, `404`, `413` arquivo grande, `415` tipo não aceito, `429` rate limit, `500`.

## 3. Autenticação (dashboard)

### `POST /auth/login`
```json
// req
{ "username": "maria.silva", "password": "******" }
// res 200
{ "token": "<jwt>", "expiresAt": "2026-10-24T22:00:00Z",
  "user": { "id": "u1", "name": "Maria Silva", "username": "maria.silva", "role": "implementer" } }
```
`role`: `"implementer"` | `"head"`. Erro: `401 INVALID_CREDENTIALS`.

### `GET /auth/me` → `user` (mesmo objeto acima). `401` se token inválido.
### `POST /auth/logout` → `204` (opcional se JWT stateless).

## 4. Chat (público, sem login)

O front guarda `sessionId` + `sessionToken` no navegador para retomar a conversa. O `sessionToken` impede que alguém leia a conversa de outro só adivinhando o id. **Preparado para WhatsApp:** no futuro, o canal envia o telefone e o `identify` responde direto, sem pedir nada.

### `POST /chat/identify`
Primeiro passo: a pessoa informa o telefone.
```json
// req
{ "phone": "+5551999998888" }          // E.164; o front normaliza
// res 200 — telefone conhecido
{ "known": true,
  "sessionId": "s1", "sessionToken": "<token>",
  "contact": { "name": "João", "municipality": { "id": "m1", "name": "Prefeitura de Canoas" },
               "secretariat": { "id": "sec3", "name": "Secretaria de Obras" } } }
// res 200 — telefone desconhecido
{ "known": false, "registrationToken": "<token curto>" }
```

### `POST /chat/register`
Só quando `known:false`. Pessoa informa prefeitura e secretaria. Aceita **id do catálogo** ou **texto livre** (caso não esteja na lista; o back cria/faz match depois).
```json
// req
{ "registrationToken": "<token>", "phone": "+5551999998888", "name": "João",
  "municipality": { "id": "m1" },            // ou { "name": "Canoas" }
  "secretariat":  { "name": "Meio Ambiente" } }
// res 201
{ "sessionId": "s1", "sessionToken": "<token>", "contact": { ... } }
```

### Catálogo (para os selects do cadastro)
- `GET /catalog/municipalities?q=` → `[{ "id": "m1", "name": "Prefeitura de Canoas", "uf": "RS" }]`
- `GET /catalog/municipalities/:id/secretariats` → `[{ "id": "sec3", "name": "Secretaria de Obras" }]`

### `GET /chat/sessions/:sessionId/messages`
Retoma o histórico (header `X-Session-Token`). Retorna `Message[]` em ordem cronológica.

### `POST /chat/sessions/:sessionId/messages`
Envia mensagem da pessoa e **devolve a resposta do agente** (MVP sem streaming).
```json
// req
{ "text": "O alvará de reforma exige projeto aprovado?", "attachmentIds": ["a1"], "quickReplyId": null }
// res 200
{ "userMessage": Message, "agentMessage": Message }
```
Timeout sugerido do agente: 60s. Se demorar, responder `202` com `{ "pending": true }` e o front fará polling em `GET .../messages?after=<messageId>` (a combinar, ver seção 10).

### Tipo `Message`
```json
{
  "id": "msg1",
  "role": "user" | "agent" | "system",
  "kind": "text" | "quick_replies" | "form",
  "text": "Entendi. Quem aprova o projeto, a Secretaria de Obras?",
  "createdAt": "2026-10-24T14:30:00Z",
  "attachments": [ Attachment ],
  "quickReplies": [ { "id": "qr1", "label": "Sim" }, { "id": "qr2", "label": "Não" } ],   // só em kind=quick_replies
  "formularioId": "f-123"                                                                // só em kind=form (ver abaixo)
}
```
`text` aceita **markdown simples** (negrito, listas). O front não executa HTML.

### Formulário preenchido (`kind: "form"`)
O agente preenche o `FormularioImplantacao` (tipo do back; ver `docs/modelo-formulario-implantacao.md`) durante a conversa, sem mostrá-lo. Ao terminar um processo, envia uma mensagem com `kind: "form"` e `formularioId`. O front exibe o formulário **já preenchido, com todos os campos editáveis pela prefeitura** e **um único botão: "Confirmar e enviar ao time"**.

```json
{ "id": "msg9", "role": "agent", "kind": "form", "text": "Terminei de preencher… confira e envie ao time.", "formularioId": "f-123", ... }
```

- `GET /chat/sessions/:sessionId/forms/:formId` → `FormularioImplantacao`. `processo.resumo.abertura` é lista: `["externo"]`, `["interno"]` ou `["externo","interno"]`. Campos que o front edita hoje: `orgao.*`, `processo.resumo`, `processo.formulario.secoes[].{titulo,campos[]}` (rótulo, tipo, obrigatório, ajuda; adicionar/remover), `processo.documentos`, `processo.taxas`, `processo.fluxo.etapas` (nome, responsável, prazo) e `prazoTotalDias`, `processo.documentoFinal`. Transições são só exibidas. Propriedades desconhecidas são preservadas no envio. **Fora do MVP do front:** setores e despachos.
- `origens[]` (`caminho` por prefixo: `resumo`, `formulario`, `documentos`, `taxas`, `fluxo`, `documentoFinal`, `orgao`) vira o selo "Do modelo / Você informou / Da legislação" de cada bloco.
- `pendencias[]` (`caminho` **relativo ao processo**, ex.: `taxas.0.baseCalculo`): o campo aparece com "Falta informar" enquanto estiver vazio; há contador de pendências. O front permite enviar mesmo com pendências.
- **Enviar:** `POST /chat/sessions/:sessionId/forms/:formId/submit` com o que a prefeitura revisou:
```json
// req
{ "orgao": { ... }, "processo": { ... } }
// res 200
{ "formulario": FormularioImplantacao /* status: "confirmado" */, "agentMessage": Message }
```
O back grava (sobrescrevendo o preenchido pelo agente), muda `status` para `confirmado`, dispara o fluxo para o time e responde com uma mensagem do agente. Validações do back (etapa/setor inexistente, `{{variáveis}}` inválidas etc.) devem voltar como `422 VALIDATION_ERROR` com `details: { "<caminho>": "mensagem" }`.
- Depois de `confirmado` o front mostra o formulário somente leitura. Se a conversa continuar (outro processo), o agente envia um novo `form`.

### Anexos
`POST /chat/sessions/:sessionId/attachments` — `multipart/form-data`, campo `file`.
```json
// res 201
Attachment = { "id": "a1", "name": "lei-alvara.pdf", "mimeType": "application/pdf", "sizeBytes": 482113, "url": "/files/a1" }
```
Limites propostos: **10 MB por arquivo**, **máx. 5 por mensagem**. Tipos aceitos: `pdf`, `png`, `jpg/jpeg`, `webp`, `xlsx`, `xls`, `csv`, `docx`, `txt`. Erros `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_TYPE`. O agente deve conseguir ler o conteúdo (OCR para imagens/PDF escaneado, se possível). `GET /files/:id` serve o arquivo (mesma auth do contexto: session token ou JWT com permissão).

### Rate limit
Endpoints públicos: sugerido 30 req/min por IP/sessão (`429 RATE_LIMITED`).

## 5. Dashboard — modelos

```ts
Client {                      // uma prefeitura atendida
  id, name, uf,
  implementerId, implementerName,
  status: "onboarding" | "in_progress" | "completed" | "at_risk",
  startedAt, targetDate,      // meta 45–60 dias
  processesTotal, processesComplete,   // ~100 por prefeitura
  secretariatsTotal, secretariatsDone,
  meetingsCount, hoursSavedMinutes,
  flowCreationMinutes          // 0 enquanto nenhum fluxo foi validado
  flowCreationSamples          // fluxos validados na média (0 = sem dado)
}

Process {                     // um processo/serviço da prefeitura (ex.: Alvará de reforma)
  id, clientId, name, secretariat,
  status: "not_started" | "collecting" | "awaiting_confirmation" | "confirmed" | "sent_to_dev" | "validated",
  completeness: 0-100,        // % do formulário preenchido
  backAndForths: number,      // idas e vindas até regra completa
  updatedAt
}

ProcessDetail extends Process {
  fields: [{ key, section, label, value, status: "filled"|"pending"|"to_validate",
             sourceConversationId?, sourceMessageId?, sourceAttachmentId? }]   // section agrupa na tela; source* = origem p/ auditoria
}

Conversation {
  id, clientId, contactName, contactPhone, secretariat,
  startedAt, lastMessageAt, messagesCount, processesTouched: string[],
  status: "active" | "waiting_confirmation" | "closed"
}
```

## 6. Dashboard — endpoints (JWT; papéis `implementer` e `head`)

Regra de escopo: `implementer` recebe **apenas** dados dos seus clientes. `head` recebe tudo e pode filtrar com `implementerId`. Se um implementador pedir recurso alheio → `403`/`404`.

### Métricas
`GET /metrics/summary?from=2026-09-01&to=2026-10-24&implementerId=&clientId=`
```json
{
  "period": { "from": "...", "to": "..." },
  "meetings":        { "value": 12, "baseline": 48, "deltaPct": -75 },        // sucesso = diminui
  "hoursSaved":      { "valueMinutes": 5400 },                                 // economia do implantador
  "flowCreation":    { "avgMinutes": 2880, "baselineMinutes": 14400, "deltaPct": -80, "samples": 37 }, // sucesso = diminui
  "processes":       { "total": 400, "complete": 212, "validated": 150 },
  "backAndForthsAvg": 2.1
}
```
`baseline` = referência do processo manual (por reunião) para comparação; definição e fórmula são do back (ver `docs/metricas-dashboard.md`).

**Sem dado nunca é `null`**: o valor vem `0` junto com o que indica a falta de amostra, e o front mostra "—". `meetings.deltaPct` → `meetings.baseline === 0`; `flowCreation.avgMinutes`/`deltaPct` → `flowCreation.samples === 0`; `backAndForthsAvg` → `processes.complete === 0`; `points[].value` de `flowCreation` → `points[].samples === 0`; `Client.flowCreationMinutes` → `flowCreationSamples === 0`; `Implementer.flowCreationAvgMinutes` → `flowCreationSamples === 0`. Detalhes em `docs/metricas-dashboard.md`.

`GET /metrics/timeseries?metric=meetings|hoursSaved|flowCreation|processesComplete&from=&to=&granularity=day|week&implementerId=&clientId=`
```json
{ "metric": "meetings", "points": [ { "date": "2026-10-01", "value": 3 } ] }
// flowCreation: { "date": "2026-10-01", "value": 2880, "samples": 2 }
```

### Reuniões (necessário para a métrica de reuniões)
O back precisa saber quantas reuniões aconteceram. Sugestão: o implantador registra pelo dashboard.
- `POST /clients/:clientId/meetings` `{ "date": "...", "durationMinutes": 45, "notes": "" }` → `201 Meeting`
- `GET /clients/:clientId/meetings` → `Meeting[]`

### Clientes
- `GET /clients?implementerId=&status=&q=&page=` → paginado de `Client`
- `GET /clients/:id` → `Client` + `{ "secretariats": [{ "id","name","processesTotal","processesComplete" }] }`
- `GET /clients/:id/processes?secretariat=&status=&q=&page=` → paginado de `Process`
- `GET /processes/:id` → `ProcessDetail`
- `POST /processes/:id/status` `{ "status": "sent_to_dev" | "validated" }` → `Process`. Única ação do painel (o formulário segue só leitura): leva um processo `confirmed` ao dev e à validação, o que fecha a métrica de tempo de fluxo. De outro status → `409 INVALID_TRANSITION`.
- `GET /clients/:id/conversations?page=` → paginado de `Conversation`
- `GET /conversations/:id` → `Conversation` + `messages: Message[]` (mesmo tipo `Message` do chat)

### Time (somente `head`; implantador recebe `403`)
- `GET /implementers` → 
```json
[{ "id":"u1","name":"Maria Silva","clientsCount":4,"processesTotal":400,"processesComplete":212,
   "meetingsCount":12,"hoursSavedMinutes":5400,"flowCreationAvgMinutes":2880,"flowCreationSamples":37,"clientsAtRisk":1 }]
```
- `GET /implementers/:id` → mesmo objeto + lista de clientes
- As rotas de métricas/clientes acima aceitam `implementerId` para o drill-down da head.

## 7. Notificações em tempo real (opcional, pós-MVP)
Dashboard pode usar polling (30s). SSE/WebSocket só se sobrar tempo.

## 8. Variáveis e execução
- O back sobe em `http://localhost:3333`. As rotas do dashboard (auth, métricas, clientes, processos, conversas, reuniões, implantadores) já estão em `/api/v1`; as do chat público (seção 4) **ainda não existem** — o back tem só `/implantacoes` (sem prefixo), que precisa ser adaptado a este contrato. Front: `VITE_API_URL=http://localhost:3333/api/v1` e `VITE_USE_MOCKS=false`.
- Seed mínimo para demo: 1 head, 2–3 implantadores, 4+ prefeituras, ~100 processos por prefeitura em estados variados, conversas com mensagens e formulários.
- Usuários de teste (combinar): `head / ...`, `maria.silva / ...`.

## 9. O que o back precisa implementar (checklist)
- [ ] Login/JWT com papéis `implementer` e `head`, e filtro de escopo em todas as rotas do dashboard
- [ ] `identify` / `register` / catálogo / sessões de chat com `sessionToken`
- [ ] Endpoint de mensagem integrando o agente (resposta `Message` com `kind`)
- [ ] Agente preenchendo o formulário do processo e emitindo `form` + endpoint `submit` com validação
- [ ] Upload de anexos com limites e leitura pelo agente
- [ ] Cálculo de métricas (reuniões vs baseline, horas economizadas, tempo de criação do fluxo, % de processos completos)
- [ ] Registro de reuniões
- [ ] Endpoints de clientes, processos, conversas, implantadores
- [ ] Seed de dados para demo, CORS, rate limit nos endpoints públicos

## 10. Pontos a decidir entre front e back
1. **Resposta do agente demora?** Se passar de ~60s, usar polling (`?after=`) em vez de bloquear a requisição.
2. **Fórmula das métricas:** como o back define o `baseline` de reuniões e de tempo de fluxo, e como estima as horas economizadas (sugestão: minutos manuais estimados por tipo de informação × itens coletados pelo agente).
3. **Reuniões:** registro manual pelo implantador (proposto) ou o back obtém de outra fonte?
4. **Idioma dos nomes:** o contrato usa nomes em inglês nas rotas e modelos do dashboard (`clients`, `processes`), enquanto o back usa português (`dominios`, `processos`, `formulario`). O `FormularioImplantacao` já segue o português do back. Decidir se o resto também será renomeado (o front ajusta em `src/types/schemas.ts` e `endpoints.ts`).
5. **Setores e despachos** do modelo do formulário ainda não são editáveis no front (aguardam o schema final no back).
