# Aprova documentation reference pack

Extracted from the [public Hub API documentation](https://hubapi.aprova.com.br/aprovahubapi/) and its [OpenAPI JSON](https://hubapi.aprova.com.br/_bundle/aprovahubapi.json?download=) on 2026-10-24. This pack contains documented structures and synthetic response templates. It contains no authenticated API extraction, real municipal catalog, employee answers or official implementation questionnaire.

## Contents

| File | Purpose |
| --- | --- |
| [api-contract.json](api-contract.json) | Generated parameters, request schemas and response schemas for 17 documented operations, with source URL, retrieval time and source hash |
| [resources.json](resources.json) | English definitions, documented behavior, limitations and suggested interview questions |
| [response-templates.json](response-templates.json) | 12 explicitly synthetic response examples covering all seven GET operations, plus ambiguity, pagination, missing results and errors |

The source declares `https://api.producao.aprova.com.br` as its API server and `x-api-key` for these operations. Reading this local pack needs no key. The agent's reference tool reads local files and performs no HTTP calls. Mutation endpoints below are documented for requirements gathering; they are not executable agent tools.

## Resource definitions and read operations

| Resource | What the docs describe | Read endpoints |
| --- | --- | --- |
| Process | A submitted process instance, identified by ObjectId or resolved from its number and municipality | `GET /hub-api/document/json?type=process&id=...`; `GET /hub-api/process/find-by-np`; `GET /hub-api/process/list` |
| Forms / types | A reusable process subject and its raw configuration | `GET /hub-api/type/find`; `GET /hub-api/document/json?type=form&id=...` |
| Templates | Named HTML document content and optional creation/origin metadata | `GET /hub-api/template?name=...` |
| Dispatches | Reusable dispatch definitions, including Formly form, statuses, user types and deadline settings | `GET /hub-api/blueprint-post/{id}` |
| Blueprints | Process metadata and linked dispatch definitions; available tabs are described by a separate mutation operation | `GET /hub-api/blueprint-process/{id}/blueprint-posts` |

A submitted process is not a reusable mapping. Its historical dispatch snapshot is not necessarily the subject's current configuration. A process's citizen-facing form is also distinct from the developer questionnaire the interview is intended to complete.

## Other documented capabilities

| Resource | Mutation endpoints captured as reference |
| --- | --- |
| Dispatches | `POST /hub-api/blueprint-post`; `PUT /hub-api/blueprint-post/{id}`; `PATCH /hub-api/blueprint-post/{id}` |
| Blueprints | `PATCH /hub-api/blueprint-process/{id}/tabs` |
| Forms / types | `POST /hub-api/type/create`; `PATCH /hub-api/type/edit/{typeId}`; `PATCH /hub-api/type/patch/{typeId}`; `POST /hub-api/type/duplicate` |
| Templates | `POST /hub-api/template/create`; `PUT /hub-api/template/edit` |

Full required fields, types and response statuses are kept per operation in the generated JSON. Do not merge similar endpoints into one assumed schema: for example, the documented dispatch GET response has object items in `statusList` and a nullable string `deadlineValue`, whereas the create response has string items and a nullable number.

## Important retrieval details

- Form discovery takes `cidade`, `uf`, and optional `titulo`. Municipality matching ignores case and accents; title filtering ignores case but retains accent sensitivity. Ambiguous municipalities return candidates rather than a selected baseline. [Form discovery](https://hubapi.aprova.com.br/aprovahubapi/type)
- Process listing requires a date range, supports up to 50 items per page, and returns an opaque `nextCursor`. Keep filters constant while paging. `include=` suppresses the optional timeline/form-content blocks; omitting it requests both. Prefer short windows; the maximum documented window is 366 days. [Process listing](https://hubapi.aprova.com.br/aprovahubapi/process/listprocessesv1http)
- Template lookup needs a known `Municipality/File.html` name. It returns active-version HTML when valid, otherwise the last valid version; missing/nonblank-content failures produce 404. No template-list endpoint is published. [Templates](https://hubapi.aprova.com.br/aprovahubapi/template)
- Blueprint dispatch lookup takes a blueprint UUID or legacy subject ObjectId. `hydrate=true` supplies definition details; `onlyEnabled=false` preserves disabled/deleted entries by default. An HTTP 200 can still contain `unresolved` links. Linked definitions do not establish workflow execution order. [Blueprint relationships](https://hubapi.aprova.com.br/aprovahubapi/blueprint-process/listblueprintpostsv1http)
- The published blueprint operations do not include a full blueprint GET/list or a version identifier. Tab changes are documented as immediate configuration changes without optimistic locking. Do not invent a blueprint version or present the linked-dispatch response as a full blueprint export. [Blueprint configuration](https://hubapi.aprova.com.br/aprovahubapi/blueprint-process)

## Inspect locally

From the repository root:

```powershell
uv run --project agents python -m agents.app.knowledge.aprova_reference templates
uv run --project agents python -m agents.app.knowledge.aprova_reference dispatches --operation-id getBlueprintPostV1Http
```

These commands need neither an Aprova key nor a model key. The LangChain agent exposes the same data through `get_aprova_reference(resource, operation_id=None)`. Without an operation ID the tool returns concise endpoint summaries; a selected operation includes its complete captured request/response schemas. Every result labels its examples synthetic and marks it as neither a municipal catalog nor an employee answer.

## Refresh and verify

```powershell
uv run --project agents python -m agents.scripts.extract_aprova_docs
uv run --project agents pytest agents/tests
uv run --project agents ruff check agents
```

The refresh command downloads only the public OpenAPI JSON. For an offline refresh, add `--source-file path/to/openapi.json`. Review generated diffs and refresh the English guide and synthetic examples when upstream meanings change. The generator converts OpenAPI 3.0 `nullable` to JSON Schema `anyOf`, removes vendor prose/examples and preserves validation constraints and actual property names. Undocumented raw objects remain open objects; missing constraints are not inferred.

Tests verify that the captured schemas are valid and the synthetic templates match their individual response schemas. They also exercise the local reference tool inside the LangChain loop. These checks do not verify live server behavior, model grounding or official-form compatibility. The provisional shared form still lacks structured targets for raw HTML, blueprint tabs and detailed dispatch configuration; those changes require a coordinated mapping once the official developer form is supplied.
