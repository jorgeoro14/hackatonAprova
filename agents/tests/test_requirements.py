"""Requirements invariants and full offline interview/review scenarios."""

import json
from copy import deepcopy

import pytest
from agents.app.rag.schemas import CorpusScope
from agents.app.requirements.comparison import analyze_requirements, digest, validate_analysis
from agents.app.requirements.export import export_specification
from agents.app.requirements.retrieval import TemplateCatalog, load_team_models
from agents.app.requirements.schemas import (
    AnalysisProposal,
    Capabilities,
    Change,
    FormField,
    InterviewReply,
    LegalEvidence,
    ReviewDecision,
    Template,
)
from agents.app.requirements.workflow import RequirementsAgent
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from pydantic import ValidationError

SCOPE = CorpusScope(municipality_id="4104808", municipality_name="Cascavel", corpus_id="test")
CAPS = Capabilities(
    source="synthetic_fixture",
    verified=True,
    synthetic=True,
    actions=["add_field", "update_field", "remove_field", "set_required", "add_condition"],
    field_types=["texto", "email", "sim_nao", "selecao"],
)
BASE = Template(
    template_id="test-form",
    name="Test form",
    version="fixture-v1",
    source="synthetic_fixture",
    synthetic=True,
    fields=[
        FormField(field_id="description", label="Description", field_type="texto", required=True),
        FormField(field_id="has_agent", label="Has agent", field_type="sim_nao", required=False),
    ],
)
EVIDENCE = LegalEvidence(
    chunk_id="synthetic-chunk",
    document_id="synthetic-law",
    municipality_id="4104808",
    article="test-provision",
    jurisdiction="municipal",
    source_url="https://example.invalid/synthetic-law",
    source_sha256="a" * 64,
    excerpt="This is a synthetic requirement for tests only.",
    effective_status="confirmed",
    applicability="confirmed",
    verified_at="2026-10-24",
)


def addition(**updates):
    return {
        "action": "add_field",
        "field_id": "contact_email",
        "patch": {"label": "Email", "field_type": "email", "required": False},
        "origin": "operational_suggestion",
        "rationale": "Synthetic proposal",
        **updates,
    }


def analyze(
    changes=None,
    *,
    questions=None,
    evidence=None,
    capabilities=CAPS,
    statements=None,
    answered=None,
):
    return validate_analysis(
        AnalysisProposal.model_validate(
            {
                "suggested_changes": changes or [],
                "next_questions": questions or [],
                "conflicts": [],
            }
        ),
        BASE,
        evidence or [EVIDENCE],
        capabilities,
        statements or {},
        answered or {},
    )


@pytest.mark.parametrize(
    "change",
    [
        addition(action="execute_api"),
        addition(patch={"label": "Email", "field_type": "email"}),
        addition(
            action="set_required", field_id="description", patch={"required": True, "label": "X"}
        ),
        addition(action="remove_field", field_id="description"),
        addition(action="add_condition", field_id="description", patch={}),
        addition(origin="legal_requirement"),
        addition(origin="municipality_request"),
        addition(patch={"label": "Email", "field_type": "email", "required": "false"}),
    ],
)
def test_closed_schema_rejects_unsafe_or_incomplete_payloads(change):
    with pytest.raises(ValidationError):
        Change.model_validate(change)


@pytest.mark.parametrize(
    "change,statements",
    [
        (addition(field_id="description"), {}),
        (addition(action="update_field", field_id="unknown", patch={"label": "X"}), {}),
        (addition(patch={"label": "X", "field_type": "invented_widget", "required": False}), {}),
        (
            addition(
                origin="legal_requirement", legal_basis=[{"chunk_id": "invented", "quote": "test"}]
            ),
            {},
        ),
        (
            addition(
                origin="legal_requirement",
                legal_basis=[{"chunk_id": "synthetic-chunk", "quote": "Not present"}],
            ),
            {},
        ),
        (
            addition(
                origin="municipality_request",
                statements=[{"message_id": "m1", "quote": "Require CPF"}],
            ),
            {"m1": "No such request"},
        ),
    ],
)
def test_invalid_proposals_become_conflicts_and_are_not_exported_as_changes(change, statements):
    result = analyze([change], statements=statements)
    assert result.conflicts
    assert not result.suggested_changes


