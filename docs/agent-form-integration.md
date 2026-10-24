# Agent API and frontend form integration

This describes the current full-form HTTP path. The older provisional Python
adapter and checkpointed requirements demo are separate development entry points.

## Request and retrieval

`src/chat/rotas.ts` authenticates the session and calls `POST {AGENT_URL}/turn`.
It supplies the complete history, current open form or null, domain, municipality,
organization and attachment metadata. Only TXT/CSV attachments include extracted
text. It also supplies trusted `municipio_id` and the conversation's assigned
`agent_id`; neither is selected by the model.

`agents/app/server.py` uses the implantation contract, not the provisional
`updates` response. It injects the received form and organization into immutable
runtime context. The graph has no checkpointer or independent conversation store.

API knowledge retrieval requires all of the following:

- The backend supplies `municipio_id` and an assigned `agent_id`.
- Python has server-side `KNOWLEDGE_API_BASE_URL`, `KNOWLEDGE_API_TOKEN` and
  `KNOWLEDGE_AGENT_ID`; the configured agent ID matches the conversation assignment.
- The token can read that agent's knowledge and the domain is in its available bases.
- Synthetic baselines require explicit `REQUIREMENTS_ALLOW_SYNTHETIC=true`.

Otherwise the tool returns unavailable knowledge, rather than using a different
agent's bases. A single configured Python service currently enables API knowledge
for one configured agent ID. Multiple assigned agents require a server-side
credential/configuration resolver; changing message text cannot enable access.

The read-only adapter loads `/api/v1/agents/:id/knowledge` first, then authorized
domain processes, system documentation, scoped search results and relevant full
norm text. Bearer authentication is used for `/api/v1` knowledge routes. Search
results are filtered against assigned bases and discovered IDs. Retrieved
baseline values are proposals; legal currentness and applicability remain unverified.
For Habite-se in `obras`, the HTTP adapter prefetches the exact process ID before
model reasoning. `retrieve_process_knowledge(process_id="habite-se")` also supports
exact lookup without search ranking. Both paths enforce the assigned domain and
process discovery. Full process previews are supplied before selection; only
explicit selection sets the accepted comparison baseline.

## Response and display

The Python result uses `assistant_reply`, `form`, `pendencias` and
`pronto_para_revisao`. JSON schemas are generated from the canonical backend Zod
input schemas; Zod applies defaults and performs its additional runtime validation.
The form now also persists retrieved `evidenciasLegais`, `citacoesRequisitos` and
server-computed `alteracoesCampos`; see [the specification contract](../contracts/implantation-specification.md).
The Python output guard rejects citations without retrieved evidence, inexact
quotes, duplicate field IDs and legal origins without a linked citation. This
checks provenance, not legal entailment or currentness.

The backend persists the draft revision, assigns its actual ID/status, and creates
the dashboard representation. An explicit `pendencias: []` clears earlier issues.
The top-level list is authoritative; the agent must keep it consistent with the
form's pending list. Paths are relative to `processo`.

Only a non-null valid form with `pronto_para_revisao: true` produces a message
with `kind: "form"` and `formularioId`, and moves the conversation to
`waiting_confirmation`. A draft can be persisted while the readiness flag is
false without appearing as a chat form card. Readiness allows human review; it
does not approve or submit the form.
The agent's `show_form` tool explicitly requests that presentation. It prepares
the current backend draft or a single authorized retrieved process as an editable
preview, preserving nested fields and labeling reference defaults as pending.
The output middleware supplies the prepared form if the model returns null and
sets the readiness flag. This avoids relying on a prose promise to show a form.
The frontend owns the GET; the agent never calls the browser or `/submit`.

`MessageBubble.tsx` renders the form card, which calls
`GET /api/v1/chat/sessions/:sessionId/forms/:formId` with `X-Session-Token`.
Successful chat turns invalidate cached forms. Untouched editors adopt refreshed
server data; unsent manual edits are preserved. If editing manually while also
requesting chat changes, reconcile those edits before submission; there is no
field-level automatic conflict merge.

Only the explicit frontend confirmation action calls `/submit` with the revised
`orgao` and `processo`. Python never calls that endpoint or the Node
`/implantacoes` agent.
JWT-protected implementer text approval is a separate revision-bound dashboard
action. It stores an immutable snapshot without changing municipal confirmation.
The manual end-to-end sequence is in [the Habite-se demonstration guide](habite-se-demo.md).

## Manual inspection

Follow [the startup guide](manual-agent-test.md), then open browser Developer Tools
and the Network panel. Do not share screenshots containing session tokens.

1. Send a request to identify a reference process and explicitly choose a candidate.
2. Ask the agent to show the draft for review without confirming it.
3. Inspect the successful chat message POST response: `agentMessage.kind` must be
   `form`, and `agentMessage.formularioId` must be present.
4. Check the subsequent forms GET returns HTTP 200 and the expected nested
   `orgao`/`processo` with status `em_revisao`.
5. Request a correction through chat. An untouched open card should refresh.
6. Inspect missing-information paths, then reload to verify persisted data.

If the message remains `kind: "text"`, the backend did not receive a display-ready
form. If the message is `form` but GET fails, inspect session authorization and
the returned form ID. A 502/504 on message submission points to the agent service,
response contract or deadline; it is not a form-card rendering problem.

This review was static. No tests, provider calls or new chat turns were executed.
