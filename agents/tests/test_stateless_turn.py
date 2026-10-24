"""Backend-owned state and trusted runtime scope through the actual create_agent loop."""

import json
from copy import deepcopy
from dataclasses import FrozenInstanceError

import pytest
from agents.app.agent.context import TurnContext
from agents.app.agent.tools import build_tools
from agents.app.agent.workflow import ProcessInterviewAgent
from agents.app.contracts import load_json, turn_schema
from agents.app.paths import REPOSITORY_ROOT
from agents.tests.test_interview import ScriptedModel, tool_call, turn
from agents.tests.test_knowledge_api import setup_remote
from agents.tests.test_requirements import CAPS, SCOPE
from langchain.agents import create_agent
from langchain.agents.middleware.model_call_limit import ModelCallLimitExceededError
from langchain.agents.structured_output import ToolStrategy


def request():
    return load_json(REPOSITORY_ROOT / "contracts/examples/agent-request.json")


def test_dict_tool_strategy_does_not_validate_and_agent_middleware_corrects_it():
    invalid = turn({"made_up_field": "must not be captured"})
    raw = create_agent(
        model=ScriptedModel(responses=[invalid]),
        response_format=ToolStrategy(turn_schema(), handle_errors=False),
    )
    response = raw.invoke({"messages": [{"role": "user", "content": "Synthetic schema test"}]})
    assert "made_up_field" in response["structured_response"]["updates"]
    model = ScriptedModel(responses=[invalid, turn({"department": "Synthetic department"})])
    payload = request()
    result = ProcessInterviewAgent(model, max_model_calls=2).invoke(payload)
    assert result["form"]["department"] == "Synthetic department"
    assert "made_up_field" not in result["form"]
    assert any("Invalid interview_turn" in str(m.content) for m in model.seen[-1])
    assert payload["form"]["department"] is None


def test_runtime_is_immutable_and_rejects_municipality_inconsistency():
    payload = request()
    context = TurnContext.from_request(payload)
    with pytest.raises(FrozenInstanceError):
        context.domain = "other"
    context.current_form["department"] = "not retained"
    assert context.current_form["department"] is None
    with pytest.raises(ValueError, match="municipality"):
        TurnContext.from_request(payload, municipality=SCOPE)
    payload["form"]["municipality"] = "Cascavel"
    context = TurnContext.from_request(payload, municipality=SCOPE)
    model = ScriptedModel(responses=[turn({"municipality": "Another city"})])
    with pytest.raises(ValueError):
        ProcessInterviewAgent(model).invoke(payload, context=context)


def test_scope_and_dependencies_are_hidden_from_all_model_tool_schemas():
    hidden = {
        "runtime",
        "municipality",
        "domain",
        "agent_id",
        "token",
        "catalog",
        "knowledge_source",
    }
    for tool in build_tools():
        schema = tool.tool_call_schema.model_json_schema()
        assert not hidden.intersection(schema.get("properties", {}))


def test_history_trimming_changes_only_model_input_and_preserves_current_form():
    payload = request()
    payload["messages"][0]["text"] = "Old synthetic message " * 500
    payload["messages"][-1]["text"] = "Record the synthetic department."
    payload["form"]["department"] = "Persisted synthetic department"
    original = deepcopy(payload)
    context = TurnContext.from_request(payload, max_history_tokens=50)
    model = ScriptedModel(responses=[turn()])
    result = ProcessInterviewAgent(model).invoke(payload, context=context)
    assert all("Old synthetic message" not in str(m.content) for m in model.seen[0])
    assert "Persisted synthetic department" in model.seen[0][0].content
    assert payload == original
    assert result["form"] == payload["form"]


def test_call_limit_failure_leaves_no_checkpoint_and_next_run_uses_backend_input():
    payload = request()
    original = deepcopy(payload)
    model = ScriptedModel(responses=[turn({"invented": True}), turn()])
    agent = ProcessInterviewAgent(model, max_model_calls=1)
    assert agent._agent.checkpointer is None
    with pytest.raises(ModelCallLimitExceededError):
        agent.invoke(payload)
    assert payload == original
    assert agent.invoke(payload)["form"] == original["form"]


def test_stateless_api_retrieval_and_comparison_use_runtime_without_saved_specification():
    fake, _, remote = setup_remote(domain="obras")
    payload = request()
    payload["form"]["municipality"] = "Cascavel"
    payload["messages"][-1]["text"] = "Use the synthetic permit model."
    context = TurnContext.from_request(
        payload, municipality=SCOPE, domain="obras", knowledge_source=remote, capabilities=CAPS
    )
    from agents.app.requirements.remote import remote_template_id

    model = ScriptedModel(
        responses=[
            tool_call(
                "retrieve_process_knowledge",
                {
                    "query": "Synthetic permit",
                    "selected_template_id": remote_template_id("obras", "synthetic-permit"),
                },
                "retrieve",
            ),
            tool_call(
                "compare_requirements",
                {
                    "proposal": {
                        "next_questions": [{"key": "fee", "text": "Which fee rule applies?"}]
                    }
                },
                "compare",
            ),
            turn(reply="Which fee rule applies?"),
            turn(),
        ]
    )
    agent = ProcessInterviewAgent(model)
    first = agent.invoke(payload, context=context)
    assert first["ready_for_review"] is False
    knowledge = json.loads(model.seen[1][-1].content)
    assert knowledge["knowledge_context"]["process_baseline"]["fluxo"]
    comparison = json.loads(model.seen[2][-1].content)
    assert comparison["next_questions"][0]["key"] == "fee"
    assert "synthetic-token" not in json.dumps([m.content for m in model.seen[-1]])
    second = agent.invoke(payload, context=context)
    assert second["form"] == payload["form"]
    assert not any(m.type == "tool" for m in model.seen[-1])
    assert not {"revision", "status", "history", "specification"}.intersection(first)
    assert fake.calls[0][0].endswith("/knowledge")
