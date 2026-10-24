# Product and MVP scope

## Problem

City hall processes have local rules, responsibilities, approvals, exceptions, and system constraints. Implementation staff need these details in a consistent form before configuring the company system.

## Users

The municipal employee explains the current process and reviews the captured information. The company implementation specialist uses the confirmed form to plan configuration and resolve outstanding questions.

## Existing-process changes

The initial agent focuses on adapting a process already mapped by Aprova. Identify the process and applicable baseline/version, ask the representative which details remain unchanged and which must change, and populate the implementation form with the desired resulting process. Keep collecting missing details and resolving ambiguous changes before review. A catalog default is not automatically a municipal answer.

The user will provide the official process catalog and forms. Until then, lookup is empty by default and the form remains provisional. The agent can still collect explicit municipal facts, but cannot claim compatibility with all Aprova procedures. Process lookup is replaceable and synthetic catalog examples require explicit selection.

Public Aprova API documentation and clearly marked synthetic response templates are available to the agent as a separate local reference. They explain process instances, reusable forms, HTML templates, dispatch definitions and blueprint relationships; they contain no live municipal mappings or employee answers. API response shapes do not replace the official developer questionnaire.

## Demo journey

1. Start a discovery session with a municipality and process name.
2. Describe the process in a WhatsApp-like text conversation.
3. The agent captures facts and asks focused questions about missing information.
4. View the draft form and unresolved questions alongside the chat.
5. Supply corrections through chat and review the updated form.
6. Confirm the current revision when required details are present.
7. Download the confirmed JSON snapshot for the implementation team.

## Provisional form

Capture municipality, process name, objective, responsible department, process owner role, trigger, inputs/documents, ordered steps and their responsible roles, approval/business rules, exceptions, current systems, integration needs, and expected output.

The company has not supplied its official questionnaire. contracts/schemas/form.schema.json is a provisional data model, not a claim of compatibility with the company system. Map and revise it once the real form and a sample process are available.

## Completion policy

Required for review: municipality, process name, objective, responsible department, owner role, trigger, expected output, and at least one step with a description and responsible role. Optional collections can remain empty; an empty collection means no items have been recorded, not that the employee has confirmed there are none.

The agent provides suggested missing fields. The backend recomputes them using the shared form schema and accepts ready_for_review only when required values are present. Only an explicit employee action confirms the form. A complete form is not automatically a correct form.

## Scope boundaries

The MVP supports text, one process per session, a fixed provisional form, human review, and JSON export. Actual WhatsApp messaging, audio transcription, attachments, automatic production configuration, and complex multi-user approvals are follow-up work.

Do not promise automatic integration with municipal systems. The MVP produces requirements for an implementation specialist.

## Data handling

Use synthetic examples. Ask for roles rather than personal identifiers and do not request passwords, tokens, or citizen records. Store only information needed for process discovery. Keep model keys on the server, exclude raw conversations from routine logs, and agree on session deletion and access controls before using real municipal information.
