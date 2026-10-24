# Traceable implantation specification

The canonical form is `src/implantacao/formulario.ts`. Shared evidence and approval
structures live in `contracts/implantation-evidence.ts`. Generated agent request
and response JSON schemas must be refreshed with `npm run contracts:agent`.

Additive form collections default to empty for existing records:

- `evidenciasLegais`: full retrieved excerpts, source URL/hash, article, municipality
  binding, retrieval date and currentness/applicability status. Python hydrates
  these from trusted retrieval results, never from invented model metadata.
- `citacoesRequisitos`: requirement, process-relative target path, evidence ID and
  exact quotation. The server verifies the quotation and target. Validation
  remains `pending_human_review`; matching text does not prove legal entailment.
- `alteracoesCampos`: server-computed before/after fields keyed by stable ID.
  Compared to the selected original baseline. Without a new baseline retrieval,
  the previous server-generated diff reconstructs the original field map; older
  drafts without a diff use their current fields as the initial comparison point.

The model returns citations only for evidence actually retrieved or retained in
the backend draft. Existing evidence must be preserved across turns. A legal
origin requires a linked citation; unsupported claims must remain pending.

Human review uses JWT-protected dashboard endpoints:

- `GET /api/v1/forms/:id/approval`: revision and implementer approval history.
- `POST /api/v1/forms/:id/approval`: `{revision, text, approve: true}`. The backend
  verifies client scope, locks the form row and rejects stale revisions with 409.
  The approved JSON snapshot and its SHA-256 digest are stored with actor/time.
- `GET /api/v1/forms/:id/approval/:approvalId`: retrieve that immutable snapshot
  and digest. Hash input recursively sorts object keys and preserves array order.

Approval records an implementer's review of an exact revision. It does not change
the municipality's confirmation status, apply anything in Aprova or certify law.
Municipal `/submit` remains a separate action. New revisions invalidate the
currency of old approvals without deleting their audit history.

The frontend can download the current JSON and inspect legal evidence. Credentials
and approval authority never enter the model or browser knowledge API configuration.
