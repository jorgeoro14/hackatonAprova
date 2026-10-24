"""Explicit server-side embedding configuration shared by ingestion and querying."""

import os

from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from .schemas import EmbeddingSpec


def openai_key_from_environment() -> str:
    """Accept the standard SDK key name while preserving the existing override."""
    return (
        os.environ.get("MODEL_API_KEY", "").strip() or os.environ.get("OPENAI_API_KEY", "").strip()
    )


def embeddings_from_environment() -> tuple[OpenAIEmbeddings, EmbeddingSpec]:
    model = os.environ.get("EMBEDDING_MODEL", "").strip()
    key = os.environ.get("EMBEDDING_API_KEY", "").strip() or openai_key_from_environment()
    if not model or not key:
        raise ValueError(
            "Set server-side EMBEDDING_MODEL and EMBEDDING_API_KEY, MODEL_API_KEY or OPENAI_API_KEY"
        )
    spec = EmbeddingSpec(model=model)
    return OpenAIEmbeddings(model=spec.model, api_key=key, request_timeout=20, max_retries=0), spec


def chat_from_environment(model_variable: str = "MODEL_NAME", *, timeout: float = 10) -> ChatOpenAI:
    name = os.environ.get(model_variable, "").strip()
    key = openai_key_from_environment()
    if os.environ.get("MODEL_PROVIDER") != "openai" or not name or not key:
        raise ValueError(
            "Set MODEL_PROVIDER=openai, MODEL_NAME and server-side OPENAI_API_KEY or MODEL_API_KEY"
        )
    options = {}
    if name == "gpt-6-luna" or name.startswith("gpt-6-luna-"):
        # Preserve the existing Chat Completions/tool contract. Luna supports
        # function calls on this endpoint with reasoning_effort=none.
        options = {"reasoning_effort": "none", "use_responses_api": False}
    return ChatOpenAI(
        model=name, api_key=key, temperature=0, timeout=timeout, max_retries=0, **options
    )
