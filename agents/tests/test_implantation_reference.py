"""The questionnaire is shared, versioned and distinct from a municipal baseline."""

import json

import pytest
from agents.app.agent.prompt import build_system_prompt
from agents.app.knowledge import implantation
from agents.app.requirements.comparison import analyze_requirements
from agents.app.requirements.retrieval import TemplateCatalog
from agents.app.requirements.schemas import Specification
from agents.app.requirements.workflow import RequirementsAgent
from agents.tests.test_requirements import BASE, CAPS, SCOPE, FakeLaws, FakeModel
from langgraph.checkpoint.memory import InMemorySaver
from pydantic import ValidationError


def test_reference_accepts_checkout_newlines_but_rejects_unreviewed_content(tmp_path, monkeypatch):
    source = implantation.load_implementation_reference()
    knowledge = tmp_path / "agents/knowledge"
    (knowledge / "aprova").mkdir(parents=True)
    (knowledge / "aprova/implantation-questionnaire.json").write_text(
        json.dumps(source["metadata"]), encoding="utf-8"
    )
    document = tmp_path / source["metadata"]["repository_path"]
    document.parent.mkdir(parents=True)
    document.write_bytes(source["content"].encode().replace(b"\n", b"\r\n"))
    monkeypatch.setattr(implantation, "REPOSITORY_ROOT", tmp_path)
    monkeypatch.setattr(implantation, "KNOWLEDGE_ROOT", knowledge)
    assert implantation.load_implementation_reference()["content"] == source["content"]
    document.write_text("Unreviewed questionnaire revision", encoding="utf-8")
    with pytest.raises(ValueError, match="pinned reference"):
        implantation.load_implementation_reference()


def test_both_workflows_receive_the_same_questionnaire_and_block_intents():
    reference = implantation.load_implementation_reference()
    assert reference["metadata"]["is_municipal_process_baseline"] is False
    assert reference["metadata"]["contains_municipal_answers"] is False
    assert reference["metadata"]["content_sha256"] in build_system_prompt()
    model = FakeModel([{}])
    analyze_requirements(
        template=BASE,
        legal_context=[],
        user_request="Review the supplied form",
        scope=SCOPE,
        capabilities=CAPS,
        model=model,
    )
    data = model.inputs[0]
    assert data["implementation_questionnaire"] == reference
    intents = {intent["name"] for intent in data["intent_registry"]}
    assert {
        "configure_fees",
        "configure_workflow",
        "configure_dispatches",
        "configure_final_document",
    } <= intents
    assert "resumo.apresentacao" in data["implementation_questionnaire"]["content"]


def test_available_questionnaire_does_not_fabricate_a_process_baseline_or_completion():
    runtime = RequirementsAgent(
        model=FakeModel([]),
        scope=SCOPE,
        catalog=TemplateCatalog([]),
        laws=FakeLaws(),
        capabilities=CAPS,
        checkpointer=InMemorySaver(),
        reviewer_roles=frozenset({"implementation_specialist"}),
    )
    result = runtime.start(
        "missing-baseline",
        "Adapt the permit process",
        process_query="permit",
        mode="adapt_existing",
    )
    spec = result["specification"]
    assert spec["template"] is None
    assert spec["questionnaire_reference"]["resource_kind"] == "implementation_questionnaire"
    assert spec["pending_questions"][0]["key"] == "select_template"
    assert spec["output_scope"] == "applicant_form_changes"
    assert spec["implementation_questionnaire_completed"] is False
    with pytest.raises(ValidationError):
        Specification.model_validate({**spec, "implementation_questionnaire_completed": True})
