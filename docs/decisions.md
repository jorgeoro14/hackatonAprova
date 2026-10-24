# Decision log

## Agreed baseline

- One shared repository with frontend/, backend/, agents/, and versioned contracts/.
- Frontend communicates with the backend. The backend owns sessions and calls the agent through an adapter.
- WhatsApp-like browser chat; no real WhatsApp integration in the MVP.
- Human-reviewed provisional implementation form; no automatic system configuration.
- Synchronous, non-streaming messages and JSON export for the first integration.
- main with short feature branches, small pull requests, and one teammate review.

## Decisions to record at kickoff

| Decision | Status | Owner |
| --- | --- | --- |
| Actual GitHub handles for each role | Pending | Team |
| Frontend framework and package manager | Pending | Frontend |
| Backend language/framework and session store | Pending | Backend |
| Agent framework, provider, and model | LangChain Python; initial OpenAI adapter; model set by deployment | Agents |
| Official company form and required fields | Pending | Team / implementation specialist |
| UI language and one demo process | Pending | Team |
| Demo hosting and access restrictions | Pending | Team |

For each new decision record date, owner, choice, reason, trade-off, and affected contract. Keep this lightweight.

## 2026-10-24: intent-driven process interview foundation

- Owner: Agents.
- Choice: Python 3.11+, LangChain 1.x `create_agent`, explicit `ToolStrategy`, and JSON Schema runtime validation. The initial CLI uses `langchain-openai`; `MODEL_NAME` is required rather than choosing a model implicitly. The agent constructor accepts an injected LangChain chat model.
- Reason: one focused interview with a fixed read-only process lookup tool. The backend already supplies the conversation and current form, so no additional graph, checkpointer, agent-owned database, or planning harness is needed.
- Choice: load the intent registry from `agents/intents.json`; generate the internal field-update schema from the canonical form. Merge updates into the current form and return the existing agent-result shape. Validate inputs and outputs with `jsonschema` plus format checks.
- Choice: a replaceable `ProcessCatalog` interface and an empty default catalog. The user will supply Aprova's official process mappings and forms. An explicitly selected synthetic catalog is available for local development. Structured name/ID lookup does not need embeddings or a vector database yet.
- Trade-offs: intent classification, follow-up quality, baseline acceptance and grounding remain model behaviors requiring live evaluation. Schema checks validate structure, not truth. The public form has no baseline-version, change-diff, or optional-field acknowledgement fields; do not infer these from empty collections. Design a coordinated contract update after the official artifacts arrive.
- Boundaries: the backend retains session storage, overall 60-second deadline, readiness, confirmation and export. The CLI only processes one request; backend integration remains separate work. Agent model calls use a 40-second per-call timeout, no automatic provider retries, and a bounded loop; these do not replace the backend's overall deadline.
- Observability: document LangSmith variables, but tracing is opt-in because it may transmit conversation content. Use synthetic sessions when enabling it during development.
- Affected contracts: no public schema or API changes. New dependencies are scoped to `agents/pyproject.toml`, with `agents/uv.lock` recording resolved versions.
- References: [LangChain agents](https://docs.langchain.com/oss/python/langchain/agents) and [structured output](https://docs.langchain.com/oss/python/langchain/structured-output).

## 2026-10-24: public Aprova API documentation as agent reference

- Owner: Agents.
- Choice: extract the public OpenAPI definitions for Process, Type, Template, Dispatch and Blueprint Process into `agents/knowledge/aprova/api-contract.json`. Include both read and mutation operation shapes as documentation, with source hash and retrieval time. Keep English explanations and explicitly synthetic response templates alongside it.
- Reason: the user has no API key and requested documentation and response-template extraction. Public schemas can inform the interview without pretending to retrieve municipal data. The earlier proposal for an authenticated extractor is not part of this increment.
- Integration: add a local `get_aprova_reference` LangChain tool, separate from `search_processes`. It cannot call the network, execute an API operation, or make a documentation example an accepted municipal baseline. A local CLI makes the reference accessible without any provider key.
- Trade-offs: the published spec has no template-list endpoint or full blueprint GET/list. Raw process/form contents are open objects. Some documented dispatch response types differ across operations. Preserve these limits rather than inventing one unified schema or a complete baseline.
- Boundaries: no new dependency, shared API contract change, authenticated request, live-data fixture, catalog hydration or automatic form mapping. Detailed template/dispatch/tab changes remain unresolved until the official developer questionnaire and its field mappings arrive.
- Validation: captured JSON Schemas and synthetic responses are checked offline; scripted-model tests exercise reference tool delivery. Live API compatibility and model grounding remain unverified.
- Source: [Aprova Hub API](https://hubapi.aprova.com.br/aprovahubapi/) and its [OpenAPI description](https://hubapi.aprova.com.br/_bundle/aprovahubapi.json?download=).

## 2026-10-24: align instructions with the supplied implantation form

- Owner: Agents.
- Source: fetched `origin/setup/base-conhecimento` at `acd2de595365622a87f93765b008a1923140dcde`; reviewed its implantation questionnaire, `FormularioImplantacao`, `ProcessoModelo`, interview guide, example model and knowledge loader.
- Choice: load one pinned English implantation guide into the existing LangChain system prompt. Expand intents to the questionnaire's blocks, local legislation, pending issues and block acceptance. Preserve exact external field paths and enums instead of translating schema identifiers.
- Reason: the team has supplied a form model; the interview can now ask targeted model-first questions and distinguish model proposals, representative answers and identified legal sources.
- Trade-offs: the questionnaire is richer than its own schema. Sector registry, dispatches, day-count rules, payment stage type, fee-stage links and parts of summary/final-document configuration are missing there. Intended validation and block controls are not all implemented. The guide records these gaps rather than claiming compatibility.
- Boundary: this increment updates instructions and intent routing, not the shared request/result schema or backend. The Python provisional form cannot persist nested implantation data, origins or pending issues. Keep unmapped details in conversation with an explicit gap; complete nested output requires a coordinated migration. The source branch's knowledge loader has not been merged or connected.
- Validation: scripted-model tests check that source-backed instructions reach the model, new block intents work with the existing output envelope, and source-only keys remain rejected. Live classification, legal applicability and full implantation persistence are not established by these checks.

## 2026-10-24: organize the agent like the ai-agent-sales reference

- Owner: Agents.
- Choice: follow the user-supplied local reference's `app/agent/`, `scripts/`, `docs/` and `tests/` organization inside `agents/`. Separate workflow composition, prompt assembly, read-only tools and turn helpers. Keep catalog/reference code in `app/knowledge/`, with data under `knowledge/`. Centralize repository asset paths in `app/paths.py`.
- Reason: make responsibilities and entry points easier to find and change while retaining frontend/backend/agent ownership. The backend import `agents.interview.ProcessInterviewAgent` and `python -m agents` remain available through thin delegates.
- Trade-offs: documentation inspection and extraction use their new module paths. The component still requires repository-relative shared schemas and bundled prompt/guide/data assets. The source course's sales CRM, database, notebooks and graph registrations do not belong to this component's current runtime; they were not imported.
- Boundaries: no new dependencies, contract change, provider behavior change, graph server, embeddings, database or agent-owned persistence. Continue using LangChain `create_agent` through the validated backend adapter. See [the structure guide](../agents/docs/structure.md) for current locations and commands; earlier decision entries retain their historical paths.

## 2026-10-24: prepare municipality-scoped agentic RAG

- Owner: Agents.
- Choice: retain the LangChain interview as the decision point for whether retrieval is needed. Expose a read-only `search_municipal_documents` tool backed by a LangGraph retrieval/grade/rewrite/generate graph. Use at most two retrieval attempts by default, then return no evidence. The original question remains fixed across rewrites; only the search query changes.
- Reason: follow the [LangGraph agentic RAG tutorial](https://docs.langchain.com/oss/python/langgraph/agentic-rag) while preserving the validated interview adapter and backend-owned session state. LangGraph's graph and text splitting packages become direct dependencies; Pydantic explicitly defines internal RAG artifacts. Chroma, pypdf and python-docx are an optional `rag` extra.
- Choice: explicit local-file manifests, source checksums, page/start offsets and deterministic chunk IDs; RecursiveCharacterTextSplitter starts at 1000 characters with 200 overlap. Preview does not embed or write an index. An explicit `--embed` sends chunks to the configured OpenAI embedding model and persists Chroma locally. Querying also sends the search query to that provider. Same embedding provider/model is required at query time.
- Choice: bind each retriever to an operator/backend-authorized municipality and corpus, with matching session municipality required. Scope is not a model tool argument. Each content/config/embedding fingerprint gets a separate collection, with mandatory scope filters and post-retrieval checks. Activate an index descriptor atomically after its chunks are present. Repeating the same build reuses chunk IDs; changed corpora get a new snapshot. Only one writer per index directory is supported; old snapshots remain until operator cleanup.
- Trade-offs: local Chroma is suitable for this scaffold, not a production authorization service or multi-writer database. The backend must authorize index access; a matching municipality name alone is not authentication. Text/Markdown, text PDFs and DOCX are supported; scanned/blank PDF pages require extraction/OCR, DOCX headers/footers and complex layout are not extracted, and document currency/applicability remain human checks. Retrieval/grading/generation accuracy needs evaluation on the supplied corpus.
- Boundaries: no municipal corpus or paid embedding/model call is created by this change. Synthetic fixtures stay labeled. Raw documents/manifests belong in ignored `agents/data/`, indexes in ignored `agents/.local/`; do not commit municipal content. No public schema changes. Tool answers include source evidence, but the shared form still cannot persist structured citations/origins. The model must propose documentary facts for acceptance rather than treating them as employee answers. The backend still enforces the overall 60-second deadline; nested RAG calls add latency and do not extend it. Tracing remains opt-in.

## 2026-10-24: align RAG files and experiments with the reference phases

- Owner: Agents.
- Sources: inspected the local `ai-agent-sales` phase scripts, Makefile, pytest markers, dataset, experiment template and RAG testing guide; checked the current [LangGraph agentic RAG tutorial](https://docs.langchain.com/oss/python/langgraph/agentic-rag), [Chroma integration](https://docs.langchain.com/oss/python/integrations/vectorstores/chroma) and [LangSmith RAG evaluation guide](https://docs.langchain.com/langsmith/evaluate-rag-tutorial).
- Choice: use `scripts/rag_phase0.py` and Phase 1/2/3 runners, a shared validated question dataset and experiment matrix, phase-marked tests under `tests/rag/`, local JSON/CSV reports and Make targets. Keep reusable scoring/reporting in `app/rag/evaluation.py` and common CLI behavior in one module. Extract the common structured-model call to avoid duplicating source-data handling.
- Choice: compare recursive vs Markdown-aware recursive chunk variants and vector vs MMR retrieval with the same municipality/corpus filters and post-checks. Keep previous single-index CLI and `k=` constructor compatible. The additive internal chunk-strategy setting defaults to recursive for existing index descriptors. No shared request/form schema changes and no new dependencies are required.
- Choice: default Phase 0 to preview and Phase 1/2/3 to plan. Require `--embed` or `--live` before provider calls. Optional Phase 3 judging also requires `--judge` and explicit `EVAL_MODEL_NAME`. Record real snapshot identity, dataset/config/lockfile hashes, model configuration, per-case failures and metric denominators; do not convert errors into successful runs or negative judge scores. Do not include raw question/answer/passage text in generated reports. Reports are ignored by Git.
- Metrics: document-ID hit@1/hit@k, recall@k and reciprocal rank for answerable cases; lexical coverage is diagnostic. Phase 3 measures abstention, cited-source recall and optional independent correctness/relevance/groundedness judgments. Its live target is the agentic RAG subgraph; the outer interview tool-choice/adapter has separate scripted regression coverage. Fast sampling preserves a negative case where available. Offline fakes validate mechanics, not embedding or model quality.
- Trade-offs: preserve the phase organization rather than copying the reference's destructive database resets, PostgreSQL staging, company-specific filters, YAML dependency or implicit provider/judge calls. Semantic chunking, lexical/hybrid search, HyDE and reranking remain deferred and invalid options are rejected. Markdown splitting here is language-aware recursive splitting, not an implementation of all the course's header/semantic methods. Multi-writer indexing, corpus evaluation and live quality validation remain future work.
# 2026-10-24 — Requirements graph and local review persistence

Use the user-supplied `main/docs/modelo-formulario-implantacao.md` as the shared
implantation questionnaire source. Its latest file commit remains
`acd2de595365622a87f93765b008a1923140dcde`; the local content matches after newline
normalization. Both agents load one provenance descriptor, the canonical local
document, the existing English guide and the existing intent registry. Keep that
questionnaire distinct from an actual municipality's process input-form baseline.
The requirements export records source/hash, its applicant-field scope and an
explicit false whole-questionnaire completion flag. This avoids claiming full
implantation completion from the narrower field-change schema; shared HTTP
contracts and consumer integration remain unchanged.

The selected live model is OpenAI `gpt-6-luna`, as requested by the user. The
shared provider accepts `OPENAI_API_KEY` with the existing `MODEL_API_KEY` override.
Preserve the current Chat Completions/tool contract with `reasoning_effort=none`,
as required for Luna function calls on that endpoint. This favors the current
interactive flow; reasoning with tools would be a separately validated Responses
API migration. No embedding model or other explicit model selection is changed.
The default Studio configuration now loads the live factory and ignored root
`.env`; `langgraph.demo.json` keeps the deterministic synthetic flow. Both
factories initialize catalogs/provider clients outside the server event loop.

Register separate synthetic/live local Studio graph factories through root
`langgraph.demo.json`, `langgraph.json` and the compatible `langgraph.live.json`. The optional `studio` extra installs
`langgraph-cli[inmem]`; Agent Server owns checkpointing in that mode. The default
demo configuration disables tracing and uses only a deterministic synthetic interview.
The local development server is not the production authenticated agent endpoint.

Use the existing LangGraph/Python/Pydantic stack for a separate requirements
discovery workflow. Its closed change schema is an internal declarative proposal,
not a replacement for `contracts/` or a vendor-certified builder payload. Read
the team field enum from `src/knowledge/schemas.ts`; a supplied capability profile
must independently confirm supported operations. Public API documentation and
synthetic examples cannot establish a real municipal baseline.

Add optional `langgraph-checkpoint-sqlite` for local restartable interviews and
human review. SQLite is a local development store; the hosting backend must own
authorization, session serialization and retention before integration. Keep the
existing stateless HTTP agent adapter unchanged. Strict checkpoint deserialization
is enabled in the CLI. No Aprova mutation tool is introduced, even after approval.

Public legislation is collected separately with original bytes/provenance, exact
article offsets and SQLite FTS5/BM25. JSONL is ready for later semantic indexing;
no embeddings are generated. Currentness and municipality applicability remain
separate review gates, including the Council-hosted 2023 Organic Law consolidation.
SQLite FTS5 uses the Python standard library and adds no service dependency.

## 2026-10-24: scoped remote knowledge for requirements discovery

- Owner: Agents; additive upstream consumer documentation in `contracts/knowledge-api.md`.
- Evidence: inspected `src/app.ts`, `src/bases/rotas.ts`, `src/bases/repositorio.ts`,
  `docs/bases-normas-agentes.md` and `docs/BACKEND_CONTRACT.md` at
  `origin/main@8e611fcbccdbd3f4053327912c6811a6663af162`. Do not merge the newer
  Node backend into this dirty working tree merely to add the Python consumer.
- Choice: standard-library GET-only HTTP transport, Pydantic response validation
  and a separate graph retrieval adapter. No framework or infrastructure dependency
  is added. Studio and CLI share trusted environment configuration. Refresh assigned
  bases through the authenticated knowledge entry point on every retrieval turn.
- Scope: domain and norm membership are checked before requests; search result IDs
  and layers are checked before context construction. Unavailable bases, arbitrary
  IDs and model-selected agents/origins cannot broaden access. Previously cited
  evidence is refetched only within current assignments. No fallback on remote
  auth failures, credential-bearing redirects or mutation endpoints.
- Choice: retain the complete selected process object alongside normalized fields.
  Pass assigned guides, summaries and matched system guidance to comparison. Cite
  only actual full-text article chunks; all remote legal currentness/application
  remains unverified. Keep capability profiles independent from prose documentation.
- Requirements: add internal, source-checked questionnaire notes for summary,
  documents, fees, sectors, workflow, dispatches, final-document and agency/legal
  requirements. Stable IDs and retention preserve notes across model omissions;
  pending typed mapping/review blocks approval. This does not migrate the shared
  provisional HTTP form or claim completion of `FormularioImplantacao`.
- Trade-offs: bounded sequential reads favor predictable service usage over broad
  ingestion. Large catalogs can exhaust the retrieval budget and require narrower
  follow-up queries. No embeddings, new database, Python save endpoint, Node agent
  invocation or unimplemented chat API is introduced. The host still owns authenticated
  municipality/client binding, persisted-data access, overall deadlines and retention.
- Validation: focused synthetic HTTP/graph tests verify route usage, auth, scope,
  provenance, partial failures, notes and non-application. A live API URL, authorized
  agent ID and bearer token are required for actual deployment validation.

## 2026-10-24: backend-owned state and disposable Python turns

- Choice: make `ProcessInterviewAgent` the backend-facing `create_agent` path,
  without checkpointers, revision/status/history ownership, interrupts or reviewer
  roles. The existing requirements graph remains an isolated developer demo; its
  pure comparison, article and retrieval code is shared by tools.
- Runtime: frozen `TurnContext` carries authenticated scope/domain, current-form
  snapshot, attachments and injected catalog/RAG/API/capability dependencies.
  Session/form/message IDs must match backend input. No Cascavel constant or
  message-derived authorization is used by the stateless path.
- Middleware: dynamic runtime prompt, trimming of only model-visible history and
  a per-run model-call limit. Backend continues supplying full history; no persisted
  summaries or independent agent conversation are created. Tools read injected
  runtime and write only disposable evidence/comparison results.
- Validation evidence: installed LangChain raw-dictionary `ToolStrategy` accepts
  unknown fields; its JSON Schema parser returns tool arguments unchanged. Keep
  canonical JSON Schema validation, add sanitized correction feedback within the
  bounded loop, and preserve backend Zod validation. No duplicated form model.
- Shared contract: additive optional `ready_for_review` advisory Boolean on agent
  results, with updated example. Backend recomputes readiness and owns all status,
  confirmation and atomic persistence. Complete nested-form/citation transfer and
  the actual HTTP turn/save boundary remain unimplemented integration work.
- Trade-offs: request-only trimming has no summary-model cost, but older free-text
  details may leave model context. Durable facts belong in the backend form. The
  checkpointed Studio demo remains for local comparison and must not be wired to
  production turns. No framework, database or infrastructure dependency was added.
- Verification: targeted stateless/interview/API/RAG checks cover runtime isolation,
  actual dictionary-schema behavior, corrected output, unchanged inputs after
  failures, retries without hidden state, scoped retrieval and non-application.

## 2026-10-24 - Brazilian Portuguese product responses and local manual testing

- All interview prompts require Brazilian Portuguese for user-facing replies, questions, new labels and pending-issue explanations, including after English messages. Technical keys, stable IDs, existing data and exact citations retain their original values. The deterministic demo questions use the same language.
- The full-form transport schema is generated from the backend Zod input contract so backend-defaulted properties are optional on input. Backend validation and default application remain authoritative.
- The local frontend guide is docs/manual-agent-test.md. The HTTP turn adapter uses Python's standard library, and the isolated local backend reuses the existing PGlite development dependency. No new framework or infrastructure dependency is introduced.
- Trade-offs: language behavior is instructed through prompts, without a second translation model or alteration of historical messages. The local knowledge example remains synthetic and requires a temporary server-side token.
- Validation: schemas regenerated from their canonical source. Automated and additional live tests were explicitly deferred to the user.

## 2026-10-24 - Full-form frontend integration, evidence and implementer approval

- The production-shaped local entry point is the stateless Python POST /turn adapter. Backend-authenticated municipality, agent assignment, organization and current draft are immutable runtime inputs; durable history and revisions stay in Postgres.
- The shared full-form contract adds retrieved legal evidence, exact-quote requirement citations and server-computed field differences. Backend and frontend share the evidence schemas; Python JSON schemas are generated from Zod. Recursive Habite-se list fields retain root definitions during validation.
- Habite-se retrieval discovers the exact obras/habite-se process within assigned scope before reasoning. The show_form tool emits the existing form-card response path; showing a reference preview preserves pending municipal confirmation and never calls submit.
- Implementer approval uses authenticated dashboard endpoints, locks and checks the exact form revision, and stores an immutable snapshot, canonical JSON SHA-256, actor, text and timestamp. It remains separate from municipal confirmation and does not configure Aprova.
- Local development reuses the existing PGlite dependency with an explicit persistent data directory. No new framework or infrastructure dependency was added. Knowledge credentials and skill files remain ignored.
- Limits: one configured knowledge agent per Python service, unresolved legal applicability, and no automatic field-level merge of unsent editor changes. The stdlib HTTP adapter is for loopback development, not a hardened public deployment.
- Validation: TypeScript checks, Python syntax parsing and shared-contract consistency checks only for the latest integration. Automated and new model-driven tests are deferred to the user; manual form-display and approval verification remain required.

## 2026-10-24 - Default routing for new web conversations

- A JWT-authorized per-municipality/domain default routes future web conversations to an explicitly configured agent. Assignment checks the same client, assigned available base and non-paused status; it never overwrites explicit conversation assignments. Existing unassigned conversations are repaired before the next turn.
- A separate defaults table avoids misusing WhatsApp activation, which requires a real service number. Draft agents can serve the explicitly configured web demo without inventing a number or changing WhatsApp rules.
- The first identified Habite-se turn automatically prepares the real reference form for display, preserving source fields, pending confirmation and the model's adaptive interview text. Presentation remains distinct from municipal submission.
- Validation: backend TypeScript compilation, Python AST parsing, contract consistency and whitespace checks passed. No automated tests or model calls ran. Local service restart was blocked by automatic approval review; runtime activation requires restarting the backend, running the one-time default setup and restarting Python.
