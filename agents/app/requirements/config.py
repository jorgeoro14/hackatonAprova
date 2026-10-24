"""Shared, trusted deployment settings for Studio and the local requirements CLI."""

import os

from ..knowledge.api import KnowledgeApi
from ..rag.schemas import CorpusScope
from .remote import ApiKnowledgeSource


def requirements_scope() -> CorpusScope:
    return CorpusScope(
        municipality_id="4104808",
        municipality_name="Cascavel",
        corpus_id="cascavel-legislation-20261024",
    )


def knowledge_from_environment(scope: CorpusScope, *, allow_synthetic=False):
    url = os.environ.get("KNOWLEDGE_API_BASE_URL", "").strip()
    token = os.environ.get("KNOWLEDGE_API_TOKEN", "").strip()
    agent_id = os.environ.get("KNOWLEDGE_AGENT_ID", "").strip()
    domain = os.environ.get("KNOWLEDGE_DOMAIN_ID", "").strip() or None
    if not any((url, token, agent_id, domain)):
        return None
    if not (url and token and agent_id):
        raise ValueError(
            "Set KNOWLEDGE_API_BASE_URL, KNOWLEDGE_API_TOKEN and KNOWLEDGE_AGENT_ID together"
        )
    return ApiKnowledgeSource(
        KnowledgeApi(url, token, agent_id),
        scope,
        allow_synthetic=allow_synthetic,
        domain=domain,
    )
