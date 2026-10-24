"""Internal proposal contracts, separate from the existing HTTP form contract."""

from typing import Annotated, Literal

from pydantic import Field, HttpUrl, StrictBool, StringConstraints, model_validator

from ..rag.schemas import CorpusScope, Identifier, NonBlank, StrictModel

FieldId = Annotated[NonBlank, StringConstraints(pattern=r"^[a-z0-9_]+$")]
Action = Literal["add_field", "update_field", "remove_field", "set_required", "add_condition"]
Scalar = str | int | float | bool | None


class FormField(StrictModel):
    field_id: FieldId
    label: NonBlank
    field_type: NonBlank
    required: StrictBool
    options: list[NonBlank] = Field(default_factory=list)
    help_text: str | None = None


class Template(StrictModel):
    template_id: Identifier
    name: NonBlank
    version: NonBlank
    source: NonBlank
    synthetic: StrictBool = False
    fields: list[FormField]
    # This is a normalized input-form baseline, not an HTML document template.
    resource_kind: Literal["process_form"] = "process_form"
    dependency_audit: Literal["confirmed", "unverified"] = "unverified"

    @model_validator(mode="after")
    def unique_fields(self):
        if len({f.field_id for f in self.fields}) != len(self.fields):
            raise ValueError("Duplicate baseline field IDs")
        return self


class Capabilities(StrictModel):
    source: NonBlank
    verified: StrictBool = False
    synthetic: StrictBool = False
    actions: list[Action] = Field(default_factory=list)
    field_types: list[NonBlank] = Field(default_factory=list)


class LegalEvidence(StrictModel):
    chunk_id: NonBlank
    document_id: NonBlank
    municipality_id: Identifier
    article: NonBlank
    jurisdiction: Literal["municipal", "state", "federal"]
    source_url: HttpUrl
    source_sha256: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]
    excerpt: NonBlank
    effective_status: Literal["confirmed", "unverified", "revoked"]
    applicability: Literal["confirmed", "conditional", "unverified"]
    verified_at: NonBlank


class Citation(StrictModel):
    chunk_id: NonBlank
    quote: NonBlank


class Statement(StrictModel):
    message_id: NonBlank
    quote: NonBlank


class FieldPatch(StrictModel):
    label: NonBlank | None = None
    field_type: NonBlank | None = None
    required: StrictBool | None = None
    options: list[NonBlank] | None = None
    help_text: str | None = None


class Condition(StrictModel):
    depends_on: FieldId
    operator: Literal["equals", "not_equals", "has_value"]
    value: Scalar = None
    effect: Literal["required", "visible"]

    @model_validator(mode="after")
    def consistent_value(self):
        if self.operator == "has_value" and self.value is not None:
            raise ValueError("has_value has no comparison value")
        if self.operator != "has_value" and self.value is None:
            raise ValueError("A comparison needs a value")
        return self


class Change(StrictModel):
    action: Action
    field_id: FieldId
    patch: FieldPatch = Field(default_factory=FieldPatch)
    condition: Condition | None = None
    origin: Literal["municipality_request", "legal_requirement", "operational_suggestion"]
    rationale: NonBlank
    legal_basis: list[Citation] = Field(default_factory=list)
    statements: list[Statement] = Field(default_factory=list)

    @model_validator(mode="after")
    def valid_payload(self):
        values = self.patch.model_dump(exclude_none=True)
        if self.action == "add_field" and not {"label", "field_type", "required"} <= values.keys():
            raise ValueError("An added field needs label, type and an explicit required flag")
        if self.action == "update_field" and not values:
            raise ValueError("An update needs an explicit patch")
        if self.action == "set_required" and set(values) != {"required"}:
            raise ValueError("set_required only accepts the required flag")
        if self.action in {"remove_field", "add_condition"} and values:
            raise ValueError("This action does not accept a field patch")
        if (self.action == "add_condition") != (self.condition is not None):
            raise ValueError("Only add_condition accepts a condition, which is mandatory")
        if self.origin == "legal_requirement" and not self.legal_basis:
            raise ValueError("A legal requirement needs a retrieved citation")
        if self.origin == "municipality_request" and not self.statements:
            raise ValueError("A municipal request needs a recorded representative statement")
        return self


class Question(StrictModel):
    key: Identifier
    text: NonBlank


class Issue(StrictModel):
    key: NonBlank
    description: NonBlank


class Withdrawal(StrictModel):
    change_id: NonBlank
    statement: Statement


class AnalysisProposal(StrictModel):
    suggested_changes: list[Change] = Field(default_factory=list)
    next_questions: list[Question] = Field(default_factory=list)
    conflicts: list[Issue] = Field(default_factory=list)
    withdrawals: list[Withdrawal] = Field(default_factory=list)


class ProposedChange(Change):
    change_id: NonBlank
    legal_validation: Literal["not_claimed", "pending", "verified"]


class Analysis(StrictModel):
    suggested_changes: list[ProposedChange]
    missing_information: list[Issue]
    legal_references: list[LegalEvidence]
    conflicts: list[Issue]
    next_questions: list[Question]
    tracked_changes: list[ProposedChange] = Field(default_factory=list)
    withdrawn_change_ids: list[NonBlank] = Field(default_factory=list)


class Specification(StrictModel):
    schema_version: Literal[1] = 1
    scope: CorpusScope
    process_name: NonBlank | None
    mode: Literal["use_existing", "adapt_existing", "create_new"] | None
    template: Template | None
    capabilities: Capabilities
    revision: int = Field(ge=1)
    data_kind: Literal["synthetic", "requirements_draft"]
    status: Literal["gathering", "pending_approval", "approved", "rejected"]
    changes: list[ProposedChange]
    legal_references: list[LegalEvidence]
    pending_questions: list[Question]
    blockers: list[Issue]
    # Preview is declarative. No builder or API configuration is executed.
    resulting_fields: list[FormField]
    conditions: dict[str, list[Condition]]
    approved_by_role: NonBlank | None = None
    approved_digest: NonBlank | None = None
    application_status: Literal["not_applied"] = "not_applied"


class Identification(StrictModel):
    process_query: NonBlank | None
    mode: Literal["use_existing", "adapt_existing", "create_new"] | None


class InterviewReply(StrictModel):
    message: Annotated[NonBlank, StringConstraints(max_length=8000)]
    answered_question_keys: list[Identifier] = Field(default_factory=list)
    selected_template_id: Identifier | None = None
    mode: Literal["use_existing", "adapt_existing", "create_new"] | None = None


class ReviewDecision(StrictModel):
    decision: Literal["approve", "revise", "reject"]
    revision: int = Field(ge=1)
    specification_digest: NonBlank
    confirmed_change_ids: list[NonBlank] = Field(default_factory=list)
    verified_legal_chunk_ids: list[NonBlank] = Field(default_factory=list)
    feedback: str | None = None

    @model_validator(mode="after")
    def revision_feedback(self):
        if self.decision == "revise" and not (self.feedback or "").strip():
            raise ValueError("Revision needs feedback")
        return self
