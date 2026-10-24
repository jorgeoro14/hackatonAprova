"""Actual backend full-form wire compatibility and server-side scope metadata."""

import json
from copy import deepcopy

import pytest
from agents.app.paths import REPOSITORY_ROOT
from agents.app.server import ImplantationAgent
from agents.tests.test_interview import ScriptedModel, tool_call
from jsonschema import ValidationError


def request():
    return {
        "session_id": "11111111-1111-4111-8111-111111111111",
        "municipio_id": "22222222-2222-4222-8222-222222222222",
        "municipio": "Synthetic Test City",
        "dominio": "meio-ambiente",
        "orgao": {
            "municipio": "Synthetic Test City",
            "uf": "PR",
            "orgao": "Synthetic environmental department",
            "responsavel": {"nome": "Synthetic reviewer"},
        },
        "form": None,
        "messages": [
            {
                "id": "33333333-3333-4333-8333-333333333333",
                "role": "employee",
                "content": "Use the synthetic reference only for this transport test.",
            }
        ],
    }


def draft():
    return {
        "id": "model-id",
        "status": "confirmado",
        "dominio": "meio-ambiente",
        "orgao": request()["orgao"],
        "modeloBase": "licenca-ambiental-previa",
        "processo": json.loads(
            (
                REPOSITORY_ROOT
                / "knowledge/dominios/meio-ambiente/processos/licenca-ambiental-previa.json"
            ).read_text(encoding="utf-8")
        ),
        "legislacaoLocal": [],
        "origens": [],
        "pendencias": [],
        "atualizadoEm": "2026-10-24T00:00:00Z",
    }


def output(form=None, ready=False):
    return {
        "assistant_reply": "Synthetic transport test only.",
        "form": form,
        "pendencias": [],
        "pronto_para_revisao": ready,
    }


def test_null_draft_is_a_valid_early_interview_without_persistence():
    payload = request()
    original = deepcopy(payload)
    model = ScriptedModel(responses=[tool_call("implantation_turn", output())])
    agent = ImplantationAgent(model)
    assert agent.invoke(payload) == output()
    assert agent.graph.checkpointer is None
    assert payload == original
    assert "implantation" in model.seen[0][0].content


def test_full_nested_draft_matches_backend_schema_but_model_cannot_confirm_or_choose_identity():
    form = draft()
    form["orgao"]["municipio"] = "Model-selected city"
    model = ScriptedModel(responses=[tool_call("implantation_turn", output(form, True))])
    result = ImplantationAgent(model).invoke(request())
    assert result["form"]["status"] == "rascunho"
    assert result["form"]["id"] == "draft-" + request()["session_id"]
    assert result["form"]["orgao"]["municipio"] == request()["municipio"]
    assert result["form"]["processo"]["fluxo"]["etapas"]
    assert result["form"]["processo"]["despachos"]


def test_process_domain_escape_is_rejected_and_invalid_input_never_calls_model():
    form = draft()
    form["processo"]["dominio"] = "other-domain"
    with pytest.raises(ValueError, match="domain"):
        ImplantationAgent(
            ScriptedModel(responses=[tool_call("implantation_turn", output(form))])
        ).invoke(request())
    model = ScriptedModel(responses=[])
    payload = request()
    payload["unexpected"] = "no"
    with pytest.raises(ValidationError):
        ImplantationAgent(model).invoke(payload)
    assert not model.seen
