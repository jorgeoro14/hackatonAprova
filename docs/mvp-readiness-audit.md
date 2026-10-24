# MVP readiness audit

Reviewed on 2026-10-24 against fetched `origin/main` commit
`c831fba` (Merge pull request #10). The local `main` branch is stale; this audit
uses the remote-tracking branch. This is a static source audit, not an executed
end-to-end validation. No tests or new agent conversations were run.

## Conclusion

Main has the frontend/backend form lifecycle and read-only knowledge API. It has
no `agents/` Python implementation or `knowledge_base/` curated Cascavel corpus.
Those components exist in the feature branch/local working tree; the stateless
HTTP adapter and several integration fixes are still uncommitted. An integration
demo with the synthetic reference model is closer than the requested demo with a
real Aprova template, article-verifiable persisted output and implementer text approval.

## Requested capabilities

| Step | Main | Feature/local work | Remaining acceptance requirement |
|---|---|---|---|
| 2. Select a real Aprova template | Real process catalog has names/descriptions. Only one complete process baseline, LAP, is marked `exemplo: true`. | Template discovery, selection and synthetic opt-in exist. | Obtain one authorized real full template with stable IDs, source/version and fields/workflow; normalize and validate it. Catalog names are insufficient. |
| 3. Consult related laws | Assigned-base knowledge, full norm text and domain-scoped search endpoints exist; federal texts and summaries are available. | Read-only API retrieval loads assignments first and filters results to scope. Curated Cascavel sources also exist outside main. | Forward trusted assignment/scope from backend; configure server credentials; select actual relevant articles. Record absent municipal/state coverage. |
| 4. Compare existing and changed fields | Canonical process/form Zod schemas exist. Main has no reasoning/comparison agent. | Field comparison validates IDs, operations, representative quotes and legal evidence when called. | Establish the allowed operation/type profile and enforce validated comparison results on the full-form return path. Currently invoking comparison is model-dependent. |
| 5. Ask specific missing questions | Chat transport and pending-issue rendering exist. | Adaptive interview prompts/tools exist. | Integrate the stateless Python entry point and manually verify targeted questions. Do not use the interrupt-based Studio demo as the frontend service. |
| 6. Understand corrections | Backend forwards history and the current open form. | Prompt and legacy comparison logic preserve explicit changes/corrections. | Enforce preservation of unrelated fields, return a stable before/after diff and manually exercise corrections across turns. Shape validation alone does not establish correct extraction. |
| 7. JSON with verifiable references | Full form supports law IDs, local law URLs and generic origin notes. It lacks typed per-requirement article quotations/source hashes. | Article evidence and exact-quote validation exist in the narrower comparison schema. | Extend the canonical persisted contract with structured evidence and field-to-citation links; validate against retrieved text and retain them through save, GET and export. |
| 8. Natural-language specification | Chat can display `assistant_reply` and an editable full form. | Portuguese generation instructions exist. | Produce the summary from the same validated candidate/diff as the JSON, including remaining issues and source references. |
| 9. Implementer textual confirmation | Municipality `/submit` confirms a form; dashboard status endpoints only advance workflow. | Legacy Studio reviewer interrupts exist, outside the production turn path. | Define an authenticated implementer approval action tied to a revision/digest. Record exact approval text, actor and time. Reject stale approvals; the LLM cannot change confirmation status. |
| 10. Persist/recover session | SQL-backed messages, form JSON/revisions, confirmation timestamps, identify/history/form routes and dashboard reads exist. | Isolated file-backed local PGlite startup exists. | Integrate Python without a second history store. Use persistent storage for restart demonstrations. Main's `demo:local` database is in memory and its default agent is fake. |

## Concrete integration gaps

1. Main's `PedidoAgente` does not carry the assigned `agent_id`, municipality
   UUID, organization metadata or message IDs. The local adapter requires trusted
   assignment and municipality UUID to enable API knowledge. Pointing unchanged
   main at port 8000 does not automatically enable retrieval.
2. Main's fake agent recreates the example model each turn and becomes ready on
   a fixed turn count. It does not demonstrate law retrieval, correction handling
   or authentic template selection. `DEMO_AGENTE_REAL=1` only switches the HTTP client.
3. The legacy Studio graph returns `applicant_form_changes` and waits on
   interrupts. The current full-form HTTP adapter returns `assistant_reply`,
   `form`, `pendencias`, `pronto_para_revisao`. They are different interfaces.
4. The form card appears only when a valid non-null form is returned with
   `pronto_para_revisao: true`. A persisted draft with false remains a text response.
5. Main retains previous pending issues when the returned list is empty. Local
   changes fix replacement semantics and refresh cached form cards after chat turns.
6. Main persists the user's message before the agent call and deduplicates certain
   text retries. Local changes instead persist user/assistant/form together after
   success. Preserve an explicit, agreed failure/retry policy when integrating.
7. The local Python service currently binds API knowledge to one configured agent
   ID. This is sufficient for a fixed demo after assignment, not a general
   multi-agent deployment resolver.

## Smallest implementation order

1. **One integration path:** bring the reviewed stateless `/turn` implementation
   and compatible backend/frontend changes onto current main without losing
   main's recent changes. Preserve Postgres as the owner of durable state.
2. **One authentic process:** ingest a complete authorized Aprova template with
   provenance. Keep the synthetic baseline explicitly separate. Choose the demo
   process based on the real template and legal sources actually available.
3. **One scoped knowledge connection:** assign the demo conversation's agent,
   configure server-only credentials and retrieve the process plus cited articles.
   Use explicit failure responses rather than silently falling back to examples.
4. **One validated specification:** finalize structured citation/diff support in
   the canonical Zod contract first, then generate Python schemas and update
   persistence, consumers and examples. Ground legal claims in retrieved articles;
   keep operational suggestions and municipal requests distinct.
5. **One human approval path:** retain municipal submit and add the requested
   authenticated implementer textual approval without conflating their roles.
6. **One reproducible manual script:** select a real baseline, change a field,
   answer a targeted question, correct the answer, inspect JSON and explanation,
   approve an exact revision, reload and recover the persisted result. Include
   an unsupported-law case and a stale approval case. The user executes this.

## Demo claims and limits

- A catalog captured from Aprova is real catalog data, but not a full template.
- A valid JSON form is not evidence that its legal requirements are supported.
- A retrieved legal article is checkable evidence, not proof of currentness or
  applicability to Cascavel. Missing applicable local norms remain explicit gaps.
- A chat message saying approval was received is not persisted authorization.
- An in-memory demo can show session recovery while running, but cannot prove
  recovery after restarting the backend.

Primary main sources: `src/agente/cliente.ts`, `src/chat/rotas.ts`,
`src/implantacao/formulario.ts`, `src/formularios/repositorio.ts`,
`src/bases/rotas.ts`, `src/app.ts`, `scripts/demo-local.ts`,
`test/apoio/agente-falso.ts`, `knowledge/README.md`,
`knowledge/referencia/ambiente-modelo/catalogo.json`,
`knowledge/dominios/meio-ambiente/processos/licenca-ambiental-previa.json`.
