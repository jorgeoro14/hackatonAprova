# Python agent knowledge integration

This is a consumer integration note, not a new HTTP implementation or a change
to the provisional schemas in this directory. The upstream handlers were checked
at `origin/main@8e611fcbccdbd3f4053327912c6811a6663af162` in `src/app.ts`,
`src/bases/rotas.ts` and `src/bases/repositorio.ts`.

| Read operation | Authentication | Response used by the Python adapter |
| --- | --- | --- |
| `/api/v1/agents/:id/knowledge` | Bearer token | `{agentId, bases: [{id, name, maturity, selection, available, guide, norms}]}` |
| `/api/v1/norm-bases/:id/norms/:normId` | Bearer token | `{id, baseId, title, kind, number, year, sphere, summary, officialUrl, coverage, tags, relevance, text}` |
| `/sistema` | None in current handler | `[{id, titulo, tags}]` |
| `/sistema/:id` | None in current handler | `{id, titulo, tags, conteudo}` |
| `/dominios/:id/processos` | None in current handler | `[{id, nome, descricao, exemplo}]` |
| `/dominios/:id/processos/:processoId` | None in current handler | Full `ProcessoModelo`, including `formulario` and `fluxo` |
| `/busca` | None in current handler | `[{origem, fonte, titulo, texto, score}]` |

Search always specifies `camada` (`sistema`, `legislacao` or `processo`) and
`limite=5`. Legislation/process searches also specify an assigned, available
base ID as `dominio`. The adapter validates result source IDs against that
base's assigned norms or process listing. Search snippets, domain guides and
norm summaries are context, not proof of a statutory requirement. Article
citations require full text from the authenticated norm endpoint.

Agent ID, API origin, bearer token and municipality are trusted deployment/backend
inputs. They are not model tools or interview inputs. Refresh assignments on each
retrieval turn. An unavailable/unassigned base cannot be queried, including norms
that remain readable by the dashboard user. System documentation is global; its
IDs must first be discovered through `/sistema`. Authentication failure does not
fall back to unauthenticated knowledge or to a different local corpus.

The knowledge response does not identify the municipality or prove a local law's
currentness/application. The hosting backend must bind the authorized agent/client
to the session municipality. All remote legal evidence remains unverified, and
system documentation does not automatically certify a builder capability profile.

The stateless Python turn uses runtime-injected dependencies and disposable tool
results. Its public response is the provisional form, reply, missing fields and an
optional `ready_for_review` hint. The separate legacy requirements demo exports
internal `Specification` JSON/report with the full selected reference baseline,
retrieved context and requirements notes.
It does not claim a complete `FormularioImplantacao` or post a form anywhere.
`/implantacoes` invokes the separate Node agent. `/api/v1/chat/...` is unimplemented,
and no Python form-save endpoint exists. Before adding writes, agree on a versioned
payload, authenticated client/session ownership, source provenance, revision/digest
checks, validation errors, idempotency and explicit human approval with backend and
frontend owners. No proposed save route is treated as implemented.
