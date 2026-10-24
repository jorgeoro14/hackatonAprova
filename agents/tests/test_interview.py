"""Offline adapter checks with the real LangChain loop, not model-quality evaluations."""

import json
from copy import deepcopy
from unittest.mock import patch

import pytest
from agents.app.contracts import INTENTS, load_json, missing_fields, validate
from agents.app.knowledge.catalog import JsonProcessCatalog
from agents.app.paths import REPOSITORY_ROOT as ROOT
from agents.interview import ProcessInterviewAgent
from jsonschema import ValidationError
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import Field


class ScriptedModel(BaseChatModel):
    responses: list[AIMessage]
    seen: list[list[BaseMessage]] = Field(default_factory=list)

    @property
    def _llm_type(self):
        return "scripted-test-model"

    def bind_tools(self, tools, *, tool_choice=None, **kwargs):
        return self

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        self.seen.append(messages)
        return ChatResult(generations=[ChatGeneration(message=self.responses.pop(0))])


@pytest.fixture(autouse=True)
def disable_external_tracing(monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    monkeypatch.setenv("LANGCHAIN_TRACING_V2", "false")


@pytest.fixture
def request_payload():
    return load_json(ROOT / "contracts/examples/agent-request.json")


@pytest.fixture
def complete_form():
    return load_json(ROOT / "contracts/examples/agent-result.json")["form"]


def tool_call(name, args, call_id="test-call"):
    return AIMessage(content="", tool_calls=[{"name": name, "args": args, "id": call_id}])


def turn(updates=None, intent="provide_details", reply="Which role owns the next step?"):
    return tool_call(
        "interview_turn",
        {
            "intent": intent,
            "updates": updates or {},
            "assistant_reply": reply,
        },
    )


def test_multiple_turns_preserve_facts_and_replace_only_corrected_fields(request_payload):
    model = ScriptedModel(
        responses=[
            turn({"department": "Economic Development", "inputs": ["Application"]}),
            turn({"department": "Licensing"}, intent="correct_information"),
        ]
    )
    agent = ProcessInterviewAgent(model)
    original = deepcopy(request_payload)
    first = agent.invoke(request_payload)
    next_request = {
        **request_payload,
        "form": first["form"],
        "messages": [
            *request_payload["messages"],
            {
                "id": "44444444-4444-4444-8444-444444444444",
                "role": "employee",
                "text": "Correction: the department is Licensing.",
                "created_at": "2026-10-24T12:02:00Z",
            },
        ],
    }
    second = agent.invoke(next_request)
    assert request_payload == original
    assert first["form"]["department"] == "Economic Development"
    assert second["form"]["department"] == "Licensing"
    assert second["form"]["inputs"] == ["Application"]
    assert second["form"]["owner_role"] is None
    assert second["form"]["steps"] == []
    assert second["missing_fields"] == missing_fields(second["form"])
    snapshot = json.loads(model.seen[1][-1].content)
    assert snapshot["current_form"] == first["form"]
    assert snapshot["conversation"][-1]["text"].startswith("Correction:")
    validate("agent-result.schema.json", second)


def test_catalog_tool_roundtrip_does_not_autofill_baseline(request_payload):
    records = load_json(ROOT / "agents/examples/catalog.synthetic.json")
    model = ScriptedModel(
        responses=[
            tool_call("search_processes", {"query": "Small business permit"}),
            turn(
                intent="identify_process", reply="Does the demo-1 baseline apply to your process?"
            ),
        ]
    )
    result = ProcessInterviewAgent(model, JsonProcessCatalog(records)).invoke(request_payload)
    assert result["form"] == request_payload["form"]
    lookup_result = model.seen[1][-1]
    assert lookup_result.type == "tool"
    assert json.loads(lookup_result.content)[0]["version"] == "demo-1"


def test_required_fields_complete_still_returns_only_candidate(request_payload, complete_form):
    model = ScriptedModel(
        responses=[
            turn(
                complete_form,
                intent="request_confirmation",
                reply="Please review the displayed revision.",
            )
        ]
    )
    result = ProcessInterviewAgent(model).invoke(request_payload)
    assert result["missing_fields"] == []
    assert set(result) == {"assistant_reply", "form", "missing_fields"}
    assert "confirmed" not in result


def test_invalid_request_rejected_before_model_call(request_payload):
    request_payload["session_id"] = "not-a-uuid"
    model = ScriptedModel(responses=[])
    with pytest.raises(ValidationError):
        ProcessInterviewAgent(model).invoke(request_payload)
    assert model.seen == []


@pytest.mark.parametrize(
    "updates",
    [
        {"made_up_field": "value"},
        {"department": "   "},
        {"steps": [{"description": "Review documents"}]},
        {"steps": [{"description": "Review documents", "responsible_role": None}]},
        {"business_rules": [" "]},
    ],
)
def test_invalid_model_updates_are_rejected_without_mutation(request_payload, updates):
    original = deepcopy(request_payload)
    model = ScriptedModel(responses=[turn(updates)])
    with pytest.raises(ValidationError):
        ProcessInterviewAgent(model).invoke(request_payload)
    assert request_payload == original


@pytest.mark.parametrize("intent", ["pause", "out_of_scope"])
def test_non_editing_intents_cannot_update_form(request_payload, intent):
    with pytest.raises(ValueError, match="cannot update"):
        ProcessInterviewAgent(
            ScriptedModel(responses=[turn({"owner_role": "Supervisor"}, intent=intent)])
        ).invoke(request_payload)


def test_cannot_switch_process_within_session(request_payload):
    with pytest.raises(ValueError, match="new session"):
        ProcessInterviewAgent(
            ScriptedModel(
                responses=[turn({"process_name": "Another process"}, intent="identify_process")]
            )
        ).invoke(request_payload)


def test_unknown_intent_rejected(request_payload):
    with pytest.raises(ValidationError):
        ProcessInterviewAgent(
            ScriptedModel(responses=[turn(intent="configure_production")])
        ).invoke(request_payload)


def test_array_change_and_explicit_clear_preserve_other_fields(request_payload, complete_form):
    request_payload["form"] = deepcopy(complete_form)
    revised_steps = deepcopy(complete_form["steps"])
    revised_steps[-1]["responsible_role"] = "Licensing supervisor"
    result = ProcessInterviewAgent(
        ScriptedModel(
            responses=[
                turn({"steps": revised_steps, "objective": None}, intent="correct_information")
            ]
        )
    ).invoke(request_payload)
    assert result["form"]["steps"][0] == complete_form["steps"][0]
    assert result["form"]["steps"][-1]["responsible_role"] == "Licensing supervisor"
    assert result["form"]["inputs"] == complete_form["inputs"]
    assert result["missing_fields"] == ["objective"]


def test_provider_failure_leaves_request_unchanged(request_payload):
    agent = ProcessInterviewAgent(ScriptedModel(responses=[]))
    original = deepcopy(request_payload)
    with (
        patch.object(agent._agent, "invoke", side_effect=TimeoutError("Provider timeout")),
        pytest.raises(TimeoutError),
    ):
        agent.invoke(request_payload)
    assert request_payload == original


def test_same_agent_does_not_leak_previous_session(request_payload):
    model = ScriptedModel(responses=[turn({"owner_role": "First role"}), turn()])
    agent = ProcessInterviewAgent(model)
    agent.invoke(request_payload)
    second = deepcopy(request_payload)
    second["session_id"] = "55555555-5555-4555-8555-555555555555"
    second["form"]["municipality"] = "Second Example City"
    result = agent.invoke(second)
    snapshot = json.loads(model.seen[-1][-1].content)
    assert snapshot["current_form"] == second["form"]
    assert result["form"]["owner_role"] is None


def test_catalog_validation_lookup_ambiguity_and_copy_isolation():
    records = load_json(ROOT / "agents/examples/catalog.synthetic.json")
    other_version = {**deepcopy(records[0]), "version": "demo-2"}
    catalog = JsonProcessCatalog([*records, other_version])
    assert catalog.search("missing process") == []
    assert catalog.search(" ") == []
    found = catalog.search(" SMALL BUSINESS ")
    assert len(found) == 2
    found[0]["baseline"]["owner_role"] = "Changed outside catalog"
    assert (
        catalog.search("synthetic-business-permit")[0]["baseline"]["owner_role"]
        == "Licensing officer"
    )
    with pytest.raises(ValueError, match="Duplicate"):
        JsonProcessCatalog(records + records)
    with pytest.raises(ValidationError):
        JsonProcessCatalog([{"name": "Missing source and baseline"}])


def test_default_catalog_is_empty(request_payload):
    model = ScriptedModel(
        responses=[
            tool_call("search_processes", {"query": "Small business permit"}),
            turn(),
        ]
    )
    ProcessInterviewAgent(model).invoke(request_payload)
    assert json.loads(model.seen[1][-1].content) == []


def test_intent_registry_is_unique_and_covered_by_documentation():
    names = [intent["name"] for intent in INTENTS]
    assert len(names) == len(set(names))
    documentation = (ROOT / "agents/docs/intents.md").read_text(encoding="utf-8")
    assert all(f"`{name}`" in documentation for name in names)


@pytest.mark.parametrize("resource", ["process", "forms", "templates", "dispatches", "blueprints"])
def test_documentation_tool_roundtrip_keeps_synthetic_examples_out_of_form(
    request_payload, resource
):
    model = ScriptedModel(
        responses=[
            tool_call("get_aprova_reference", {"resource": resource}),
            turn(
                intent="ask_question",
                reply="I can explain the documented structure; the baseline is still needed.",
            ),
        ]
    )
    result = ProcessInterviewAgent(model).invoke(request_payload)
    reference = json.loads(model.seen[1][-1].content)
    assert reference["resource"] == resource
    assert reference["source_kind"] == "public_api_documentation"
    assert reference["is_employee_answer"] is False
    assert reference["response_templates"]["data_kind"] == "synthetic_response_templates"
    assert result["form"] == request_payload["form"]


def test_implantation_guide_reaches_model_during_applicant_form_interview(request_payload):
    model = ScriptedModel(
        responses=[
            turn(
                intent="configure_applicant_form",
                reply="Which applicant field should become required? The nested form mapping is pending.",
            )
        ]
    )
    result = ProcessInterviewAgent(model).invoke(request_payload)
    instructions = model.seen[0][0].content
    assert "acd2de595365622a87f93765b008a1923140dcde" in instructions
    assert "processo.formulario.secoes" in instructions
    assert "FormularioImplantacao" in instructions
    assert result["form"] == request_payload["form"]
    validate("agent-result.schema.json", result)


def test_workflow_intent_can_correct_supported_step_summary(request_payload, complete_form):
    request_payload["form"] = deepcopy(complete_form)
    original = deepcopy(request_payload)
    steps = deepcopy(complete_form["steps"])
    steps[0]["responsible_role"] = "Licensing coordinator"
    model = ScriptedModel(responses=[turn({"steps": steps}, intent="configure_workflow")])
    result = ProcessInterviewAgent(model).invoke(request_payload)
    assert result["form"]["steps"][0]["responsible_role"] == "Licensing coordinator"
    assert result["form"]["steps"][1] == complete_form["steps"][1]
    assert request_payload == original


def test_block_acceptance_does_not_confirm_or_change_form(request_payload):
    result = ProcessInterviewAgent(
        ScriptedModel(
            responses=[
                turn(
                    intent="confirm_block",
                    reply="Your acceptance is recorded in this conversation for review.",
                )
            ]
        )
    ).invoke(request_payload)
    assert result["form"] == request_payload["form"]
    assert set(result) == {"assistant_reply", "form", "missing_fields"}


@pytest.mark.parametrize(
    "updates",
    [
        {"processo": {"taxas": []}},
        {"origens": []},
        {"pendencias": []},
        {"status": "confirmado"},
    ],
)
def test_target_model_keys_cannot_bypass_current_public_contract(request_payload, updates):
    original = deepcopy(request_payload)
    with pytest.raises(ValidationError):
        ProcessInterviewAgent(
            ScriptedModel(responses=[turn(updates, intent="resolve_pending_issue")])
        ).invoke(request_payload)
    assert request_payload == original


def test_municipal_search_unconfigured_keeps_form_unknown(request_payload):
    model = ScriptedModel(
        responses=[
            tool_call("search_municipal_documents", {"query": "Which fee applies?"}),
            turn(
                intent="ask_question",
                reply="The municipal documents are not indexed yet. Which source should we use?",
            ),
        ]
    )
    result = ProcessInterviewAgent(model).invoke(request_payload)
    reference = json.loads(model.seen[1][-1].content)
    assert reference["status"] == "not_configured"
    assert result["form"] == request_payload["form"]


def test_municipal_graph_tool_roundtrip_returns_evidence_without_autofill(request_payload):
    from agents.app.rag.ingest import prepare_corpus
    from agents.app.rag.workflow import MunicipalRag

    corpus = prepare_corpus(ROOT / "agents/examples/rag/manifest.synthetic.json")
    doc = corpus.chunks[0]

    class Retriever:
        scope = corpus.manifest.scope

        def search(self, query):
            return corpus.chunks

    rag_model = ScriptedModel(
        responses=[
            tool_call("RelevanceGrade", {"relevant_chunk_ids": [doc.id]}),
            tool_call(
                "GroundedAnswer",
                {
                    "supported": True,
                    "answer": "The synthetic guide describes a completeness check.",
                    "citation_ids": [doc.id],
                },
            ),
        ]
    )
    municipal_rag = MunicipalRag(rag_model, Retriever())
    model = ScriptedModel(
        responses=[
            tool_call("search_municipal_documents", {"query": "What happens at triage?"}),
            turn(
                intent="ask_question",
                reply="This is a synthetic guide. Please supply the actual municipal procedure.",
            ),
        ]
    )
    result = ProcessInterviewAgent(model, municipal_rag=municipal_rag).invoke(request_payload)
    evidence = json.loads(model.seen[1][-1].content)
    assert evidence["status"] == "answered"
    assert evidence["sources"][0]["document_id"] == "demo-permit-guide"
    assert evidence["sources"][0]["data_kind"] == "synthetic"
    assert result["form"] == request_payload["form"]
    assert set(result) == {"assistant_reply", "form", "missing_fields"}
    request_payload["form"]["municipality"] = "Other City"
    calls_before = len(model.seen)
    with pytest.raises(ValueError, match="municipality"):
        ProcessInterviewAgent(model, municipal_rag=municipal_rag).invoke(request_payload)
    assert len(model.seen) == calls_before
