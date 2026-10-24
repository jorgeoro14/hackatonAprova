"""Compare a supplied baseline with statements and retrieved evidence, then check it."""

import json
from hashlib import sha256
from pathlib import Path

from ..contracts import INTENTS
from ..knowledge.implantation import implementation_guide, load_implementation_reference
from ..rag.schemas import CorpusScope
from ..rag.structured import model_step
from .retrieval import team_field_types, validate_capabilities
from .schemas import (
    Analysis,
    AnalysisProposal,
    Capabilities,
    CapturedRequirement,
    FormField,
    Issue,
    LegalEvidence,
    ProposedChange,
    Template,
)


def digest(value: dict) -> str:
    return sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _contains(text: str, quote: str) -> bool:
    # Line wrapping does not change the quoted words or punctuation.
    return " ".join(quote.split()) in " ".join(text.split())


def _apply_field_change(fields: dict, change) -> None:
    if change.action == "add_field":
        fields[change.field_id] = FormField(
            field_id=change.field_id, **change.patch.model_dump(exclude_none=True)
        )
    elif change.action in {"update_field", "set_required"}:
        fields[change.field_id] = FormField.model_validate(
            {**fields[change.field_id].model_dump(), **change.patch.model_dump(exclude_none=True)}
        )
    elif change.action == "remove_field":
        fields.pop(change.field_id, None)


def analyze_requirements(
    *,
    template: Template | None,
    legal_context: list[LegalEvidence],
    user_request: str,
    scope: CorpusScope,
    capabilities: Capabilities,
    model,
    statements: dict[str, str] | None = None,
    answered: dict[str, str] | None = None,
    previous_analysis: dict | None = None,
    recorded_messages: dict[str, str] | None = None,
    knowledge_context: dict | None = None,
) -> Analysis:
    """The model proposes; deterministic checks preserve provenance and missing facts."""
    validate_capabilities(capabilities)
    if any(e.municipality_id != scope.municipality_id for e in legal_context):
        raise ValueError("Legal context scope does not match the session")
    if len({e.chunk_id for e in legal_context}) != len(legal_context):
        raise ValueError("Duplicate legal evidence IDs")
    prompt = Path(__file__).with_name("prompt.txt").read_text(encoding="utf-8")
    proposal = model_step(
        model,
        AnalysisProposal,
        prompt + "\nShared implantation questionnaire guide:\n" + implementation_guide(),
        {
            "template": template.model_dump(mode="json") if template else None,
            "implementation_questionnaire": load_implementation_reference(),
            "intent_registry": INTENTS,
            "legal_context": [e.model_dump(mode="json") for e in legal_context],
            "user_request": user_request,
            "municipality": scope.model_dump(),
            "capabilities": capabilities.model_dump(),
            "canonical_team_field_types": sorted(team_field_types()),
            "statements": statements or {},
            "answered_questions": answered or {},
            "previous_analysis": previous_analysis,
            "recorded_messages": recorded_messages or statements or {},
            "knowledge_context": knowledge_context or {},
        },
    )
    return validate_analysis(
        proposal,
        template,
        legal_context,
        capabilities,
        statements or {},
        answered or {},
        previous_analysis=previous_analysis,
        recorded_messages=recorded_messages,
    )


