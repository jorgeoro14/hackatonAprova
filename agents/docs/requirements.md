# Requirements discovery graph

This P0 workflow turns a supplied municipal request and process input-form baseline
into a validated, reviewable change specification. It uses LangGraph, Python and
Pydantic, with read-only template and law retrieval. The existing
`ProcessInterviewAgent` HTTP adapter and `contracts/` remain unchanged.

## Components and behavior

```mermaid
flowchart LR
  A[Identify process and mode] --> B[Retrieve supplied baseline and law articles]
  B --> C[Compare requirements and detect gaps]
  C --> D[Build specification preview]
  D -->|Missing answers| E[Pause for interview reply]
  E --> A
  D -->|Reviewable proposal| F[Pause for implementer review]
  F -->|Revision requested| A
  F -->|Approved or rejected| G[JSON and report; not applied]
```

`app/requirements/schemas.py` defines the internal `Specification`, changes,
citations, questions and review decisions. `AgentState` retains messages, selected
baseline/version, retrieved evidence, answered question keys, tracked changes,
pending issues, revision history and the current specification. Checkpointers
retain earlier snapshots; revision history also records specification digests.

`analyze_requirements(template=..., legal_context=..., user_request=..., ...)`
is the comparison entry point. Its output contains suggested changes, missing
information, actual retrieved legal references, conflicts and next questions.
The model proposes a complete revision; deterministic checks verify references,
exact quotes, field targets, type taxonomy and condition dependencies. A tracked
change cannot disappear without a recorded withdrawal. Answers may arrive out
of order. Answered semantic question keys are filtered from later questions.

The closed actions are `add_field`, `update_field`, `remove_field`, `set_required`
and `add_condition`. Existing IDs survive label edits. Conditions name a dependency,
operator, value and required/visible effect; missing references, self references,
cycles and unsupported Boolean/selection comparisons block approval. Removal also
needs an explicit dependency audit of existing rules/workflow/document references.

Origins remain distinct:

- `municipality_request`: quote and message ID from a municipal representative.
- `legal_requirement`: exact quote and ID of a retrieved provision; legal validation
  stays pending until a separate implementer checks support and verified applicability.
- `operational_suggestion`: design choice, not a legal requirement or employee answer.
- Missing information: pending questions/blockers, with no invented answers or defaults.

Human input can select use-existing, adaptation or new-form mode. A real baseline
is never selected silently. The normalized `Template` represents the input-form
field block, not an Aprova HTML document template or a submitted citizen process.
`load_team_models()` preserves source IDs, content-hash version and `exemplo` flag.
It reads the canonical field types from `src/knowledge/schemas.ts`; it does not
duplicate or certify the full `ProcessoModelo`/`FormularioImplantacao` envelope.

## Retrieval and current limitations

`search_templates()` searches injected authorized baselines; synthetic models are
excluded unless explicitly enabled. The current team environmental model is an
example, not a retrieved live municipal Aprova form. Public Aprova API templates
describe response shapes and capabilities but do not supply authenticated baselines
or verify the complete builder field taxonomy. `Capabilities` defaults to pending;
an implementer must supply a source-backed mapping before real approval.

`CuratedLawSearch.search_laws()` reads the Cascavel article BM25 index and returns
provenance-rich evidence. It reports the municipal coverage gap as a blocker.
It currently uses lexical retrieval; semantic vectors and hybrid fusion have not
been generated. A future vector/hybrid retriever can implement `LawSearch` without
changing the comparison node. See [the corpus report](../../knowledge_base/reports/collection_report.md).

The Council-hosted Organic Law consolidation dates from 2023; local process codes,
decrees and amendment coverage remain unresolved. Federal act-level effectiveness
does not establish every provision's municipal applicability. In this collected
corpus, applicability stays unverified/conditional, so legal proposals cannot be
approved merely by selecting their citations.

The first release captures form fields and conditions. Documents, fees, dispatches,
signatures and complete workflow parameterization still need coordinated output
contract/mapping work; they must not be disguised as supported field actions.
No frontend/backend integration or Aprova mutation is implemented here.

## Test in LangGraph Studio

The default [root configuration](../../langgraph.json) registers graph `requirements`
with a deterministic **synthetic** interview and no model calls. The graph uses the
real collected law index and preserves its coverage blocker. Agent Server supplies
checkpointing; the graph factory does not attach a second SQLite saver.

