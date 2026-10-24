# Architecture and boundaries

Frontend -> Backend API -> Agent adapter -> Agent workflow / model provider

Backend API -> Session store

## Frontend

Renders chat, pending states, missing information, draft form, and explicit confirmation. Reads the session object returned by the backend. Exports only the confirmed snapshot. Never invokes a model provider directly.

## Backend

Owns session identifiers, revisions, persistence, HTTP validation, completion rules, and error responses. Serializes messages per session. Validates agent output before saving it. Owns the transition from draft to ready_for_review and from ready_for_review to confirmed.

The backend sends the agent a request matching agent-request.schema.json and receives agent-result.schema.json. Keep the adapter independent of whether the agent later runs in-process or as a separate service. No separate agent HTTP service is required for the MVP.

## Agents

Reads the conversation and current form, extracts supported facts, asks focused questions, and returns a candidate full form with an assistant reply. Preserves previously collected facts unless the employee corrects them. Treats employee text as process data; it must not override system instructions or trigger arbitrary tools.

The agent does not write the session store, confirm forms, or configure municipal systems. The backend decides whether the proposed result is valid and complete.

## Contract conventions

Use UTF-8 JSON, ISO 8601 UTC timestamps, UUID identifiers, snake_case fields, and API path /api/v1. All form properties appear in responses; unknown scalar values are null and unknown collections are empty. Nullable draft fields are deliberate. Required-for-review fields are listed in the schema's x-required-for-review extension.

An employee message has a client_message_id generated once by the frontend and reused on retries. The backend stores a deduplication record with the message and resulting session. Repeating the same ID and text returns the original response without a second agent call; reusing the ID with different text returns 409. The backend checks deduplication before revision validation.

Message submission includes expected_revision. Session creation starts at revision 0; a committed employee/assistant exchange increments revision once. Confirmation also increments revision once. Requests with stale revisions receive 409. Two in-flight submissions for one session are serialized or the second receives 409.

The baseline message operation is synchronous and non-streaming. Pending state belongs in the frontend. Backend timeout is 60 seconds; a timed-out exchange must not commit partial messages or a partial form. Retry safely with the same client_message_id. Introduce background jobs or streaming later only through a coordinated contract change.

Confirmed sessions are immutable in the MVP. Further edits require a new session. GET includes the confirmed snapshot, enabling JSON download without another export endpoint. Missing fields are a sorted list of field names; invalid steps use the name steps.

## Validation

Validate incoming HTTP data, candidate agent output, and saved session data using the shared schemas. Nonempty strings must contain non-whitespace characters. Backend readiness additionally requires each step to contain a description and responsible role. Reject malformed model output without changing the stored session.

Production authentication, authorization, storage, deletion, and deployment are not implemented by this scaffold. Choose them before handling real municipal data or publishing a live collection workflow.
