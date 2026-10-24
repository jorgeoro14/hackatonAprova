# Back-end — Tasks para fechar o fluxo chat → agente → banco → dashboard

> Diagnóstico da `main` em 2026-10-24. Decisões já tomadas:
> - O agente é o **Python** da branch `feat/municipal-rag` (`agents/`). O agente TS (`src/agente/`) sai quando o Python estiver ligado.
> - O back precisa implementar o **chat** (`BACKEND_CONTRACT.md` §4) e **gravar os formulários no banco**.
> - O **painel do administrador continua só leitura**: exibe o formulário, não edita.
> - O **cálculo das métricas** precisa ser concluído, sempre a partir do banco e sem `null` na resposta.

## Situação de partida

| Peça | Hoje | Falta |
|---|---|---|
| Agente Python | Biblioteca/CLI (`ProcessInterviewAgent.invoke`), sem HTTP; usa OpenAI | Rodar como serviço; usar o `FormularioImplantacao`; consultar `knowledge/` |
| Formulário do agente | `contracts/schemas/form.schema.json` (provisório, em inglês: `municipality`, `steps`…) | O front e o back usam o `FormularioImplantacao` (`src/implantacao/formulario.ts`) |
| Chat no back | Só `/implantacoes` (sem prefixo, sessão em memória) | Todas as rotas `/api/v1/chat/*` e `/api/v1/catalog/*` |
| Banco | Tabelas do dashboard; `conversas.token_sessao_hash` já existe | Tabela de formulários; o fluxo real escrevendo em `conversas`/`mensagens`/`processos`/`campos_processo` |
| Dashboard | Rotas GET e fórmulas prontas, alimentadas só pelo seed | Alimentação pelo chat; política de "sem dado"; carimbo de `validado_em` |

## Trilhas e dependências

```
T0 (merge + contrato do form) ──┬──> A (agente Python) ──┐
                                ├──> B (back do chat) ───┼──> E (integração ponta a ponta)
                                ├──> C (painel leitura) ─┤
                                └──> D (métricas) ───────┘
```

A, B, C e D andam em paralelo depois do T0. Dentro de cada trilha, a ordem é a da numeração. As dependências entre trilhas estão em cada task.

**Critério de pronto (todas):** `npm run typecheck` e `npm test` verdes (no Python: `uv run --project agents pytest agents/tests` e `ruff check`), teste novo cobrindo a task, `docs/` atualizado quando muda contrato, PR revisado.

---

## T0 — Fundação (fazer primeiro, 1 pessoa)

### T0.1 Mergear `feat/municipal-rag` na `main`
- A branch está 19 commits atrás. O único conflito é `frontend/README.md` (add/add).
- Unificar o `.env.example`: manter as variáveis do back e acrescentar `MODEL_PROVIDER`, `MODEL_NAME`, `MODEL_API_KEY` e as de embeddings do RAG.
- Ver se a pasta `contracts/` e o `docs/` da branch (`architecture.md`, `integration.md`, `decisions.md`) contradizem `docs/BACKEND_CONTRACT.md`. **O `BACKEND_CONTRACT.md` vale para o front.** O `contracts/openapi.json` (`/sessions`, `/confirm`) não é o contrato do front: marcar como obsoleto ou remover.
- **Pronto:** `main` com `agents/`, testes Python e Node verdes.

### T0.2 Definir o contrato do formulário entre back e agente
- **Decisão:** o agente passa a receber e devolver o **`FormularioImplantacao`**, o mesmo que o front exibe e o banco guarda. Assim o back não precisa traduzir. O `agents/docs/implementation-form.md` já descreve esse modelo.
- Exportar o JSON Schema do `FormularioImplantacao` a partir do zod (`z.toJSONSchema`) para `contracts/schemas/form.schema.json`, com um script `npm run contracts:gerar`. O zod continua sendo a fonte da verdade.
- Redefinir `agent-request` e `agent-result`:
  - request: `session_id`, `dominio`, `municipio`, `form`, `messages`;
  - result: `assistant_reply`, `form`, `pendencias`, `pronto_para_revisao: boolean`.
- Papéis das mensagens: `employee`/`assistant` no agente ↔ `user`/`agent` no banco (o back converte).
- **Pronto:** schemas e exemplos em `contracts/` validando com `node scripts/check-contracts.mjs`; os dois lados de acordo.

---

## A — Agente Python (`agents/`)

### A1 Adotar o `FormularioImplantacao` (depende de T0.2)
- Trocar o form provisório pelo novo schema em `app/contracts.py`, `turn_schema()`, nos exemplos e nos testes.
- Recalcular `pendencias` (com `caminho` relativo ao processo, como o front espera) e `pronto_para_revisao`.
- O agente **nunca** marca `status: "confirmado"` (quem confirma é o back, no submit).

