"""Resolve repository assets independently of the caller's working directory."""

from pathlib import Path

AGENTS_ROOT = Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = AGENTS_ROOT.parent
SCHEMA_ROOT = REPOSITORY_ROOT / "contracts" / "schemas"
AGENT_ROOT = AGENTS_ROOT / "app" / "agent"
DOCS_ROOT = AGENTS_ROOT / "docs"
KNOWLEDGE_ROOT = AGENTS_ROOT / "knowledge"
