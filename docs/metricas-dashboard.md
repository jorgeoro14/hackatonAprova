# Dashboard: banco, rotas e fórmulas das métricas

Resposta do back aos pontos em aberto do `BACKEND_CONTRACT.md` (seção 10) e o que já está implementado.

## Como rodar

1. No Supabase: **Connect → Session pooler → URI**. Coloque em `.env` como `DATABASE_URL` (veja `.env.example`).
2. Rode:

```bash
npm run db:migrate   # aplica supabase/migrations/*.sql pendentes
npm run db:seed      # apaga e recria os dados de demo (TRUNCATE ... CASCADE)
npm run dev          # API em http://localhost:3333/api/v1
```

O servidor também aplica as migrations ao subir e, com o banco vazio, já semeia. Front: `VITE_API_URL=http://localhost:3333/api/v1`.

O seed usa `TRUNCATE ... CASCADE` e por isso também apaga o que depende dos clientes de demo, como os agentes. Não rode em banco com dados reais.

Usuários de demo: `head`, `maria.silva`, `joao.pereira`, `ana.costa`, todos com a senha em `SEED_SENHA` (`.env.example`).
O seed tem 7 prefeituras com 100 processos cada (5 secretarias × 20), uma em cada status: onboarding, em andamento, em risco e concluída.

## Banco

PostgreSQL no Supabase. O acesso é por `node-postgres` (`src/db/banco.ts`); nos testes, por PGlite (Postgres embutido, sem servidor).

- O esquema fica em `supabase/migrations/` (padrão do Supabase CLI), e cada mudança entra como uma migration nova. `npm run db:migrate` registra o que aplicou em `supabase_migrations.schema_migrations`, a mesma tabela que o `supabase db push` usa.
- Convenções: tabelas no plural em `snake_case`, PK `uuid` (`gen_random_uuid()`), datas `timestamptz`, status como enums, índices nas FKs, trigger de `atualizado_em`.
- RLS está ligado em todas as tabelas e sem policies: a API pública do Supabase (chave anon) não lê nada. Só o backend, conectado como `postgres`, acessa os dados e aplica o escopo por implantador.
- Use o session pooler (porta 5432) ou a conexão direta. O transaction pooler (6543) não serve para um servidor de longa duração.

| Tabela | O que guarda |
|---|---|
| `usuarios` | implantadores e head (senha com scrypt) |
| `clientes` | prefeituras: implantador, início, data-meta |
| `secretarias` | secretarias de cada prefeitura |
| `processos` | status + carimbos `primeiro_contato_em`, `concluido_em`, `validado_em` + `idas_e_vindas` |
| `campos_processo` | itens de regra coletados (`categoria`, `status`, `origem` agente/implantador, `coletado_em`, mensagem de origem) |
| `contatos`, `conversas`, `conversa_processos`, `mensagens` | conversas do chat no formato `Message` do contrato |
| `reunioes` | reuniões registradas pelo implantador |

O status de um processo deve mudar por `mudarStatusProcesso` (`src/dashboard/repositorio.ts`), que mantém os carimbos e conta as idas e vindas.

Os itens de `campos_processo` saem do `FormularioImplantacao` por `formularioParaCampos` (`src/dashboard/campos.ts`) e são gravados por `gravarCamposProcesso`, que substitui os itens do processo a cada nova revisão do formulário.

| Bloco do formulário | Categoria |
|---|---|
| `processo.documentos[]` | `documento` |
| `processo.taxas[]` | `taxa` |
| `processo.fluxo.etapas[]` | `etapa` |
| `prazoDias` / `prazoTotalDias` | `prazo` |
| `processo.setores[]` | `setor` |
| `processo.despachos[]` (e transição sem despacho) | `despacho` |
| `processo.formulario.secoes[].campos[]` | `campo_formulario` |
| `processo.baseLegal[]` / `legislacaoLocal[]` | `base_legal` |
| `resumo`, `documentoFinal` e o restante | `outro` |

- `chave` = caminho no processo, o mesmo das `pendencias` (ex.: `taxas.0`).
- `status`: `pending` se uma pendência cai no item (no próprio caminho, num item abaixo dela, ou num caminho abaixo do item e da mesma categoria). Senão, `filled` com o formulário `confirmado` e `to_validate` antes disso. Pendência sem item correspondente (ex.: etapa sem prazo) vira um item pendente com `valor: ""`.
- `origem`: tudo o que está no formulário passou pelo agente (modelo, servidor ou legislação), então é `agente`.

## Rotas implementadas (`/api/v1`, JWT)

`POST /auth/login`, `GET /auth/me`, `POST /auth/logout`, `GET /metrics/summary`, `GET /metrics/timeseries`,
`GET|POST /clients/:id/meetings`, `GET /clients`, `GET /clients/:id`, `GET /clients/:id/processes`, `GET /processes/:id`,
`GET /clients/:id/conversations`, `GET /conversations/:id`, `GET /implementers`, `GET /implementers/:id`,
`POST /processes/:id/status`.

