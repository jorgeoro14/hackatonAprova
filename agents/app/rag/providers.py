"""Explicit server-side embedding configuration shared by ingestion and querying."""

import os

from langchain_openai import OpenAIEmbeddings

from .schemas import EmbeddingSpec


def embeddings_from_environment() -> tuple[OpenAIEmbeddings, EmbeddingSpec]:
    model = os.environ.get("EMBEDDING_MODEL", "").strip()
    key = (
        os.environ.get("EMBEDDING_API_KEY", "").strip()
        or os.environ.get("MODEL_API_KEY", "").strip()
    )
    if not model or not key:
        raise ValueError("Set server-side EMBEDDING_MODEL and EMBEDDING_API_KEY or MODEL_API_KEY")
    spec = EmbeddingSpec(model=model)
    return OpenAIEmbeddings(model=spec.model, api_key=key, request_timeout=20, max_retries=0), spec
