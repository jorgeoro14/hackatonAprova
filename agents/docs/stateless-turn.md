# Backend-owned interview turns

`ProcessInterviewAgent` is the backend-facing agent. One `invoke` performs one
disposable turn with `create_agent`, `context_schema=TurnContext`, runtime-aware
tools, dynamic prompts and middleware. It has no checkpointer, independent session
store, revision/status transitions, interrupts or reviewer-role approval flow.

| Layer | Owns |
| --- | --- |
| Hosting backend/Postgres | Official messages, form, revision, status, confirmation, attachment ownership, municipality authorization and atomic commit |
| Frozen runtime context | Session ID, authorized scope/domain, immutable current-form snapshot, attachment references, catalog/RAG/API dependencies and capabilities |
| Disposable state | Incoming messages plus the current tool loop, candidates/evidence, comparison output and per-run model-call counters |
| Middleware | Dynamic prompt, request-only history trimming, schema correction feedback and model-call limit |

State messages are a temporary execution copy of backend input. A failure raises
without mutating input; retrying starts from the backend snapshot again. The backend
serializes turns, enforces its overall deadline, validates with Zod/schema checks,
and atomically commits both messages and the form. No Python `/turn` HTTP handler
or form-save endpoint is introduced by this adapter.

## Backend usage

Construct context from authenticated backend records, never a model or chat message:

```python
from agents.interview import ProcessInterviewAgent, TurnContext
from agents.app.rag.schemas import CorpusScope
from agents.app.requirements.config import knowledge_from_environment

scope = CorpusScope.model_validate(authorized_scope)
context = TurnContext.from_request(
    request,
    municipality=scope,
    domain=authorized_domain,
    knowledge_source=knowledge_from_environment(scope),
    catalog=authorized_catalog,
    municipal_rag=authorized_rag,
    capabilities=verified_builder_capabilities,
    attachments=authorized_attachment_references,
)
result = ProcessInterviewAgent(model).invoke(request, context=context)
# Backend validates, recomputes readiness and commits transactionally.
```

Context is frozen; its current-form property returns a fresh copy. Session, form
and message IDs must match the request. Retrieval dependencies must match runtime
municipality and any server-pinned domain. API origin, token and agent ID are not
model arguments. The knowledge response does not identify the municipality: the
backend must authenticate the agent/client/session binding. Existing `invoke(request)`
callers remain compatible with explicitly constructor-injected local services.

The CLI accepts `--scope` (trusted `CorpusScope` JSON), `--domain` and `--capabilities`.
Remote API settings require an authorized scope; this path does not hardcode Cascavel.

```powershell
uv run --env-file .env --project agents --all-extras python -m agents request.json --scope authorized-scope.json --domain obras
```

## Retrieval, comparison and output

Local catalog and RAG tools read `ToolRuntime.context`. `retrieve_process_knowledge`
refreshes assigned API bases and loads full baselines, guidance and law articles into
disposable state. `compare_requirements` reuses the pure deterministic validator:
the model supplies proposals; baseline/evidence/capabilities/actual representative
quotes come from runtime/tool state. There is no nested comparison model call.
The [API guide](knowledge-api.md) documents read routes and scope enforcement.

The shared provisional transport still cannot persist the complete nested
`FormularioImplantacao`, structured citations or questionnaire notes. Tools can
ground the reply and expose mapping gaps; they cannot place nested requirements in
unrelated form fields. Complete structured transfer still requires the coordinated
form-contract migration. The separate developer demo can export its richer internal
`Specification`; it is not the backend's current HTTP form payload.

`ready_for_review` is an optional Boolean hint for the provisional candidate,
derived from missing fields and current retrieval/comparison blockers. The backend
recomputes readiness. The hint never sets status, increments a revision, confirms
a form, certifies legislation or establishes whole-questionnaire completion.

## Model context and validation

`@dynamic_prompt` loads the current form/authorized metadata from runtime. Incoming
history becomes real human/assistant messages with stable IDs, without inserting
the snapshot as a human message. Snapshot values remain data, not instructions.

Only middleware trims history: a default 6,000 approximate-token budget retains
recent complete backend messages and active tool-call/result pairs. Full input is
unchanged and remains available for quote checks. An oversized latest message fails
explicitly. There is no summary LLM call or persisted summary. Older unstructured
details can be omitted from model context; collected facts must remain in the form.

`ModelCallLimitMiddleware(run_limit=6, exit_behavior="error")` bounds calls and
correction attempts per invocation, without a thread limit or checkpointer. Provider
timeouts and the backend's overall deadline remain independent responsibilities.

The installed LangChain 1.4 raw-dictionary `ToolStrategy` parsing branch returns
arguments without JSON Schema validation. A regression test demonstrates acceptance
of an unknown field. Consequently canonical `Draft202012Validator` checks remain:
middleware returns sanitized correction feedback through the bounded loop, then
the adapter and backend independently validate their boundaries. No divergent
Pydantic copy of the public form is introduced.

## Developer demo and verification

`app/requirements/workflow.py`, its SQLite CLI and the current `requirements` Studio
registration remain isolated demonstrations of the earlier checkpointed interview.
Their history and review interrupts are not used by the backend turn adapter. Do
not route production `/turn` requests to that graph. Its normalization, scoped API
retrieval, article helpers and pure comparison validator are reused by the tools.

```powershell
uv run --project agents --all-extras pytest agents/tests/test_stateless_turn.py agents/tests/test_interview.py agents/tests/test_knowledge_api.py -q
node scripts/check-contracts.mjs
```

Checks cover schema correction, hidden scope arguments, runtime isolation, history
trimming, failure/retry isolation and API comparison. They establish mechanics,
not legal validity or model extraction quality. Official patterns:
[runtime context](https://docs.langchain.com/oss/python/langchain/runtime),
[middleware](https://docs.langchain.com/oss/python/langchain/middleware/custom) and
[call limits](https://docs.langchain.com/oss/python/langchain/middleware/built-in#model-call-limit).
