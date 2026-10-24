# Process-change interview intents

The agent helps a municipal representative specify the future version of an existing mapped Aprova process. Developers receive a reviewed requirements form. The official catalog and questionnaire are pending; the shared provisional form is the current boundary.

## Employee intents

The canonical labels, triggers and agent responses live in [intents.json](intents.json), which is loaded into the prompt and schema. A message may express several needs; the model chooses one primary intent and captures all explicit supported facts.

| Intent | Example employee utterance |
| --- | --- |
| `identify_process` | “We need to adapt the small business permit process for Example City.” |
| `describe_changes` | “Add supervisor approval after the document check.” |
| `provide_details` | “The licensing supervisor handles that approval.” |
| `correct_information` | “Correction: the owner is the licensing coordinator.” |
| `ask_question` | “What do you mean by integration needs?” |
| `review_form` | “Show me what you have captured and what is missing.” |
| `request_confirmation` | “Everything looks correct; finalize it.” |
| `pause` | “I need to check that with the department; stop for now.” |
| `resume` | “Let’s continue where we left off.” |
| `out_of_scope` | “Configure the live system now.” |

## Interview progression

1. Establish municipality and process identity. Retrieve mapped process candidates with their sources and versions. Ask the representative to resolve ambiguous matches; report unavailable mappings honestly.
2. Ask the representative to accept the applicable baseline/version and explain what remains unchanged. Catalog facts must not silently become municipal answers.
3. Gather requested additions, removals and replacements. Identify the affected field, rule or ordered step and the desired resulting behavior. Ask when a target, owner, order or condition is unclear.
4. Populate the future-process form with supported local facts and accepted unchanged details. Preserve unrelated answers and continue asking focused questions until required information and known ambiguities are resolved.
5. Summarize the draft and changes for human review. Optional empty collections mean unrecorded information. The current schema cannot persist “confirmed none” separately from unknown.
6. Direct the representative to the explicit confirmation action for the current revision. The backend decides readiness and confirms; a chat statement cannot confirm or deploy a process.

Pause and resume use the current backend-supplied snapshot. The agent does not persist a separate paused state. A second process requires a new session.

## Mapping and acceptance

The field mapping is included in [prompt.txt](prompt.txt); the canonical field names and required-for-review list remain in [form.schema.json](../contracts/schemas/form.schema.json). Requested changes are reflected in the resulting form, not mixed with obsolete baseline instructions. The public contract currently represents the resulting process, not a separate versioned change request.

Examples of questions that must remain unresolved rather than receive invented answers:

- “Add another approval” without its responsible role or position in the flow.
- “Remove the document” when several documents have been listed.
- Conflicting answers about a deadline without a clear correction.
- A catalog match without agreement that its version applies locally.
- A required official-form section not yet represented in the provisional model.

Structural validation cannot prove the truth or completeness of extracted requirements. Live behavioral evaluation and mapping against the official Aprova materials are pending. No production configuration, citizen-data collection, or automatic confirmation is part of these intents.
