# Default knowledge agent for new web conversations

JWT-authenticated `PUT /api/v1/clients/:clientId/agent-defaults/:domain` accepts
`{ "agentId": "uuid" }`, or `{ "agentId": null }` to remove the default. It
returns `{ clientId, domain, agentId }`. Only users authorized for that client
can configure it. The agent must belong to the same client, not be paused, and
have the available domain among its assigned bases. A draft agent is allowed
for the web demo without inventing a WhatsApp number or changing WhatsApp status.

New conversations inherit this explicit backend-owned default for their domain.
Existing unassigned conversations are repaired on identification or the next
message. Explicit conversation assignments are preserved. Defaults never grant
access to another municipality or to an unassigned domain. Removing a default
stops future automatic assignment; existing explicit bindings remain intact.

The Python service still requires a matching server-side knowledge configuration.
No credential or agent choice is derived from client message text.
