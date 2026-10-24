# Habite-se manual demonstration

This flow uses the stateless Python HTTP adapter on port 8000. The interrupt-based
Studio `requirements` graph on port 2024 is a separate developer demo.

## Prepare after the template upload

The uploaded real baseline is now available at
`GET /dominios/obras/processos/habite-se`. The HTTP adapter prefetches it for
Habite-se requests in the authorized `obras` domain. Retrieval loads assigned
knowledge first and discovers the process ID before the exact GET. The candidate
is shown before municipal acceptance; reading it does not accept its defaults.
Nested lists, visibility conditions and conditional mandatory fields are retained.

1. Verify the uploaded file contains the real process fields and workflow, original
   IDs, source/version and provenance. A catalog entry with a name is insufficient.
   Do not remove an `exemplo` marker merely to bypass synthetic filtering.
2. Check the process domain actually used by the upload in `knowledge/dominios/`.
   The conversation's department must resolve to that same domain. The helper's
   `--domain` value must match it. Do not assume that every construction-related
   model is stored under `obras`.
3. Start the persistent local backend with `npm run dev:local`. Restarting this
   entry point applies the new approval-table migration to its isolated database.
   For a deployed Postgres database, apply the migration through the team's normal
   migration workflow before using approval endpoints.
4. Register a dedicated fictional Cascavel contact through the frontend. Keep its
   conversation separate from the previous LAP demonstration to avoid changing
   process identity halfway through an interview.
5. With the backend running, configure the municipality's default once:

   ```powershell
   uv run --env-file .env --project agents --all-extras python -m agents.scripts.prepare_frontend_test --domain obras --default-only
   ```

   Future Obras conversations inherit this explicit default automatically; no
   session ID copying or per-phone setup is required. Existing unassigned Obras
   conversations are repaired on their next message. Explicit assignments stay
   unchanged. Omit `--allow-synthetic` for the real-template demo.
   The helper stores a temporary server token in ignored `agents/.local/`; it
   does not print credentials. Backend agent assignment remains authenticated.
   Use an Obras conversation; an existing Meio Ambiente conversation keeps its
   own domain and must not silently gain access to Obras through message text.
6. Start/restart Python using the connection file:

   ```powershell
   uv run --env-file .env --project agents --all-extras python -m agents.app.server --knowledge-connection agents/.local/frontend-connection.json
   ```

7. Start the frontend with mocks disabled as in [the local startup guide](manual-agent-test.md).
   Open <http://127.0.0.1:5173/chat>.

## Conversation and expected observations

1. `Quero adaptar o modelo real de Habite-se para Cascavel, PR. Consulte os modelos disponíveis e apresente a origem do modelo antes de iniciar.`
   The agent must retrieve an available candidate or explicitly report its absence.
2. The first identified Habite-se turn displays the actual template as an editable
   draft. Its values remain reference proposals with pending municipal review.
   Do not accept a substituted LAP.
3. `Compare os campos existentes com as necessidades informadas. Consulte as normas disponíveis e diferencie exigências comprovadas, sugestões e informações ainda não validadas.`
4. Answer a focused question using fictional operational information. For an
   existing nonessential field, request a label change; then correct that label in
   a later message. Preserve IDs and all unrelated fields. Do not invent a law,
   municipal fee or deadline merely to make the form appear complete.
5. `Mostre a especificação para revisão, com as alterações, os artigos citados e as pendências. Ainda não confirmo o envio.`
   Expect a form card and the expandable specification/evidence section. Review
   exact quotations and open their official source links. Missing applicable
   municipal rules must remain pending, even if federal articles were retrieved.
6. Download the JSON. Inspect `alteracoesCampos`, `citacoesRequisitos` and
   `evidenciasLegais`. Citations must reference saved evidence IDs and existing
   paths in `processo`. An empty citation list is disclosed, not presented as a
   legally substantiated specification.
7. Log into the implementer dashboard with a local seeded account authorized for
   this client. The seeded `head` account can access the local test municipality.
   Open the process/conversation form, type the approval statement and click
   **Registrar aprovação desta revisão**. This records implementer review;
   municipal **Confirmar e enviar ao time** remains a separate action.
8. Inspect approval history. Request another correction in the chat and refresh
   the dashboard: the previous approval must remain historical, not current.
   Attempting to approve the old revision returns 409 `STALE_REVISION`.
9. Reload the browser and resume the contact/session. Restart the persistent
   local backend and verify saved history, specification and approvals remain.
   Refresh the helper's temporary token and restart Python if it expires.

## Approval API

The dashboard uses Bearer authentication and client scope:

- `GET /api/v1/forms/:id/approval`: current revision and approval history.
- `POST /api/v1/forms/:id/approval`: `{ "revision": 3, "text": "Aprovo esta revisão após conferir as pendências registradas.", "approve": true }`.
- `GET /api/v1/forms/:id/approval/:approvalId`: the immutable approved JSON snapshot,
  revision and SHA-256 digest. The digest uses recursively sorted object keys;
  array order is preserved.

Approval is an explicit human assertion about the reviewed revision, not model
authorization or legal certification. Drafts must first be presented for review.
No production Aprova configuration is changed by this demonstration.

## Scope and verification

No Habite-se template, municipal field requirements, laws, fees or deadlines were
fabricated during this preparation. TypeScript compilation, contract consistency
and Python syntax checks were performed. No automated tests, live agent turns,
provider calls or approval API exercises were executed; the user performs this script.