def test_legal_quotes_stay_pending_even_when_source_metadata_is_confirmed():
    result = analyze(
        [
            addition(
                origin="legal_requirement",
                legal_basis=[
                    {
                        "chunk_id": EVIDENCE.chunk_id,
                        "quote": "synthetic requirement for tests only.",
                    }
                ],
            )
        ]
    )
    assert result.suggested_changes[0].legal_validation == "pending"
    assert result.legal_references == [EVIDENCE]


def test_revoked_source_cannot_support_a_change():
    result = analyze(
        [
            addition(
                origin="legal_requirement",
                legal_basis=[{"chunk_id": EVIDENCE.chunk_id, "quote": "synthetic requirement"}],
            )
        ],
        evidence=[EVIDENCE.model_copy(update={"effective_status": "revoked"})],
    )
    assert result.conflicts and not result.suggested_changes


def test_required_false_and_stable_ids_survive_new_rationale():
    first = analyze([addition()]).suggested_changes[0]
    second = analyze([addition(rationale="A rephrased rationale")]).suggested_changes[0]
    assert first.patch.required is False
    assert first.change_id == second.change_id


def test_valid_municipal_request_needs_exact_recorded_quote():
    change = addition(
        origin="municipality_request", statements=[{"message_id": "m1", "quote": "optional email"}]
    )
    assert not analyze([change], statements={"m1": "Add an optional email field."}).conflicts


@pytest.mark.parametrize("dependency", ["missing", "description"])
def test_missing_and_self_referencing_conditions_are_conflicts(dependency):
    result = analyze(
        [
            addition(
                action="add_condition",
                field_id="description",
                patch={},
                condition={"depends_on": dependency, "operator": "has_value", "effect": "required"},
            )
        ]
    )
    assert result.conflicts


def test_cyclic_conditions_are_blocked():
    changes = [
        addition(
            action="add_condition",
            field_id=target,
            patch={},
            condition={"depends_on": dependency, "operator": "has_value", "effect": "required"},
        )
        for target, dependency in [("description", "has_agent"), ("has_agent", "description")]
    ]
    assert any(i.key == "conditions:cycle" for i in analyze(changes).conflicts)


def test_removal_of_a_condition_dependency_is_blocked():
    changes = [
        addition(
            action="add_condition",
            field_id="description",
            patch={},
            condition={"depends_on": "has_agent", "operator": "has_value", "effect": "required"},
        ),
        addition(action="remove_field", field_id="has_agent", patch={}),
    ]
    assert analyze(changes).conflicts


def test_missing_selection_options_and_unverified_platform_mapping_remain_pending():
    result = analyze(
        [addition(patch={"label": "X", "field_type": "selecao", "required": False})],
        capabilities=Capabilities(source="unverified_docs"),
    )
    assert any(i.key.startswith("options:") for i in result.conflicts)
    assert any(i.key == "capabilities" for i in result.missing_information)


def test_questions_are_deduplicated_and_answered_questions_are_not_repeated():
    questions = [{"key": "contact", "text": "Which contact?"}] * 2 + [
        {"key": "owner", "text": "Which owner role?"}
    ]
    result = analyze(questions=questions, answered={"contact": "Optional email"})
    assert [q.key for q in result.next_questions] == ["owner"]


def test_duplicate_or_overlapping_changes_block_approval():
    assert analyze([addition(), addition()]).conflicts
    result = analyze(
        [
            addition(action="update_field", field_id="description", patch={"required": False}),
            addition(action="set_required", field_id="description", patch={"required": True}),
        ]
    )
    assert any(i.key.endswith(":overlap") for i in result.conflicts)


class FakeModel:
    def __init__(self, proposals):
        self.proposals = iter(proposals)
        self.inputs = []

    def with_structured_output(self, schema):
        assert schema is AnalysisProposal
        return self

    def invoke(self, messages):
        self.inputs.append(json.loads(messages[-1].content))
        result = next(self.proposals)
        return result(self.inputs[-1]) if callable(result) else result


class FakeLaws:
    def __init__(self, evidence=None):
        self.evidence = [EVIDENCE] if evidence is None else evidence
        self.queries = []

    def search_laws(self, query, scope):
        self.queries.append(query)
        return self.evidence


