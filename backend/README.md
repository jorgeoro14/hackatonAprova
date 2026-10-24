# Backend ownership

Implement ../contracts/openapi.json, validate shared schemas, own sessions and revisions, serialize per-session mutations, and adapt agent calls using ../contracts/schemas/agent-request.schema.json and agent-result.schema.json.

Recompute missing_fields from the shared form completion policy; do not trust model readiness. Persist a successful message exchange atomically. Deduplicate retries by client_message_id before checking expected_revision. Confirm only a reviewed, complete revision and keep the snapshot immutable.

Choose and document the language/framework, session storage, install command, environment setup, startup command, and API checks here before adding application code.
