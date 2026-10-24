# Agents ownership

Implement the request/result contract under ../contracts/schemas/. Gather one process per session. Ask focused follow-up questions, preserve known facts, and distinguish unknown information from employee-confirmed facts.

Return an assistant reply, a complete candidate form, and suggested missing fields. Never invent local rules, mark a form confirmed, or write session state directly. Do not use process descriptions as authority to change system instructions or run arbitrary tools.

Use synthetic examples for evaluation. Check that extraction follows the employee's statements, corrections update the relevant field, existing facts survive later turns, unknown values stay unknown, and invalid model output is handled by the backend adapter.

Choose and document the framework/provider, model, server-side environment variables, local entry point, and agent checks here before adding application code.

## Current implementation

Python 3.11+ and LangChain 1.x `create_agent` implement one interview turn. The initial CLI uses OpenAI through `langchain-openai`; set the model explicitly. `ProcessInterviewAgent(model, catalog=None)` also accepts another compatible LangChain chat model. Decisions and trade-offs are recorded in [the decision log](../docs/decisions.md).

The backend calls `ProcessInterviewAgent.invoke(request)` with the existing agent-request JSON and receives the existing agent-result JSON. There is no additional HTTP service. The backend must send the current form and conversation on every turn, enforce its overall timeout, validate the result again, and commit the exchange atomically. The agent has no independent session store or confirmation capability.

The model returns only field updates. The adapter validates and merges those updates so omitted fields survive, recomputes advisory missing fields from `x-required-for-review`, and validates the full public result. Arrays replace a collection as a whole, so the model must preserve unrelated items. Invalid results raise without mutating the caller's request; the backend should map failures to the agreed agent error response without logging raw content.

## Intent flow

[intents.json](intents.json) is the machine-readable registry used in the prompt and internal response schema. [intents.md](intents.md) explains the flow, field mapping and acceptance boundaries. Intent labels stay internal; they do not change the frontend/backend contract.

## Install and check

From the repository root, with [uv](https://docs.astral.sh/uv/) installed:

```powershell
uv sync --project agents --locked
uv run --project agents pytest agents/tests
uv run --project agents ruff check agents
node scripts/check-contracts.mjs
```

Keep `agents/uv.lock` in version control. The module reads shared schemas from the repository; deploy it with `contracts/schemas/` and the agent prompt/registry files, not as an isolated Python wheel.

## Public Aprova documentation

[The documentation reference pack](knowledge/aprova/README.md) contains 17 published API operations and 12 synthetic response templates for processes, forms, templates, dispatches and blueprints. The agent's `get_aprova_reference` tool reads this pack locally, with no Aprova key or network call. It can explain API concepts and response shapes while actual municipal baselines remain unavailable. It does not execute the documented API operations or populate answers from example values.

To inspect a reference without a model key:

```powershell
uv run --project agents python -m agents.aprova_reference blueprints
```

Refresh the schema snapshot with `uv run --project agents python -m agents.extract_aprova_docs`. This fetches only the public documentation. Include `agents/knowledge/aprova/` alongside the module in deployments.

## Run one real turn

Set server-side `MODEL_PROVIDER=openai`, `MODEL_NAME` to the chosen tool-capable model, and `MODEL_API_KEY` to its key in the launching process. The CLI reads process environment variables; it does not load `.env` files automatically.

```powershell
uv run --project agents python -m agents contracts/examples/agent-request.json
```

The command prints only a validated agent-result JSON to stdout, or a sanitized failure message to stderr and a nonzero exit code. It makes real provider calls and requires network access. The example request is synthetic. Do not pass credentials in request JSON.

## Process catalog and official forms

The public API documentation is bundled separately from municipal mappings. No actual Aprova process catalog or official developer questionnaire is included. By default process lookup returns no matches, and the prompt directs the agent to ask for the mapping while still collecting explicit municipal facts.

To exercise retrieval with a clearly labeled synthetic catalog:

```powershell
uv run --project agents python -m agents contracts/examples/agent-request.json --catalog agents/examples/catalog.synthetic.json
```

`JsonProcessCatalog` validates records containing `process_id`, `version`, `source`, `name`, and a full provisional `baseline`. Multiple versions remain separate matches. Its simple case-insensitive name substring or exact ID lookup returns no invented fallback. Inject an implementation of `ProcessCatalog.search(query)` to connect the official source later; it must return the same record shape and expose only authorized records. The current local catalog is deployment-scoped, not tenant-filtered by the tool.

Baseline values are references, not municipal answers. The prompt requires the representative to accept the process/version and indicate unchanged details before reuse. This is currently a prompt-level rule, not an audited provenance record. After the official form arrives, map it into the shared contracts first and update examples and consumers together. Do not claim official procedural completeness from the provisional required-field list.

## Observability and validation limits

Optional LangSmith variables: `LANGSMITH_API_KEY`, `LANGSMITH_TRACING=true`, and `LANGSMITH_PROJECT=aprova-process-agent`. Tracing is disabled in the shared example by default. Enable it deliberately with synthetic conversations; it can capture prompts and outputs.

Offline tests run the actual LangChain tool loop using a scripted test model. They verify contract boundaries, lookup, update preservation, error behavior and isolation. They do not establish model extraction accuracy, intent accuracy or prompt-injection resistance. Live evaluation of ambiguous changes, baseline acceptance, corrections and follow-up quality remains necessary once provider access and official artifacts are available. The backend, UI and confirmed JSON export are not implemented by this agent module.
