# Contrato Front ↔ Back (v0.1)

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
  "form": Form                                                                            // só em kind=form
}
```
`text` aceita **markdown simples** (negrito, listas). O front não executa HTML.

### Formulário preenchido (`kind: "form"`)
> ⚠️ **Em revisão.** O modelo real do formulário (`docs/modelo-formulario-implantacao.md`, tipo `FormularioImplantacao` do back) é bem mais rico que o `key/label/value` abaixo (seções, fluxo, despachos, selo de origem, "Confirmar bloco", pendências). A mensagem `form` passará a carregar o `FormularioImplantacao`, e os endpoints de leitura/edição/confirmação serão definidos na task T8. O texto abaixo vale só como esboço do fluxo.

O agente preenche o formulário **no back**, durante a conversa, sem mostrá-lo. Ao terminar a coleta de um processo, ele envia uma mensagem `form` já preenchida. O front exibe o formulário com os valores preenchidos, **cada campo editável** (clicar e alterar o texto), e **um único botão: "Confirmar e enviar ao time"**. Não há botão de "alterar": a pessoa corrige direto nos campos.

```json
"form": {
  "id": "f1",
  "processName": "Alvará de reforma",
  "secretariat": "Secretaria de Obras",
  "status": "awaiting_confirmation",     // awaiting_confirmation | submitted
  "fields": [
    { "key": "documentos_exigidos", "label": "Documentos exigidos", "type": "textarea", "value": "Projeto arquitetônico, ART/RRT, matrícula do imóvel", "required": true },
    { "key": "prazo_analise",       "label": "Prazo de análise",    "type": "text",     "value": "15 dias úteis", "required": true },
    { "key": "taxa",                "label": "Possui taxa?",        "type": "select",   "value": "Sim", "options": ["Sim", "Não"], "required": false }
  ]
}
```
- `type`: `text` | `textarea` | `select` | `number` | `date`. Se o back só usar `text`/`textarea`, o front já funciona; os demais são opcionais.
- **Enviar:** `POST /chat/sessions/:sessionId/forms/:formId/submit` com os valores finais (editados ou não) de uma vez:
```json
// req
{ "values": { "documentos_exigidos": "Projeto, ART/RRT, matrícula", "prazo_analise": "20 dias úteis", "taxa": "Sim" } }
// res 200
{ "form": Form(status:"submitted"), "agentMessage": Message }
```
O back grava os valores (sobrescrevendo o que o agente preencheu), marca o processo como pronto para o time e dispara o fluxo interno. `422 VALIDATION_ERROR` com `details: { "<key>": "mensagem" }` se faltar campo `required`.
- Campos são **genéricos** (`key/label/type/value`) porque o formulário ainda será definido; o front renderiza qualquer lista sem mudar código.
- Se a pessoa continuar conversando depois de `submitted` (ex.: outro processo), o agente pode enviar um novo `form`.

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
  meetingsCount, hoursSavedMinutes, flowCreationMinutes
}

Process {                     // um processo/serviço da prefeitura (ex.: Alvará de reforma)
  id, clientId, name, secretariat,
  status: "not_started" | "collecting" | "awaiting_confirmation" | "confirmed" | "sent_to_dev" | "validated",
  completeness: 0-100,        // % do formulário preenchido
  backAndForths: number,      // idas e vindas até regra completa
  updatedAt
}

ProcessDetail extends Process {
  fields: [{ key, label, value, status: "filled"|"pending"|"to_validate", sourceMessageId?, sourceAttachmentId? }]
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
  "flowCreation":    { "avgMinutes": 2880, "baselineMinutes": 14400, "deltaPct": -80 }, // sucesso = diminui
  "processes":       { "total": 400, "complete": 212, "validated": 150 },
  "backAndForthsAvg": 2.1
}
```
`baseline` = referência do processo manual (por reunião) para comparação; definição e fórmula são do back (ver seção 10).

`GET /metrics/timeseries?metric=meetings|hoursSaved|flowCreation|processesComplete&from=&to=&granularity=day|week&implementerId=&clientId=`
```json
{ "metric": "meetings", "points": [ { "date": "2026-10-01", "value": 3 } ] }
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
- `GET /clients/:id/conversations?page=` → paginado de `Conversation`
- `GET /conversations/:id` → `Conversation` + `messages: Message[]` (mesmo tipo `Message` do chat)

### Time (somente `head`; implantador recebe `403`)
- `GET /implementers` → 
```json
[{ "id":"u1","name":"Maria Silva","clientsCount":4,"processesTotal":400,"processesComplete":212,
   "meetingsCount":12,"hoursSavedMinutes":5400,"flowCreationAvgMinutes":2880,"clientsAtRisk":1 }]
```
- `GET /implementers/:id` → mesmo objeto + lista de clientes
- As rotas de métricas/clientes acima aceitam `implementerId` para o drill-down da head.

## 7. Notificações em tempo real (opcional, pós-MVP)
Dashboard pode usar polling (30s). SSE/WebSocket só se sobrar tempo.

## 8. Variáveis e execução
- Back expõe porta configurável (sugestão `3000`); front usa `VITE_API_URL=http://localhost:3000/api/v1`.
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
4. **Estrutura final do formulário:** quando definida, atualizar `form.fields` (continuam genéricos, sem quebrar o front).