**`POST /processes/:id/status`** `{ "status": "sent_to_dev" | "validated" }` → `Process`. É a única escrita do painel, que no resto é só leitura (o formulário não é editado). Fecha o ciclo da métrica de tempo de fluxo: `confirmed → sent_to_dev → validated` (ou direto `confirmed → validated`). Repetir o status atual não muda nada. De qualquer outro status → `409 INVALID_TRANSITION` com `details: { from, allowedFrom }`. Escopo igual ao de `GET /processes/:id`.

Escopo: o implantador só recebe os próprios clientes. Se pedir outro `implementerId`, recebe `403`; se pedir um cliente, processo ou conversa de outro implantador, recebe `404`. `/implementers` responde só para a head.

## Fórmulas

As premissas do modelo manual ficam em `src/dashboard/parametros.ts`.
> TODO: calibrar com dados históricos reais da Aprova.

**Reuniões** (`meetings`)
- `value` = reuniões registradas no período.
- `baseline` = secretarias atendidas no período × 3. Uma secretaria conta como atendida se teve algum processo entre o 1º contato e a regra completa durante o período. O 3 representa levantamento, validação do form clonado e ajustes.
- `deltaPct` = (value − baseline) / baseline × 100. Vem `0` quando o baseline é 0.

**Horas economizadas** (`hoursSaved.valueMinutes`)
- Soma, para cada item de regra coletado pelo agente no período (origem `agente`, status diferente de `pending`), dos minutos que o implantador gastaria naquela categoria: documento 10, prazo 10, taxa 20, etapa 30, setor 15, despacho 20, campo de formulário 5, base legal 15, outro 10.

**Tempo de criação do fluxo** (`flowCreation`)
- `avgMinutes` = média de `validado_em − primeiro_contato_em` dos processos validados no período.
- `samples` = quantos processos foram validados no período. Com `0`, `avgMinutes` e `deltaPct` vêm `0`.
- `baselineMinutes` = 10 dias (14400 min).
- O processo chega a `validated` por `POST /processes/:id/status`.

**Processos**: `total`, `complete` (status `confirmed`, `sent_to_dev` ou `validated`) e `validated` mostram a situação atual, sem filtro de período.

**Idas e vindas**: conta cada vez que o processo volta para `collecting` depois de ter sido apresentado ou confirmado. `backAndForthsAvg` é a média entre os processos completos (`processes.complete`); sem nenhum, `0`.

**Status do cliente** (calculado, não fica salvo)
- `completed`: todos os processos validados.
- `onboarding`: nenhum processo iniciado.
- `at_risk`: a meta já passou, ou o progresso está mais de 20 p.p. abaixo do esperado para o tempo decorrido (linear entre o início e a meta).
- `in_progress`: os demais casos.

**Séries** (`/metrics/timeseries`)
- A semana começa na segunda-feira (UTC).
- `meetings` e `hoursSaved` somam o que caiu no balde.
- `flowCreation` é a média do balde e traz `samples` (validações no balde); sem validação, `value: 0, samples: 0`.
- `processesComplete` é acumulado (burn-up).
- Período padrão: os últimos 90 dias. `to` só com data inclui o dia inteiro.

## Sem dado (nunca `null`)

Nenhuma métrica numérica de `/metrics`, `/clients` e `/implementers` vem `null`. Sem amostra, o valor é `0`, e a resposta traz junto o que diz que não há amostra, para o front mostrar "—" em vez de um 0 falso:

| Métrica | Sem dado quando |
|---|---|
| `meetings.deltaPct` | `meetings.baseline === 0` |
| `flowCreation.avgMinutes` / `deltaPct` | `flowCreation.samples === 0` |
| `backAndForthsAvg` | `processes.complete === 0` |
| `points[].value` de `flowCreation` | `points[].samples === 0` |
| `Client.flowCreationMinutes` | `Client.flowCreationSamples === 0` |
| `Implementer.flowCreationAvgMinutes` | `Implementer.flowCreationSamples === 0` |

No front, `comAmostra(valor, samples)` (`frontend/src/features/dashboard/overview/metrics.ts`) faz essa conversão para exibir.

## Avisos ao front
- `Conversation.processesTouched` traz os **nomes** dos processos.
- `GET /clients/:id/meetings` devolve `Meeting = { id, clientId, date, durationMinutes, notes, createdBy, createdAt }`.
- `/implementers/:id` devolve o resumo + `clients: Client[]`.
- Ainda não implementado: as rotas públicas do chat (`/chat/identify`, `/register`, sessões, `forms/:id/submit`, anexos) e o catálogo. O chat atual continua em `/implantacoes` (memória). As tabelas para esse chat já existem no banco.
