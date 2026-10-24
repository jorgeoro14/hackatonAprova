"""Studio factories; Agent Server owns checkpointing, not the CLI SQLite saver."""

import os
from pathlib import Path

from langchain_core.runnables import RunnableConfig

from agents.app.paths import REPOSITORY_ROOT
from agents.app.rag.providers import chat_from_environment
from agents.app.rag.schemas import CorpusScope
from agents.app.requirements.demo import DemoModel, demo_dependencies
from agents.app.requirements.retrieval import CuratedLawSearch, load_team_models
from agents.app.requirements.schemas import Capabilities
from agents.app.requirements.workflow import create_requirements_workflow


def _build(model, catalog, capabilities):
    return create_requirements_workflow(
        model=model,
        scope=CorpusScope(
            municipality_id="4104808",
            municipality_name="Cascavel",
            corpus_id="cascavel-legislation-20261024",
        ),
        catalog=catalog,
        laws=CuratedLawSearch(REPOSITORY_ROOT / "knowledge_base/chunks/lexical.sqlite3"),
        capabilities=capabilities,
        checkpointer=None,
        server_managed_persistence=True,
        reviewer_roles=frozenset({"implementation_specialist"}),
    )


def create_demo_graph(config: RunnableConfig):
    """Explicit synthetic interview; no model credentials or embeddings required."""
    catalog, capabilities = demo_dependencies()
    return _build(DemoModel(), catalog, capabilities)


def create_live_graph(config: RunnableConfig):
    """Live model; real baselines and capabilities stay unresolved until supplied."""
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
    return _build(chat_from_environment(), catalog, capabilities)
