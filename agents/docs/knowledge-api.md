# Requirements agent: remote knowledge

The backend-facing [stateless turn agent](stateless-turn.md) consumes the Node
knowledge API through runtime-aware retrieval/comparison tools. The standalone
`requirements` graph also uses the adapter as a legacy developer demo, outside
the backend turn path. The read routes and response shapes were inspected at
`origin/main@8e611fcbccdbd3f4053327912c6811a6663af162`. The current working branch
contains older handlers; this integration does not merge the newer Node backend.
See the [consumer boundary](../../contracts/knowledge-api.md).

## Server settings

Set these in the ignored repository-root `.env`, with a real authorized agent and
a dashboard bearer token. Keep the token out of chat, browser state and Git.

```dotenv
KNOWLEDGE_API_BASE_URL=https://your-knowledge-api.example
KNOWLEDGE_API_TOKEN=
KNOWLEDGE_AGENT_ID=
# Optional: restrict process candidates to an assigned available domain.
KNOWLEDGE_DOMAIN_ID=
```

Use the origin without `/api/v1`. HTTP is accepted only for loopback development,
such as `http://127.0.0.1:3333`. The URL, token and agent ID must be configured
together; partial configuration fails startup. With all settings absent the
existing local flow remains available. Once remote mode is configured, failures
never switch to an unauthenticated or local source. The synthetic demo remains
explicitly local and ignores these settings.

The backend injects each session's authorized `CorpusScope` through `TurnContext`;
the stateless agent does not hardcode Cascavel or infer scope from chat. The knowledge response
contains an agent ID and assigned bases, **not the client's municipality**. The
hosting backend must authenticate ownership and bind the correct agent/client to
the session scope. It must create a separate trusted dependency binding for other agents
or municipalities; interview input cannot select an arbitrary agent or API origin.

For stateless turns use `python -m agents request.json --scope authorized-scope.json`
with the environment loaded, or inject `TurnContext` from the hosting backend.

The following Studio instructions apply only to the legacy checkpointed demo.
Its Cascavel fixture does not define the backend turn runtime. Restart that server
after changing settings:

```powershell
uv run --project agents --all-extras langgraph dev --config langgraph.json --no-browser --host 127.0.0.1 --port 2024
```

Select `requirements` in
[Studio](https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024).
The existing [live input](../examples/requirements/studio-input.live.json) starts
an interview. When asked to select a baseline, use the returned candidate's
`template_id` in the interrupt reply:

```json
{
  "message": "Use this reference process as our starting point.",
  "selected_template_id": "copy_the_returned_template_id_here",
  "answered_question_keys": ["select_template"],
  "actor_role": "municipal_representative"
}
```

Template IDs are stable hashes of domain/process pairs, preventing collisions
between domains. `knowledge_context.process_candidates` also retains original
domain/process IDs. The municipal representative must select the baseline; a
search hit is not acceptance. Plain text remains valid for normal interview replies.

The local SQLite CLI uses the same environment adapter. Load `.env` with
`uv run --env-file .env --project agents --all-extras python -m agents.scripts.run_requirements ...`.
It has separate checkpoint storage from Studio.

## Retrieval and evidence

`app/knowledge/api.py` owns GET-only transport and validates upstream response
shapes. `app/requirements/remote.py` prepares graph retrieval context. Both are
independent of the LLM and accept an injected transport for deterministic testing.

Every retrieval turn first calls the authenticated agent knowledge endpoint.
Unavailable bases are excluded. Every domain query checks the assigned base; norm
IDs must occur in that base's assigned summaries. Process IDs must first appear
in that domain's process listing. System document IDs must first be discovered
through `/sistema`. All three search layers are explicit and use `limite=5`.
Returned sources and layers are checked before any snippet reaches model state.
An optional process-domain restriction retains legal guidance from all available
assigned bases, including automatic cross-cutting bases.

The graph retrieves matching system documents and full process candidates, then
fetches full text for search-matched, baseline-linked or previously cited assigned
norms. The entire selected process object is retained, including workflow,
documents, fees, dispatches and final-document configuration when supplied.
Only its field block is normalized into the existing internal `Template`.
The same normalization is shared with the local catalog. Synthetic baselines
remain excluded unless `REQUIREMENTS_ALLOW_SYNTHETIC=true` is deliberately enabled.

Full norm text is split using the existing article-span and paragraph-boundary
helpers. Related paragraphs/incisos remain with their article where possible;
large articles are split into bounded parts. Chunks carry stable content/offset
IDs, original norm/base IDs, article, jurisdiction, official source URL, retrieval
URL and retrieval date. Repeated article numbers are excluded from automatic
evidence because amendments/quotations need review. Missing article text or a
missing/invalid official URL produces a blocker, never a fabricated citation.
Summaries, relevance prose, guides and search snippets cannot establish legal
requirements. No embeddings are generated.

API evidence always has unverified currentness and applicability. `verified_at`
records retrieval date, not legal certification. Municipal binding is the target
session scope, not proof that every retrieved law is a municipal requirement.
System prose also does not certify a builder mapping; the separately reviewed
capability profile remains authoritative.

Retrieval has a 20-second cooperative deadline, a maximum of 24 HTTP calls,
5-second individual request timeouts and a 4 MB response limit. It fetches at most
two matched system documents and four relevant full norms, keeping up to four
relevant article parts per norm. Budget limits and missing sources become visible
blockers. The backend must still enforce its overall turn deadline. Large assigned
catalogs may require narrower follow-up queries. There are no automatic retries
or redirects, and HTTP errors do not retain upstream response bodies or credentials.

Assignments are refreshed per turn; old citations are refetched only while their
base/norm remains assigned. A removed base does not remain reachable through
checkpointed authorization. Article content changes invalidate earlier chunk IDs.
The backend must additionally authorize access to persisted conversations/exports
and enforce retention; this client is not a production session access-control layer.

## Requirements output and save boundary

The comparison receives assigned guides, legal summaries, system guidance and the
full selected process through `knowledge_context`. Its closed field-change actions
remain unchanged. Additional questionnaire requirements are captured in
`requirement_notes`, with `target_path`, requirement, origin, statement/article
citations, stable requirement ID and pending mapping/review. Municipal claims
require an actual representative message/quote; legal claims require a retrieved
article/quote. Operational suggestions remain suggestions. Missing facts become
questions rather than guessed values. Notes persist across later model omissions;
conflicting/corrected historical notes need implementer reconciliation.

The JSON/report export includes that context, the baseline, field preview and
captured notes. Notes block approval until their full typed form mapping is
implemented; approval of the narrower field proposal cannot imply whole-questionnaire
completion. The current internal output still declares `applicant_form_changes`
and `implementation_questionnaire_completed=false`.

There is **no HTTP write** from this adapter. `/implantacoes` would invoke a
different Node agent, `/api/v1/chat/...` is unimplemented, and no Python form-save
route exists. This increment prepares requirements for a future agreed integration
without inventing a working endpoint or claiming vendor payload compatibility.

## Verification

The [synthetic response fixture](../examples/requirements/knowledge-api.synthetic.json)
is marked as test-only throughout. Focused checks:

```powershell
uv run --project agents --all-extras pytest agents/tests/test_knowledge_api.py agents/tests/test_requirements.py -q
uv run --project agents --all-extras ruff check agents
```

These checks cover scope enforcement, transport authentication/errors, article
provenance, baseline preservation, requirements notes, approvals and exports.
They do not establish live deployment reachability, legal validity, vendor builder
compatibility or model extraction quality on actual municipal conversations.