def agent(model, *, checkpointer=None, evidence=None, capabilities=CAPS):
    return RequirementsAgent(
        model=model,
        scope=SCOPE,
        catalog=TemplateCatalog([BASE], allow_synthetic=True),
        laws=FakeLaws(evidence),
        capabilities=capabilities,
        checkpointer=checkpointer or InMemorySaver(),
        reviewer_roles=frozenset({"implementation_specialist"}),
    )


def start(runtime, thread="t"):
    return runtime.start(
        thread,
        "Add optional email",
        process_query="test-form",
        template_id="test-form",
        mode="adapt_existing",
    )


def review_for(runtime, thread="t", **updates):
    spec = runtime.snapshot(thread).values["specification"]
    return ReviewDecision(
        decision="approve",
        revision=spec["revision"],
        specification_digest=updates.pop("specification_digest", digest(spec)),
        confirmed_change_ids=updates.pop(
            "confirmed_change_ids", [c["change_id"] for c in spec["changes"]]
        ),
        verified_legal_chunk_ids=updates.pop(
            "verified_legal_chunk_ids", [e["chunk_id"] for e in spec["legal_references"]]
        ),
        **updates,
    )


@pytest.mark.parametrize("reply", ["Optional email", {"message": "Optional email"}])
def test_studio_interview_accepts_text_or_object_and_preserves_role(reply):
    runtime = agent(
        FakeModel(
            [
                {"next_questions": [{"key": "contact", "text": "Which contact channel?"}]},
                {"suggested_changes": [addition()]},
            ]
        )
    )
    start(runtime)
    result = runtime._graph.invoke(Command(resume=reply), runtime._config("t"))
    assert result["status"] == "pending_approval"
    assert runtime.snapshot("t").next == ("review",)
    assert result["messages"][-1].additional_kwargs["actor_role"] == "municipal_representative"
    assert result["answers"] == {}
    assert result["specification"]["application_status"] == "not_applied"


@pytest.mark.parametrize("reply", [None, [], 42, " ", {"message": "Hi", "actor_role": "unknown"}])
def test_studio_invalid_interview_reply_pauses_for_correction(reply):
    runtime = agent(
        FakeModel(
            [
                {"next_questions": [{"key": "contact", "text": "Which contact channel?"}]},
                {"suggested_changes": [addition()]},
            ]
        )
    )
    initial = start(runtime)
    interrupt_id = initial["__interrupt__"][0].id
    result = runtime._graph.invoke(Command(resume={interrupt_id: reply}), runtime._config("t"))
    assert result["__interrupt__"][0].value["error"]
    assert runtime.snapshot("t").next == ("interview",)
    assert result["revision"] == 1
    corrected = runtime._graph.invoke(Command(resume="Optional email"), runtime._config("t"))
    assert corrected["status"] == "pending_approval"


def test_full_adaptive_interview_then_separate_review_and_export(tmp_path):
    model = FakeModel(
        [
            {
                "suggested_changes": [],
                "next_questions": [{"key": "contact", "text": "Which contact channel?"}],
            },
            {"suggested_changes": [addition()], "next_questions": []},
        ]
    )
    runtime = agent(model)
    first = start(runtime)
    assert first["status"] == "gathering"
    result = runtime.respond(
        "t", InterviewReply(message="Optional email", answered_question_keys=["contact"])
    )
    assert result["status"] == "pending_approval"
    assert model.inputs[1]["answered_questions"] == {"contact": "Optional email"}
    assert len(result["history"]) == 2
    assert runtime.snapshot("t").next == ("review",)
    runtime.review("t", review_for(runtime), reviewer_role="implementation_specialist")
    spec = runtime.snapshot("t").values["specification"]
    assert spec["status"] == "approved"
    assert spec["output_scope"] == "applicant_form_changes"
    assert spec["implementation_questionnaire_completed"] is False
    assert (
        spec["questionnaire_reference"]["content_sha256"]
        == model.inputs[0]["implementation_questionnaire"]["metadata"]["content_sha256"]
    )
    assert spec["application_status"] == "not_applied"
    assert spec["data_kind"] == "synthetic"
    json_file, report = export_specification(spec, tmp_path)
    assert json.loads(json_file.read_text())["resulting_fields"][-1]["required"] is False
    assert "not applied" in report.read_text()
    assert "Full implantation questionnaire completed: false" in report.read_text()


