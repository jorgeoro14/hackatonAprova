"""Studio factories; Agent Server owns checkpointing, not the CLI SQLite saver."""

import asyncio
import os
from pathlib import Path

from langchain_core.runnables import RunnableConfig

from agents.app.paths import REPOSITORY_ROOT
from agents.app.rag.providers import chat_from_environment
from agents.app.requirements.config import knowledge_from_environment, requirements_scope
from agents.app.requirements.demo import DemoModel, demo_dependencies
from agents.app.requirements.retrieval import CuratedLawSearch, load_team_models
from agents.app.requirements.schemas import Capabilities
from agents.app.requirements.workflow import create_requirements_workflow


def _build(model, catalog, capabilities, knowledge_source=None):
    return create_requirements_workflow(
        model=model,
        scope=requirements_scope(),
        catalog=catalog,
        laws=CuratedLawSearch(REPOSITORY_ROOT / "knowledge_base/chunks/lexical.sqlite3"),
        capabilities=capabilities,
        checkpointer=None,
        server_managed_persistence=True,
        reviewer_roles=frozenset({"implementation_specialist"}),
        knowledge_source=knowledge_source,
    )


def _demo_graph():
    catalog, capabilities = demo_dependencies()
    return _build(DemoModel(), catalog, capabilities)


def _live_graph():
    path = os.environ.get("REQUIREMENTS_CAPABILITIES_PATH", "").strip()
    capabilities = (
        Capabilities.model_validate_json(Path(path).read_text(encoding="utf-8"))
        if path
        else Capabilities(source="pending_implementer_vendor_mapping")
    )
    catalog = load_team_models(
        REPOSITORY_ROOT / "knowledge/dominios",
        allow_synthetic=os.environ.get("REQUIREMENTS_ALLOW_SYNTHETIC") == "true",
    )
    remote = knowledge_from_environment(
        requirements_scope(),
        allow_synthetic=os.environ.get("REQUIREMENTS_ALLOW_SYNTHETIC") == "true",
    )
    return _build(chat_from_environment(), catalog, capabilities, remote)


async def create_demo_graph(config: RunnableConfig):
    """Explicit synthetic interview; no model credentials or embeddings required."""
    return await asyncio.to_thread(_demo_graph)


async def create_live_graph(config: RunnableConfig):
    """Load local catalogs and provider clients outside the server's event loop."""
    return await asyncio.to_thread(_live_graph)
