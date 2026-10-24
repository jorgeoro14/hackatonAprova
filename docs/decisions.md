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
