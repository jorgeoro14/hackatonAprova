# Integration plan

## First milestone: one real exchange

Backend returns the example session through the documented endpoints. Frontend renders it and submits one message using the documented request. Agent implements the adapter contract and returns one follow-up question with an updated form. Connect all three and run the full flow before expanding features.

## Suggested initial issues

| Role | First task | Acceptance criterion |
| --- | --- | --- |
| Frontend | Chat and draft form view | Versioned session example renders; loading and API errors are visible |
| Backend | Session API and agent adapter | Create, retrieve, message, and confirm use the documented shapes |
| Agents | Interview and structured extraction | One synthetic process yields supported facts and useful follow-up questions |
| Shared | Stack and demo decisions | Owners, launch commands, model, and demo environment documented |

## Integration acceptance checks

- Create a session and receive draft, revision 0, initial assistant greeting, and missing fields.
- Submit the example employee message and receive both messages, an updated form, and revision 1.
- Retry the same client_message_id; obtain the original response without duplicate messages or extraction.
- Submit the same ID with different text; receive 409.
- Submit a stale revision; receive 409 and reload the latest session.
- Confirm an incomplete form; receive 422 with missing fields.
- Supply all required details; receive ready_for_review and no missing fields.
- Confirm the displayed revision; receive confirmed and an immutable snapshot matching the reviewed form.
- Try to modify a confirmed session; receive 409.
- Simulate agent failure or timeout; show a retry state and preserve the stored session.

## Demo rehearsal

Use a fictional municipality and the supplied permit-process example. Demonstrate follow-up questions, correction of one captured fact, review, explicit confirmation, and JSON download. Keep a clearly labeled offline example available if connectivity fails. Never represent an offline example as a live model response.

## After selecting the stack

Add dependency manifests and lockfiles, real run commands in each component README, runtime schema validation, and relevant automated checks. Deploy an integrated minimal version early. Update this document with the agreed URLs and component startup order.