@pytest.mark.parametrize(
    "overrides,role",
    [
        ({"specification_digest": "stale"}, "implementation_specialist"),
        ({"confirmed_change_ids": []}, "implementation_specialist"),
        ({}, "municipal_representative"),
    ],
)
def test_stale_partial_and_unauthorized_reviews_reinterrupt(overrides, role):
    runtime = agent(FakeModel([{"suggested_changes": [addition()]}]))
    start(runtime)
    result = runtime.review("t", review_for(runtime, **overrides), reviewer_role=role)
    assert result["status"] == "pending_approval"
    assert result["__interrupt__"][0].value["error"]


@pytest.mark.parametrize(
    "changes", [{"effective_status": "unverified"}, {"applicability": "conditional"}]
)
def test_human_approval_does_not_override_unverified_legal_currentness_or_adoption(changes):
    change = addition(
        origin="legal_requirement",
        legal_basis=[{"chunk_id": EVIDENCE.chunk_id, "quote": "synthetic requirement"}],
    )
    runtime = agent(
        FakeModel([{"suggested_changes": [change]}]), evidence=[EVIDENCE.model_copy(update=changes)]
    )
    start(runtime)
    result = runtime.review("t", review_for(runtime), reviewer_role="implementation_specialist")
    assert result["status"] == "pending_approval"
    assert "currentness" in result["__interrupt__"][0].value["error"]


def test_verified_citation_still_requires_explicit_semantic_review():
    change = addition(
        origin="legal_requirement",
        legal_basis=[{"chunk_id": EVIDENCE.chunk_id, "quote": "synthetic requirement"}],
    )
    runtime = agent(FakeModel([{"suggested_changes": [change]}]))
    start(runtime)
    result = runtime.review(
        "t",
        review_for(runtime, verified_legal_chunk_ids=[]),
        reviewer_role="implementation_specialist",
    )
    assert result["status"] == "pending_approval"
    runtime.review("t", review_for(runtime), reviewer_role="implementation_specialist")
    assert (
        runtime.snapshot("t").values["specification"]["changes"][0]["legal_validation"]
        == "verified"
    )


def test_review_feedback_generates_a_new_revision_and_invalidates_previous_digest():
    def withdraw(data):
        message_id = next(
            k
            for k, text in data["recorded_messages"].items()
            if text == "Remove the proposed email."
        )
        return {
            "suggested_changes": [],
            "withdrawals": [
                {
                    "change_id": data["previous_analysis"]["suggested_changes"][0]["change_id"],
                    "statement": {"message_id": message_id, "quote": "Remove the proposed email."},
                }
            ],
        }

    runtime = agent(FakeModel([{"suggested_changes": [addition()]}, withdraw]))
    start(runtime)
    old = review_for(runtime)
    revise = old.model_copy(update={"decision": "revise", "feedback": "Remove the proposed email."})
    runtime.review("t", revise, reviewer_role="implementation_specialist")
    assert runtime.snapshot("t").values["revision"] == 2
    assert not runtime.snapshot("t").values["specification"]["blockers"]
    result = runtime.review("t", old, reviewer_role="implementation_specialist")
    assert result["status"] == "pending_approval"


def test_no_corpus_and_no_capability_mapping_block_approval():
    runtime = agent(
        FakeModel([{"suggested_changes": [addition()]}]),
        evidence=[],
        capabilities=Capabilities(source="pending"),
    )
    start(runtime)
    result = runtime.review("t", review_for(runtime), reviewer_role="implementation_specialist")
    assert result["status"] == "pending_approval"
    assert {i["key"] for i in result["specification"]["blockers"]} >= {
        "capabilities",
        "legal_coverage",
    }


def test_scope_is_fixed_and_cross_municipality_retrieval_is_rejected():
    runtime = agent(
        FakeModel([]), evidence=[EVIDENCE.model_copy(update={"municipality_id": "2303501"})]
    )
    with pytest.raises(ValueError, match="municipality"):
        start(runtime)


