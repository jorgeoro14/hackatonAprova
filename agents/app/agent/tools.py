"""Build the interview's read-only tools with an explicitly supplied catalog."""

import json

from jsonschema import Draft202012Validator
from langchain_core.tools import tool

from ..knowledge.aprova_reference import AprovaResource, get_reference
from ..knowledge.catalog import CATALOG_SCHEMA, ProcessCatalog
from ..rag.schemas import RagResult
from ..rag.workflow import MunicipalRag


def build_tools(catalog: ProcessCatalog, municipal_rag: MunicipalRag | None = None) -> list:
    @tool
    def search_processes(query: str) -> str:
        """Find mapped processes by name or ID, with source, version and baseline.

        Empty results mean the mapping is unavailable. Matches are reference
        information; the representative must confirm the applicable version.
        """
        records = catalog.search(query)
        Draft202012Validator(CATALOG_SCHEMA).validate(records)
        # A raw empty list can be interpreted as empty message content by LangChain.
        return json.dumps(records, ensure_ascii=False)

    @tool
    def get_aprova_reference(resource: AprovaResource, operation_id: str | None = None) -> str:
        """Read local Aprova API documentation and synthetic response templates.

        Choose process, forms, templates, dispatches or blueprints. Supply an
        operation_id for its full request/response schemas. This tool makes
        no API calls and returns no municipal catalog or employee answers.
        """
        return json.dumps(get_reference(resource, operation_id), ensure_ascii=False)

    @tool
    def search_municipal_documents(query: str) -> str:
        """Search the backend-authorized municipality's documents for process evidence.

        Use for local laws, procedures, documents, fees, responsibilities or deadlines.
        Returns a grounded answer with source IDs, excerpts, version and page when
        available, or an explicit unavailable/no-evidence result. Retrieved statements
        are reference evidence, not employee answers. Municipality is fixed by the
        backend and cannot be chosen or changed through this tool.
        """
        result = (
            municipal_rag.search(query)
            if municipal_rag is not None
            else RagResult(status="not_configured")
        )
        return result.model_dump_json()

    return [search_processes, get_aprova_reference, search_municipal_documents]