### A2 Expor o agente como serviço HTTP
- Hoje o README supõe que o back importa a classe Python, mas o back é Node. Criar um serviço FastAPI mínimo, `agents/app/server.py`:
  - `POST /turn`: recebe `agent-request` e devolve `agent-result`;
  - `GET /health`.
- Timeout interno de cerca de 50s; erro sanitizado, sem logar texto municipal (como já faz o `run_interview.py`).
- Variáveis: `MODEL_PROVIDER`, `MODEL_NAME`, `MODEL_API_KEY`, `AGENT_PORT`. Comando no README e no `Makefile`.
- **Pronto:** `curl` com `contracts/examples/agent-request.json` devolve um resultado válido.

### A3 Consultar a base da Aprova, a legislação e os processos
- Hoje o catálogo é sintético (`examples/catalog.synthetic.json`) e o agente não lê `knowledge/`.
- Gerar o catálogo a partir de `knowledge/dominios/<id>/processos/*.json` (o `ProcessoModelo` vira o `baseline`).
- Ferramenta de busca em `knowledge/sistema/*.md` e `knowledge/dominios/<id>/legislacao/*.md`, com citação do `id` da norma.
- Ou: o back expõe `GET /busca` (já existe em `src/app.ts`) e o agente consulta por HTTP. Escolher um caminho e documentar em `agents/docs/decisions.md`.
- **Pronto:** um teste mostra o agente carregando um processo-modelo do domínio e citando uma norma real da base.

### A4 Respostas em português e fim de processo
- Garantir que o `assistant_reply` sai em PT-BR (o prompt está em inglês).
- Quando `pronto_para_revisao` virar `true`, a resposta avisa que o formulário vai para conferência.
- **Pronto:** casos sintéticos em `agents/tests/` cobrindo correção de um dado, valor desconhecido mantido como pendência e conclusão.

---

## B — Back do chat (`src/`)

### B1 Migration: formulários e sessões de chat (depende de T0.2)
- Migration **nova** em `supabase/migrations/`, sem editar as já aplicadas:
  - `formularios`: `id uuid`, `conversa_id`, `processo_id` (nulo até o vínculo), `dominio`, `status` (`rascunho`/`em_revisao`/`confirmado`), `dados jsonb` (o `FormularioImplantacao`), `revisao int`, `confirmado_em`, `criado_em`, `atualizado_em`. RLS ligado, como as demais.
  - `anexos` (se B7 entrar): `id`, `conversa_id`, `nome`, `mime`, `tamanho`, `caminho`, `criado_em`.
  - Se precisar, `registros_pendentes` para o `registrationToken` do cadastro; ou usar um token assinado sem estado (como o JWT).
- **Pronto:** `npm run db:migrate` aplica e o PGlite dos testes também.

### B2 Catálogo: `GET /api/v1/catalog/municipalities?q=` e `/:id/secretariats`
- Lê de `clientes` e `secretarias`. É público, sem JWT.

### B3 Identificação e cadastro: `POST /chat/identify` e `POST /chat/register`
- `identify`: telefone E.164 → `contatos`. Se conhecido, abre ou retoma a `conversa` ativa, gera o `sessionToken` (guardar só o hash em `conversas.token_sessao_hash`) e devolve o `contact`.
- `register`: valida o `registrationToken` e cria o `contato` (e a `secretaria`, se vier texto livre) e a `conversa`.
- Middleware que valida o `X-Session-Token` nas rotas `/chat/sessions/:id/*`.

### B4 Mensagens: `GET` e `POST /chat/sessions/:id/messages` (depende de A2, B1, B3)
- Cliente HTTP para o serviço do agente (`src/agente/cliente.ts`, URL em `AGENT_URL`) com timeout.
- `POST`:
  1. grava a mensagem do usuário;
  2. monta o `agent-request` (formulário atual + histórico da conversa);
  3. chama o agente;
  4. valida a resposta com o zod do `FormularioImplantacao`;
  5. grava, **na mesma transação**, a resposta do agente e a nova revisão do formulário.
- Atualizar `conversas.ultima_mensagem_em`.
- Se `pronto_para_revisao`: gravar a mensagem `kind: "form"` com `formularioId` e pôr a conversa em `waiting_confirmation`.
- Uma mensagem por vez por sessão (409). Se o agente falhar, nada é gravado além da mensagem do usuário, e a resposta é um erro claro para o front tentar de novo.
- `GET ?after=`: histórico no formato `Message`.