From the repository root:

```powershell
uv sync --project agents --extra rag --extra requirements --extra studio
uv run --project agents --extra rag --extra requirements --extra studio langgraph dev --config langgraph.json --no-browser
```

Open [Studio connected to localhost](https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024)
or [local API documentation](http://127.0.0.1:2024/docs). Studio may ask you to sign
in to LangSmith; the local synthetic graph itself needs no model API key.

1. Select `requirements` and create a new thread.
2. Paste [studio-input.synthetic.json](../examples/requirements/studio-input.synthetic.json)
   into the graph's JSON input and run. The graph pauses at `interview`.
3. In the interrupt resume control, use
   [studio-resume.synthetic.json](../examples/requirements/studio-resume.synthetic.json).
   With the server API, send this object as `command.resume` on the **same thread**;
   do not send a new initial input. The graph proposes an optional contact email
   and pauses at `review` with revision 2.
4. Inspect `specification`, `analysis`, `legal_context` and `history`. The municipal
   coverage blocker deliberately prevents approval of this real-law-backed demo.

Example server resume payload for an interview:

```json
{
  "assistant_id": "requirements",
  "command": {
    "resume": {
      "message": "Add an optional email field.",
      "answered_question_keys": ["contact_channel"],
      "actor_role": "municipal_representative"
    }
  }
}
```

To test a live model, set the existing `MODEL_PROVIDER=openai`, explicit `MODEL_NAME`
and `MODEL_API_KEY` in the local root `.env` (never request/paste credentials in chat).
Optionally set `REQUIREMENTS_CAPABILITIES_PATH` to a verified profile;
`REQUIREMENTS_ALLOW_SYNTHETIC=true` only enables the marked team examples.
Use the separate [live configuration](../../langgraph.live.json):

```powershell
uv run --project agents --extra rag --extra requirements --extra studio langgraph dev --config langgraph.live.json --no-browser
```

Stop the demo server before starting another server on port 2024. The dev server
is a local debugging surface, not the production HTTP adapter or an authenticated
review service. Use synthetic interviews here. The hosting backend must own actor
authentication, reviewer roles, municipality authorization, thread IDs, turn
serialization, retention and atomic form integration before exposing this workflow.

Configuration follows the official [local-server guide](https://docs.langchain.com/oss/python/langgraph/local-server),
[interrupts guide](https://docs.langchain.com/oss/python/langgraph/interrupts) and
[persistence guide](https://docs.langchain.com/oss/python/langgraph/persistence).

## Local CLI and durable session resume

This alternative uses SQLite under ignored `agents/.local/`, with strict checkpoint
deserialization. It is independent of Studio's development storage.

```powershell
uv run --project agents --extra requirements python -m agents.scripts.run_requirements --demo --thread demo-1 --start "We need a way to contact applicants."
uv run --project agents --extra requirements python -m agents.scripts.run_requirements --demo --thread demo-1 --reply-json agents/examples/requirements/reply.synthetic.json --export agents/.local/demo-1
uv run --project agents --extra requirements python -m agents.scripts.run_requirements --demo --thread demo-1 --status
```

Exports are `specification.json` and `report.md`. Both retain pending information
and mark the application status `not_applied`. To begin a different interview,
use a new server-owned thread ID; an existing thread cannot be restarted silently.

Review is a separate trusted call, never a model output or a representative chat
message. Resume `review` with a `ReviewDecision` and authenticated implementer role.
Approval requires the exact revision and specification digest, all change IDs,
explicit semantic verification of cited chunks, verified currentness/applicability,
verified platform mapping and zero unresolved blockers. Revisions produce a new
digest. Feedback must explicitly withdraw/replace any earlier captured changes.
Approval records a specification; there is no API action that applies it.

## Validation

```powershell
uv run --project agents --extra rag --extra requirements --extra studio pytest agents/tests
uv run --project agents ruff check agents
uv run --project agents ruff format --check agents
node scripts/check-contracts.mjs
```

The offline scenarios cover quote provenance, absent/revoked/unverified laws,
municipality isolation, unsupported types, stable IDs, conditions, retained requests,
answered questions, strict JSON, partial/stale/unauthorized approvals, role separation,
revisions and SQLite restart recovery. They validate the workflow boundaries;
live model quality and vendor mapping are not established by deterministic tests.
