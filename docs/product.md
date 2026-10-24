# Product and MVP scope

## Problem

City hall processes have local rules, responsibilities, approvals, exceptions, and system constraints. Implementation staff need these details in a consistent form before configuring the company system.

## Users

The municipal employee explains the current process and reviews the captured information. The company implementation specialist uses the confirmed form to plan configuration and resolve outstanding questions.

## Existing-process changes

The initial agent focuses on adapting a process already mapped by Aprova. Identify the process and applicable baseline/version, ask the representative which details remain unchanged and which must change, and populate the implementation form with the desired resulting process. Keep collecting missing details and resolving ambiguous changes before review. A catalog default is not automatically a municipal answer.

The team-defined implantation questionnaire and TypeScript form model are available on `setup/base-conhecimento` at commit `acd2de595365622a87f93765b008a1923140dcde`. The agent follows their section-based interview through [a pinned guide](../agents/docs/implementation-form.md). The source branch's model loader is not yet integrated into the Python agent, so catalog lookup remains empty by default. Synthetic catalog examples require explicit selection.

Public Aprova API documentation and clearly marked synthetic response templates are available to the agent as a separate local reference. They explain process instances, reusable forms, HTML templates, dispatch definitions and blueprint relationships; they contain no live municipal mappings or employee answers. API response shapes do not replace the official developer questionnaire.

Municipal document RAG is prepared for the city hall's supplied procedural documents and legislation. The agent decides when to search an authorized municipality/corpus, grades the retrieved evidence, may rewrite the query once, and returns source-cited guidance or no evidence. Ingestion is separate from interview turns, with offline chunk preview and explicit embedding/indexing. Public Cascavel legislation now has a separate curated article corpus and lexical index, with incomplete municipal coverage and unverified local applicability. No municipal vector embeddings have been generated. Document statements are proposed evidence for human review, not automatically accepted employee requirements. See [the RAG guide](../agents/docs/rag.md); the provisional HTTP form still lacks durable structured citations.

A separate [requirements graph](../agents/docs/requirements.md) now compares an explicitly selected input-form baseline with representative statements and retrieved law articles. It prepares Pydantic-validated field changes and conditions, asks adaptive questions, retains provenance and revisions, and pauses for implementer review. JSON/report exports remain declarative and are never applied to Aprova. Real builder mappings, current municipal legal coverage, complete questionnaire parameterization and frontend/backend integration remain dependencies; the synthetic Studio demo does not establish production readiness.

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

`contracts/schemas/form.schema.json` is still the current provisional transport. It is smaller than the supplied `FormularioImplantacao` target and is not a claim of vendor compatibility. The questionnaire covers service summary, applicant form, required documents, fees, sectors, workflow, dispatches, final document and pending issues, with agency/legal context outside the per-process body. Some questionnaire fields are also missing from the source TypeScript schema itself. The pinned agent guide records those gaps; full nested output requires a coordinated contract migration.

## Completion policy

Required for review: municipality, process name, objective, responsible department, owner role, trigger, expected output, and at least one step with a description and responsible role. Optional collections can remain empty; an empty collection means no items have been recorded, not that the employee has confirmed there are none.

The agent provides suggested missing fields. The backend recomputes provisional readiness using the shared form schema. This does not establish completion of all implantation sections, origins, pending issues or intended specialist block confirmations. Distinguish representative acceptance from specialist review and backend/UI confirmation; the model cannot confirm a revision or set status. A complete provisional form is not automatically a correct or fully represented implantation form.

## Scope boundaries

The MVP supports text, one process per session, a fixed provisional form, human review, and JSON export. Actual WhatsApp messaging, audio transcription, attachments, automatic production configuration, and complex multi-user approvals are follow-up work.

Do not promise automatic integration with municipal systems. The MVP produces requirements for an implementation specialist.

## Data handling

Use synthetic examples. Ask for roles rather than personal identifiers and do not request passwords, tokens, or citizen records. Store only information needed for process discovery. Keep model keys on the server, exclude raw conversations from routine logs, and agree on session deletion and access controls before using real municipal information.