### B5 Formulário: `GET /chat/sessions/:id/forms/:formId` e `POST .../submit`
- `submit`:
  - valida com `FormularioImplantacao` (422 `VALIDATION_ERROR` com `details` por caminho);
  - grava o que a prefeitura revisou (sobrescreve o do agente);
  - `status: "confirmado"`, `confirmado_em`;
  - devolve `{ formulario, agentMessage }`.
- Formulário confirmado fica somente leitura: novo submit → 409.

### B6 Ponte formulário → dashboard (depende de B5; alimenta D)
- Vincular o formulário a um `processo`:
  - por nome do processo + secretaria da conversa;
  - se não existir, criar;
  - preencher `conversa_processos`.
- Converter o `FormularioImplantacao` em linhas de `campos_processo`: `chave`, `rotulo`, `valor`, `status` (`filled`/`pending` conforme `pendencias`), `origem` (`agente` ou `implantador` conforme `origens`), `categoria`, `coletado_em`, `mensagem_origem_id`. A tabela de categorias está em D2.
- Transições via `mudarStatusProcesso` (já existe em `src/dashboard/repositorio.ts`):
  - 1ª mensagem sobre o processo → `collecting`;
  - formulário emitido → `awaiting_confirmation`;
  - prefeitura volta a corrigir depois do form → `collecting` (conta ida e volta);
  - submit → `confirmed`.
- **Pronto:** teste de ponta a ponta no PGlite: conversa simulada com o agente mockado → processo `confirmed` com campos → `/metrics/summary` reflete.

### B7 Anexos (opcional para a demo)
- `POST /chat/sessions/:id/attachments` (multipart, 10 MB, tipos do contrato) e `GET /files/:id`.
- Passar o texto extraído ao agente (o RAG Python já lê PDF, DOCX e TXT).

### B8 Limpeza e endurecimento
- Remover `/implantacoes` e o agente TS (`src/agente/agente.ts`, `ferramentas.ts`, `prompt.ts`, `sessao.ts`) e os testes deles. Manter `patch.ts` se ainda for usado.
- Rate limit nos endpoints públicos (`@fastify/rate-limit`, 30/min, 429 `RATE_LIMITED`). CORS já existe.
- Atualizar `README.md`, `CLAUDE.md` e a §8–9 do `BACKEND_CONTRACT.md`.

### B9 Seed no formato novo
- `src/db/seed.ts` hoje grava o "form" antigo (`fields[]`) dentro de `mensagens.dados`.
- Passar a criar linhas em `formularios` com `FormularioImplantacao` válidos e mensagens `kind: "form"` com `formularioId`.
- Os campos pendentes não devem vir com `valor: null` (ver C2).

---

## C — Painel do administrador (só leitura)

### C1 Exibir o formulário do processo no dashboard (depende de B1)
- Back:
  - `GET /api/v1/processes/:id/form` → último `FormularioImplantacao` do processo (status, revisão, `confirmado_em`), com o escopo do implantador;
  - `GET /api/v1/forms/:id` para abrir a partir da mensagem `kind: "form"` em `/conversations/:id`.
- Front: no `ProcessDetailPage` e no `ConversationPage`, mostrar o formulário em modo leitura. Dá para reaproveitar o `FormularioCard`/`FormularioEditor` com uma prop `readOnly`.

### C2 Corrigir as divergências de `null` que já quebram telas
- `ProcessDetail.fields[].value`: o back manda `null` em campo pendente; o front exige `z.string()` (`frontend/src/types/schemas.ts:219`).
- `Conversation.secretariat`: o back pode mandar `null`; o front exige string.
- Alinhar seguindo a política de D1: o back devolve `""`/`"—"` ou o front aceita `nullable()`. Corrigir os dois lados e o contrato.

---

## D — Métricas do dashboard

### D1 Política de "sem dado" sem `null` (decisão + implementação)
- Hoje vêm `null`, por contrato: `meetings.deltaPct` e `flowCreation.deltaPct`, `flowCreation.avgMinutes`, `backAndForthsAvg`, `points[].value` de `flowCreation`, `Client.flowCreationMinutes`, `Implementer.flowCreationAvgMinutes`.
- Proposta, para não mostrar um "0" falso: cada métrica passa a ser `{ value: number, hasData: boolean }` (ou um campo `samples: number`). O valor de reserva fica explícito: 0 para contagens e para o delta; para o tempo médio, o fluxo em andamento mais antigo (`agora − primeiro_contato_em`) ou 0.
- Atualizar `src/dashboard/metricas.ts`, `repositorio.ts`, `docs/metricas-dashboard.md`, o §6 do `BACKEND_CONTRACT.md` e os schemas e KPIs do front, numa entrega coordenada com o front.
- **Pronto:** nenhuma rota de `/metrics`, `/clients` ou `/implementers` devolve `null` numérico; testes cobrindo período vazio, cliente sem processos e implantador sem clientes.

