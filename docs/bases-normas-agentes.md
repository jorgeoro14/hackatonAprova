# Bases de normas e agentes de WhatsApp — API

Fluxo do implantador ao criar um agente:

1. **Escolher as bases**: `GET /api/v1/norm-bases` lista o catálogo (cards com nome, maturidade, processos cobertos e número de normas).
2. **Criar o agente**: `POST /api/v1/clients/:clientId/agents` com os `normBaseIds` escolhidos. As bases **transversais** (hoje `governo-digital`) entram sozinhas.
3. **Ligar a conversa**: `PUT /api/v1/conversations/:id/agent` define qual agente atende aquela conversa de WhatsApp.

Mesmas regras do dashboard: `Authorization: Bearer <token>`, erros no formato `{ error: { code, message, details } }` e implantador só vê os próprios clientes (cliente ou agente alheio → 404).

## Como as bases chegam ao banco

`knowledge/dominios/<id>` é a fonte da verdade (versionada no git). Na subida do servidor, `src/bases/sincronizar.ts` espelha cada domínio em `bases_normas` e cada norma em `normas` (migration `20261024130000_bases_normas_agentes.sql`). Se um domínio sair do `knowledge/` e algum agente o usar, a base fica `available: false` em vez de sumir.

| Campo de `dominio.json` | Vira | Para que serve |
|---|---|---|
| `maturidade`: `pronta` / `em-revisao` | `maturity`: `ready` / `in_review` | Selo no card; prontas aparecem primeiro |
| `transversal` | `crossCutting` | Entra automaticamente em todo agente |
| `processosCobertos` | `processTypes` | Lista do card ("cobre: Aprovação de loteamento, Reurb…") |
| `guia.md` | `guide` | Guia do domínio para o agente |

## Rotas

### `GET /norm-bases`

```json
[
  {
    "id": "planejamento-urbano",
    "name": "Planejamento Urbano",
    "description": "Política urbana e uso do solo: …",
    "maturity": "ready",
    "crossCutting": false,
    "available": true,
    "processTypes": ["Consulta prévia de viabilidade", "Aprovação de loteamento", "…"],
    "normCount": 8,
    "syncedAt": "2026-10-24T12:00:00.000Z"
  },
  { "id": "governo-digital", "crossCutting": true, "maturity": "in_review", "…": "…" }
]
```

Ordem: temáticas prontas, temáticas em revisão, transversais.

### `GET /norm-bases/:id`

Base + `guide` (markdown) + `norms`: `[{ id, title, kind, number, year, sphere, summary, officialUrl, coverage, tags }]`.

### `GET /norm-bases/:id/norms/:normId`

Norma completa: os campos acima + `relevance` (markdown: o que muda na implantação, com artigos) + `text` (texto integral).

### `POST /clients/:clientId/agents`

```json
{
  "name": "Agente Planejamento — Pref. de Canoas",
  "whatsappNumber": "+55 51 99999-0000",
  "status": "draft",
  "normBaseIds": ["planejamento-urbano"]
}
```

- `normBaseIds`: ao menos uma base **temática** (só transversal → 400).
- `whatsappNumber`: opcional; é normalizado para E.164 (`+5551999990000`). Número já usado por outro agente → 409.
- `status`: `draft` (padrão), `active` (exige WhatsApp) ou `paused`.

Resposta `201`:

```json
{
  "id": "uuid",
  "clientId": "uuid",
  "name": "Agente Planejamento — Pref. de Canoas",
  "whatsappNumber": "+5551999990000",
  "status": "draft",
  "normBases": [
    { "id": "planejamento-urbano", "name": "Planejamento Urbano", "maturity": "ready", "selection": "selected", "available": true },
    { "id": "governo-digital", "name": "Governo Digital e Processo Administrativo", "maturity": "in_review", "selection": "automatic", "available": true }
  ],
  "conversationCount": 0,
  "createdAt": "…",
  "updatedAt": "…"
}
```

### `GET /clients/:clientId/agents`, `GET /agents/:id`, `PATCH /agents/:id`

`PATCH` aceita qualquer subconjunto de `name`, `whatsappNumber` (`null` remove), `status` e `normBaseIds` (substitui a seleção; as transversais são recolocadas sozinhas).

### `PUT /conversations/:id/agent`

`{ "agentId": "uuid" }` liga e `{ "agentId": null }` desliga. Agente e conversa precisam ser da mesma prefeitura (senão 400).

### `GET /agents/:id/knowledge`

O que o agente de WhatsApp consulta: as bases dele, cada uma com `guide` e as normas com `relevance` (sem o texto integral, que vem por norma).