def validate_analysis(
    proposal,
    template,
    evidence,
    capabilities,
    statements,
    answered,
    *,
    previous_analysis=None,
    recorded_messages=None,
) -> Analysis:
    proposal = AnalysisProposal.model_validate(proposal)
    sources = {e.chunk_id: e for e in evidence}
    fields = {f.field_id: f for f in template.fields} if template else {}
    known_types = team_field_types()
    conflicts = list(proposal.conflicts)
    changes, used = [], set()

    def conflict(key, description):
        conflicts.append(Issue(key=key, description=description))

    def invalid_provenance(record, identity):
        invalid = False
        for citation in record.legal_basis:
            source = sources.get(citation.chunk_id)
            if source is None or not _contains(source.excerpt, citation.quote):
                conflict(identity + ":citation", "Citation must quote an actually retrieved chunk.")
                invalid = True
            elif source.effective_status == "revoked":
                conflict(identity + ":revoked", "A revoked source cannot support a requirement.")
                invalid = True
        for statement in record.statements:
            if not _contains(statements.get(statement.message_id, ""), statement.quote):
                conflict(identity + ":statement", "Municipal provenance needs a recorded quote.")
                invalid = True
        return invalid

    for change in proposal.suggested_changes:
        payload = change.model_dump(mode="json")
        identity = {k: v for k, v in payload.items() if k != "rationale"}
        change_id = "change_" + digest(identity)[:24]
        invalid = invalid_provenance(change, change_id)
        if change.patch.field_type and change.patch.field_type not in known_types:
            conflict(change_id + ":type", "Field type is outside the canonical team schema.")
            invalid = True
        key = (change.action, change.field_id)
        if key in used:
            conflict(
                change_id + ":duplicate", "Duplicate actions on the same field need reconciliation."
            )
            invalid = True
        used.add(key)
        if change.action == "add_field" and change.field_id in fields:
            conflict(change_id + ":exists", "An added field ID already exists.")
            invalid = True
        if change.action != "add_field" and change.field_id not in fields:
            conflict(
                change_id + ":missing", "The target field does not exist in the resulting baseline."
            )
            invalid = True
        if invalid:
            continue
        _apply_field_change(fields, change)
        changes.append(
            ProposedChange(
                **payload,
                change_id=change_id,
                legal_validation="pending" if change.legal_basis else "not_claimed",
            )
        )
    conditions = [(c.field_id, c.condition.depends_on) for c in changes if c.condition]
    written = set()
    for change in changes:
        properties = (
            {"field"}
            if change.action in {"add_field", "remove_field"}
            else set(change.patch.model_dump(exclude_none=True))
        )
        for prop in properties:
            target = (change.field_id, prop)
            if target in written:
                conflict(
                    change.change_id + ":overlap", "Multiple changes write the same field property."
                )
            written.add(target)
    for target, dependency in conditions:
        if target not in fields or dependency not in fields or target == dependency:
            conflict(
                "condition:" + target, "Condition depends on a missing, removed or identical field."
            )
    for change in changes:
        condition = change.condition
        if condition and condition.depends_on in fields and condition.operator != "has_value":
            dependency = fields[condition.depends_on]
            if dependency.field_type == "sim_nao" and not isinstance(condition.value, bool):
                conflict(
                    change.change_id + ":condition_type",
                    "Boolean fields need Boolean comparison values.",
                )
            if dependency.field_type == "selecao" and condition.value not in dependency.options:
                conflict(
                    change.change_id + ":condition_option",
                    "Condition value is not a supplied selection option.",
                )
    graph = {f: [] for f in fields}
    for target, dependency in conditions:
        graph.setdefault(target, []).append(dependency)

    def cyclic(node, stack):
        return node in stack or any(cyclic(n, stack | {node}) for n in graph.get(node, []))

    if any(cyclic(node, set()) for node in graph):
        conflict("conditions:cycle", "Conditional field dependencies contain a cycle.")
    for field in fields.values():
        if field.field_type in {"selecao", "multipla_escolha"} and not field.options:
            conflict("options:" + field.field_id, "Selection options have not been supplied.")
    missing = []
    if not capabilities.verified:
        missing.append(
            Issue(key="capabilities", description="Implementer must verify builder capabilities.")
        )
    for change in changes:
        if (
            change.action == "remove_field"
            and template
            and template.dependency_audit != "confirmed"
        ):
            missing.append(
                Issue(
                    key=change.change_id + ":dependency_audit",
                    description="Review existing workflow, rule and document references before removing a field.",
                )
            )
        if change.action not in capabilities.actions or (
            change.patch.field_type and change.patch.field_type not in capabilities.field_types
        ):
            missing.append(
                Issue(
                    key=change.change_id + ":capability",
                    description="This operation/type has no verified builder mapping.",
                )
            )
    questions = []
    seen = set()
    for q in proposal.next_questions:
        if q.key not in answered and q.key not in seen:
            questions.append(q)
            missing.append(Issue(key=q.key, description=q.text))
            seen.add(q.key)
    previous = Analysis.model_validate(previous_analysis) if previous_analysis else None
    notes = {n.requirement_id: n for n in previous.requirement_notes} if previous else {}
    for note in proposal.requirement_notes:
        payload = note.model_dump(mode="json")
        identifier = "requirement_" + digest(payload)[:24]
        if not invalid_provenance(note, identifier):
            notes[identifier] = CapturedRequirement(**payload, requirement_id=identifier)
    for note in notes.values():
        invalid_provenance(note, note.requirement_id)
        missing.append(
            Issue(
                key="questionnaire_mapping:" + note.requirement_id,
                description=f"Map and review captured requirement at {note.target_path}: {note.requirement}",
            )
        )
    cited = {
        c.chunk_id
        for record in [*changes, *notes.values()]
        for c in record.legal_basis
        if c.chunk_id in sources
    }
    tracked = (
        {c.change_id: c for c in (previous.tracked_changes or previous.suggested_changes)}
        if previous
        else {}
    )
    withdrawn = []
    for withdrawal in proposal.withdrawals:
        statement = withdrawal.statement
        original = (recorded_messages or statements).get(statement.message_id, "")
        if withdrawal.change_id not in tracked or not _contains(original, statement.quote):
            conflict(
                withdrawal.change_id + ":withdrawal",
                "Withdrawal needs a tracked change and recorded quote.",
            )
        else:
            withdrawn.append(withdrawal.change_id)
            del tracked[withdrawal.change_id]
    current_ids = {c.change_id for c in changes}
    for change_id in tracked.keys() - current_ids:
        conflict(
            change_id + ":omitted",
            "A previously captured change was omitted without a recorded withdrawal.",
        )
    tracked.update({c.change_id: c for c in changes})
    return Analysis(
        suggested_changes=changes,
        missing_information=missing,
        legal_references=[sources[k] for k in sorted(cited)],
        conflicts=conflicts,
        next_questions=questions,
        tracked_changes=list(tracked.values()),
        withdrawn_change_ids=withdrawn,
        requirement_notes=list(notes.values()),
    )


def preview_fields(template: Template | None, changes) -> tuple[list[FormField], dict]:
    fields = {f.field_id: f for f in template.fields} if template else {}
    conditions = {}
    for change in changes:
        _apply_field_change(fields, change)
        if change.condition:
            conditions.setdefault(change.field_id, []).append(change.condition)
    return list(fields.values()), conditions
