"""Credential precedence and Luna's actual outgoing Chat Completions contract."""

import json

import httpx
import pytest
from agents.app.rag import providers
from langchain_openai import ChatOpenAI


@pytest.fixture(autouse=True)
def isolated_provider_environment(monkeypatch):
    for name in (
        "MODEL_PROVIDER",
        "MODEL_NAME",
        "MODEL_API_KEY",
        "OPENAI_API_KEY",
        "EMBEDDING_MODEL",
        "EMBEDDING_API_KEY",
    ):
        monkeypatch.delenv(name, raising=False)


def test_standard_openai_key_and_explicit_override(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-standard-key")
    assert providers.openai_key_from_environment() == "synthetic-standard-key"
    monkeypatch.setenv("MODEL_API_KEY", "synthetic-override")
    assert providers.openai_key_from_environment() == "synthetic-override"
    monkeypatch.setenv("MODEL_API_KEY", "  ")
    assert providers.openai_key_from_environment() == "synthetic-standard-key"


def test_luna_tool_call_uses_supported_endpoint_and_reasoning_setting(monkeypatch):
    captured = []

    def handler(request):
        captured.append((request.url.path, json.loads(request.content)))
        return httpx.Response(
            200,
            json={
                "id": "synthetic-response",
                "object": "chat.completion",
                "created": 1,
                "model": "gpt-6-luna",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": "OK"},
                    }
                ],
            },
        )

    monkeypatch.setenv("MODEL_PROVIDER", "openai")
    monkeypatch.setenv("MODEL_NAME", "gpt-6-luna")
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-test-key")
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        monkeypatch.setattr(
            providers, "ChatOpenAI", lambda **kwargs: ChatOpenAI(**kwargs, http_client=client)
        )
        model = providers.chat_from_environment()
        model.bind_tools(
            [
                {
                    "type": "function",
                    "function": {
                        "name": "search_templates",
                        "description": "Synthetic read-only test tool",
                        "parameters": {"type": "object", "properties": {}, "required": []},
                    },
                }
            ]
        ).invoke("Synthetic transport test")
    endpoint, payload = captured[0]
    assert endpoint == "/v1/chat/completions"
    assert payload["model"] == "gpt-6-luna"
    assert payload["reasoning_effort"] == "none"
    assert payload["tools"][0]["function"]["name"] == "search_templates"


def test_missing_credentials_fail_without_including_secret_values(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "openai")
    monkeypatch.setenv("MODEL_NAME", "gpt-6-luna")
    with pytest.raises(ValueError, match="OPENAI_API_KEY"):
        providers.chat_from_environment()


def test_embedding_uses_standard_key_but_still_requires_explicit_embedding_model(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "synthetic-test-key")
    with pytest.raises(ValueError, match="EMBEDDING_MODEL"):
        providers.embeddings_from_environment()
    monkeypatch.setenv("EMBEDDING_MODEL", "synthetic-embedding-model")
    model, spec = providers.embeddings_from_environment()
    assert spec.model == "synthetic-embedding-model"
    assert model.openai_api_key.get_secret_value() == "synthetic-test-key"