### D2 Categorias dos itens coletados (para `hoursSaved`; usado em B6)
- Mapear os blocos do `FormularioImplantacao` para `categoria_campo`:

| Bloco | Categoria |
|---|---|
| `processo.documentos[]` | `documento` |
| `processo.taxas[]` | `taxa` |
| `processo.fluxo.etapas[]` | `etapa` |
| `prazoDias` / `prazoTotalDias` | `prazo` |
| setores | `setor` |
| despachos | `despacho` |
| `processo.formulario.secoes[].campos[]` | `campo_formulario` |
| `baseLegal` / `legislacaoLocal` | `base_legal` |
| restante | `outro` |

- Só conta como economia o que veio com `origem` do agente ou do modelo e não está pendente (regra atual de `itensColetadosPeloAgente`).
- Uma função pura com teste: `formularioParaCampos(form) → campos[]`.

### D3 Fechar o ciclo `validated` (senão `flowCreation` nunca tem amostra)
- `flowCreation` mede do 1º contato até `validado_em`. Com o painel só leitura, **ninguém leva o processo a `sent_to_dev`/`validated`**.
- Decidir uma destas saídas:
  - (a) um único endpoint de ação, `POST /processes/:id/status` (só `sent_to_dev`/`validated`, sem editar o formulário);
  - (b) um script ou rotina do time;
  - (c) considerar `confirmado` como fim do fluxo na métrica (mudar a fórmula e a doc).
- **Pronto:** existe um caminho real até `validado_em`, coberto por teste.

### D4 Cobertura de testes das métricas com dados do fluxo real
- Em `test/dashboard.test.ts`, um cenário criado via B6 (não pelo seed) cobrindo:
  - reuniões vs baseline (`secretariasAtendidas × 3`);
  - horas economizadas por categoria;
  - tempo de fluxo;
  - completos e validados;
  - idas e vindas;
  - séries `day`/`week` com bordas de período e fuso (UTC).
- Conferir que os agregados por cliente e por implantador (`agregarClientes`, `listarImplantadores`) batem com o `/metrics/summary` do mesmo escopo.

### D5 Calibrar premissas (`src/dashboard/parametros.ts`)
- `REUNIOES_MANUAIS_POR_SECRETARIA`, `MINUTOS_FLUXO_MANUAL`, `MINUTOS_MANUAIS_POR_CATEGORIA` e `TOLERANCIA_ATRASO_PP` estão com `TODO: calibrar`.
- Levantar números reais com o time da Aprova. Sem fonte, manter o `> TODO` (regra do projeto: não inventar valores).

### D6 (opcional) Métrica secundária: tempo de validação do form
- Do formulário emitido (`kind: "form"`) até o submit: média por período, nova série em `/metrics/timeseries`. Só se sobrar tempo.

---

## E — Integração e demo

### E1 Ponta a ponta com o front real (depende de A2, B4, B5, B6, C1, D1)
- `VITE_USE_MOCKS=false`, `VITE_API_URL=http://localhost:3333/api/v1`, agente rodando em `AGENT_URL`.
- Roteiro:
  1. identificar o telefone;
  2. conversar até o formulário;
  3. corrigir um dado;
  4. confirmar;
  5. ver o processo, o formulário e as métricas mudarem no dashboard com o login do implantador e da head.
- Registrar a ordem de subida (banco → agente → back → front) no `README.md` e no `docs/DEMO.md`.

### E2 Ensaio de falhas
- Agente fora do ar ou lento (o front mostra "tentar de novo", nada é perdido), submit com erro 422, token de sessão inválido (401) e reinício do back no meio da conversa (a conversa continua, porque agora está no banco).

---

## Sugestão de divisão (4 pessoas)

| Pessoa | Trilha | Tasks |
|---|---|---|
| 1 | Fundação + agente | T0.1, T0.2, A1–A4 |
| 2 | Chat (entrada) | B1, B2, B3, B4, B8 |
| 3 | Formulário e painel | B5, B6, B9, C1, C2 |
| 4 | Métricas | D1–D6 (D2 em par com a pessoa 3, porque B6 usa) |
| Todos | Integração | E1, E2 |

**Decisões que precisam sair antes de codar:** T0.2 (formato do form entre back e agente), D1 (como representar "sem dado") e D3 (como um processo chega a `validated`).