def test_thread_isolation_and_existing_thread_cannot_be_restarted():
    runtime = agent(FakeModel([{"suggested_changes": []}, {"suggested_changes": [addition()]}]))
    start(runtime, "one")
    start(runtime, "two")
    assert not runtime.snapshot("one").values["specification"]["changes"]
    assert runtime.snapshot("two").values["specification"]["changes"]
    with pytest.raises(ValueError, match="already exists"):
        start(runtime, "one")


def test_implementer_feedback_cannot_be_used_as_a_municipal_statement():
    model = FakeModel([{"suggested_changes": []}])
    runtime = agent(model)
    runtime.start(
        "t",
        "Add optional email",
        actor_role="implementer",
        process_query="test-form",
        template_id="test-form",
        mode="adapt_existing",
    )
    assert not model.inputs[0]["statements"]


def test_baseline_and_inputs_are_immutable_and_example_templates_opt_in():
    before = deepcopy(BASE.model_dump())
    analyze([addition()])
    assert BASE.model_dump() == before
    assert TemplateCatalog([BASE]).search_templates("test") == []
    from agents.app.paths import REPOSITORY_ROOT

    catalog = load_team_models(REPOSITORY_ROOT / "knowledge/dominios", allow_synthetic=True)
    assert catalog.search_templates("licenca ambiental")[0].synthetic is True


def test_checkpoint_resume_after_process_restart(tmp_path, monkeypatch):
    sqlite = pytest.importorskip("langgraph.checkpoint.sqlite")
    monkeypatch.setenv("LANGGRAPH_STRICT_MSGPACK", "true")
    path = str(tmp_path / "state.sqlite3")
    with sqlite.SqliteSaver.from_conn_string(path) as saver:
        runtime = agent(
            FakeModel([{"next_questions": [{"key": "contact", "text": "Contact channel?"}]}]),
            checkpointer=saver,
        )
        start(runtime)
    with sqlite.SqliteSaver.from_conn_string(path) as saver:
        runtime = agent(FakeModel([{"suggested_changes": [addition()]}]), checkpointer=saver)
        runtime.respond(
            "t", InterviewReply(message="Optional email", answered_question_keys=["contact"])
        )
        assert runtime.snapshot("t").values["specification"]["revision"] == 2
        assert runtime.snapshot("t").values["answers"] == {"contact": "Optional email"}


def test_comparison_rejects_cross_scope_before_model_call():
    with pytest.raises(ValueError, match="scope"):
        analyze_requirements(
            template=BASE,
            legal_context=[EVIDENCE.model_copy(update={"municipality_id": "wrong"})],
            user_request="Request",
            scope=SCOPE,
            capabilities=CAPS,
            model=None,
        )


def test_omitted_requirements_stay_tracked_across_multiple_bad_model_outputs():
    first = analyze([addition()])
    second = validate_analysis(
        AnalysisProposal(), BASE, [EVIDENCE], CAPS, {}, {}, previous_analysis=first.model_dump()
    )
    third = validate_analysis(
        AnalysisProposal(), BASE, [EVIDENCE], CAPS, {}, {}, previous_analysis=second.model_dump()
    )
    assert any(i.key.endswith(":omitted") for i in second.conflicts)
    assert any(i.key.endswith(":omitted") for i in third.conflicts)
    assert third.tracked_changes[0].change_id == first.suggested_changes[0].change_id


def test_invalid_withdrawal_cannot_delete_a_tracked_request():
    first = analyze([addition()])
    result = validate_analysis(
        {
            "withdrawals": [
                {
                    "change_id": first.suggested_changes[0].change_id,
                    "statement": {"message_id": "missing", "quote": "Withdraw"},
                }
            ]
        },
        BASE,
        [EVIDENCE],
        CAPS,
        {},
        {},
        previous_analysis=first.model_dump(),
    )
    assert result.conflicts
    assert result.tracked_changes


def test_boolean_condition_values_and_unreviewed_deletions_are_blocked():
    result = analyze(
        [
            addition(
                action="add_condition",
                field_id="description",
                patch={},
                condition={
                    "depends_on": "has_agent",
                    "operator": "equals",
                    "value": "yes",
                    "effect": "required",
                },
            )
        ]
    )
    assert any(i.key.endswith(":condition_type") for i in result.conflicts)
    deletion = analyze([addition(action="remove_field", field_id="has_agent", patch={})])
    assert any(i.key.endswith(":dependency_audit") for i in deletion.missing_information)
