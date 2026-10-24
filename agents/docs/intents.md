# Implantation interview intents

The interview now follows the team's FormularioImplantacao on
[setup/base-conhecimento at acd2de5](https://github.com/jorgeoro14/hackatonAprova/tree/acd2de595365622a87f93765b008a1923140dcde).
[implementation-form.md](implementation-form.md) is the pinned guidance loaded
into every model call. It distinguishes the questionnaire, the source TypeScript
schemas and the current Python transport.

## Primary intents

[intents.json](../app/agent/intents.json) is the machine-readable registry loaded into the
prompt and internal structured-response schema. Prefer the specific block when
a target is clear; keep general intents for cross-block or unclear requests.

| Intent | Example utterance |
| --- | --- |
| `provide_organization` | ?This implantation is for Example City, SC, Environment department.? |
| `identify_process` | ?Start with the environmental prior-license model.? |
| `provide_local_legislation` | ?The calculation rule is in the municipal decree; I will provide the reference.? |
| `configure_service_summary` | ?Allow the service to start internally and through the portal.? |
| `configure_applicant_form` | ?Make the project address required and add help text.? |
| `configure_documents` | ?Remove this attachment requirement from the model.? |
| `configure_fees` | ?Charge the fee before issuing the final document.? |
| `configure_sectors` | ?Environmental Inspection is an internal sector.? |
| `configure_workflow` | ?Return incomplete applications from screening to the applicant.? |
| `configure_dispatches` | ?The approval dispatch requires the director's signature.? |
| `configure_final_document` | ?Change the certificate's numbering pattern and signer.? |
| `describe_changes` | ?Several parts of this model differ from our procedure.? |
| `provide_details` | ?Here is the remaining context you requested.? |
| `correct_information` | ?Correction: the coordinator owns that stage.? |
| `resolve_pending_issue` | ?For the pending calculation question, use the supplied formula.? |
| `ask_question` | ?What is the difference between a dispatch and a transition?? |
| `review_form` | ?Show accepted blocks and outstanding issues.? |
| `confirm_block` | ?The required-documents block is correct.? |
| `request_confirmation` | ?Everything has been reviewed; finalize the draft.? |
| `pause` | ?I need to check that with the department.? |
| `resume` | ?Continue with the next unresolved block.? |
| `out_of_scope` | ?Apply these changes to production now.? |

A correction takes `correct_information`; answering a named pending issue takes
`resolve_pending_issue`; a hypothetical question takes `ask_question`. A message
may contain several facts even though the response has one primary intent.

## Interview and review

Establish implantation-level organization context; select the domain and a
retrieved starting model; collect local sources; then review service summary,
applicant fields, documents, fees, sectors, workflow, dispatches and final output.
Propose one short block at a time and ask for acceptance or adjustments. Preserve
out-of-order answers and avoid re-asking completed questions.

Track the distinction between model proposals, representative answers and legal
sources using the target concepts `modelo`, `servidor`, `legislacao`. Local
laws and agency setup belong at implantation level. Required missing answers,
unknown legal references and unsupported target fields remain pending.

Representative acceptance, the specialist's ?Confirm block? action and whole-form
confirmation are distinct. The backend/UI owns confirmation and status. An empty
provisional missing-field list is not complete implantation readiness.

## Current integration boundary

The source branch's questionnaire includes structures its own schema has not yet
implemented: sector registry, dispatches, richer deadline settings, fee charging
stage, final-document text/numbering, summary-specific controls and block flags.
The guide identifies supported paths and these gaps without inventing fields.

The Python agent still returns the public provisional form from
[form.schema.json](../contracts/schemas/form.schema.json). It can summarize
supported facts there; unmapped details remain in the conversation with an
explicit persistence gap. It cannot emit `FormularioImplantacao`, `origens` or
`pendencias` as undeclared output keys. A coordinated contract migration is
needed for full nested-form output, provenance and block confirmation.

The source branch and its knowledge loader were inspected, not merged or
connected as a live catalog. Actual model retrieval still depends on the injected
catalog. Offline tests verify instruction delivery, intent acceptance and output
boundaries, not live model classification or legal applicability.
