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
