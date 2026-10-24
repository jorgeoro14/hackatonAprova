# Shared contracts

openapi.json defines the frontend/backend HTTP boundary. schemas/ defines the canonical JSON structures; examples/ contains a synthetic conversation from creation to confirmation. API schema references resolve relative to openapi.json. Agent schema references resolve within schemas/.

| Example | Schema |
| --- | --- |
| create-session.json | create-session.schema.json |
| session.json | session.schema.json |
| message-request.json | message-request.schema.json |
| agent-request.json | agent-request.schema.json |
| agent-result.json | agent-result.schema.json |
| ready-session.json | session.schema.json |
| confirm-request.json | confirm-request.schema.json |
| confirmed-session.json | session.schema.json |
| error.json | error.schema.json |

Unknown form scalars are null; unknown collections are empty. Required-for-review fields are defined once in form.schema.json under x-required-for-review. Missing fields are sorted. The backend computes readiness; the agent's missing_fields is advisory. An empty optional collection does not prove the employee confirmed that no such rules or integrations exist.

A form is a requirements artifact for human implementation staff. It is not an executable configuration or an official company form.

Agent results may include `ready_for_review`, an advisory Boolean for the provisional
candidate. Older consumers may omit/ignore it. The backend recomputes readiness;
the hint never changes status, revisions or confirmation and does not certify
whole-questionnaire or legal completeness. Trusted runtime scope and dependencies
are injected by the backend adapter outside model messages and the HTTP form.

Coordinate contract changes across all three roles. Update examples and checks together. Run node scripts/check-contracts.mjs. Runtime implementations must use an appropriate full schema validator; the lightweight repository checker only supports the schema keywords currently used here.
