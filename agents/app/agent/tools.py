"""Build the interview's read-only tools with an explicitly supplied catalog."""

import json
import re

from jsonschema import Draft202012Validator
from langchain.tools import ToolRuntime
from langchain_core.messages import HumanMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.types import Command

from ..knowledge.aprova_reference import AprovaResource, get_reference
from ..knowledge.catalog import CATALOG_SCHEMA
from ..rag.schemas import RagResult
from ..requirements.comparison import validate_analysis
from ..requirements.schemas import AnalysisProposal, LegalEvidence, Template
from .context import TurnContext
from .presentation import build_form_preview


def build_tools() -> list:
    @tool
    def show_form(runtime: ToolRuntime[TurnContext]) -> Command:
        """Display the actual editable form in the frontend, rather than text alone.

        Call when the user asks to show/open/review the form. Uses the current
        backend draft or one retrieved real candidate; retrieve first if absent.
        This signals a form card through the backend response, never /submit.
        Reference values remain proposals with explicit pending confirmation.
        """
        preview = None
        if runtime.context.contract == "implantation":
            preview = build_form_preview(runtime.context, runtime.state.get("knowledge", {}))
        payload = {
            "status": "ready" if preview else "needs_template_or_organization",
            "instruction": (
                "O backend exibirá o formulário editável. Sem novas alterações neste turno, retorne form=null: o servidor usará a prévia já preparada. Com alterações, retorne o rascunho completo. Preserve as pendências; não confirme o envio."
                if preview else
                "Recupere um modelo autorizado e esclareça a seleção ou os dados do órgão que faltam antes de exibir o formulário."
            ),
        }
        return Command(update={
            "form_preview": preview or {},
            "messages": [ToolMessage(content=json.dumps(payload, ensure_ascii=False), tool_call_id=runtime.tool_call_id)],
        })

    @tool
    def search_processes(query: str, runtime: ToolRuntime[TurnContext]) -> str:
        """Find mapped processes by name or ID, with source, version and baseline.

        Empty results mean the mapping is unavailable. Matches are reference
        information; the representative must confirm the applicable version.
        """
        catalog = runtime.context.catalog
        records = catalog.search(query) if catalog is not None else []
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
    def search_municipal_documents(query: str, runtime: ToolRuntime[TurnContext]) -> str:
        """Search the backend-authorized municipality's documents for process evidence.

        Use for local laws, procedures, documents, fees, responsibilities or deadlines.
        Returns a grounded answer with source IDs, excerpts, version and page when
        available, or an explicit unavailable/no-evidence result. Retrieved statements
        are reference evidence, not employee answers. Municipality is fixed by the
        backend and cannot be chosen or changed through this tool.
        """
        municipal_rag = runtime.context.municipal_rag
        result = (
            municipal_rag.search(query)
            if municipal_rag is not None
            else RagResult(status="not_configured")
        )
        return result.model_dump_json()

    @tool
    def retrieve_process_knowledge(
        query: str, runtime: ToolRuntime[TurnContext], selected_template_id: str | None = None,
        process_id: str | None = None,
    ) -> Command:
        """Read assigned API knowledge, system guidance, process baselines and cited law articles.

        Use first for an API-backed process. Scope and credentials come only from
        server runtime. Select a returned template ID only after explicit municipal
        acceptance. This updates disposable turn evidence, never the database.
        For Habite-se use process_id="habite-se" to read the exact available
        /dominios/obras/processos/habite-se baseline within authorized obras scope.
        An exact ID bypasses search ranking, never the assigned-base checks.
        """
        context = runtime.context
        source = context.knowledge_source
        if source is None:
            payload = {
                "status": "not_configured",
                "source_issues": [
                    {
                        "key": "knowledge_api",
                        "description": "No API knowledge source was configured by the backend.",
                    }
                ],
            }
        else:
            if context.domain and not source.domain:
                source = source.for_domain(context.domain)
            if process_id is None and context.domain == "obras" and re.search(
                r"\bhabite[\s-]*se\b", query.casefold()
            ):
                process_id = "habite-se"
            options = {"process_id": process_id} if process_id else {}
            payload = source.retrieve(
                query, selected_template_id, context.municipality, **options
            ).as_turn_data()
        return Command(
            update={
                "knowledge": payload,
                "comparison": {},
                "messages": [
                    ToolMessage(
                        content=json.dumps(payload, ensure_ascii=False),
                        tool_call_id=runtime.tool_call_id,
                    )
                ],
            }
        )

    @tool
    def compare_requirements(
        proposal: AnalysisProposal, runtime: ToolRuntime[TurnContext]
    ) -> Command:
        """Validate proposed field changes and questionnaire notes against retrieved baseline/articles.

        Provide source quotes and representative message IDs. The baseline, legal
        evidence, municipality and capability profile come from server runtime or
        disposable tool results, never from proposal arguments. Return gaps and
        follow-up questions; this tool cannot approve, persist or apply a form.
        """
        knowledge = runtime.state.get("knowledge", {})
        if not knowledge.get("template"):
            result = {
                "conflicts": [
                    {
                        "key": "baseline",
                        "description": "Retrieve and explicitly select an authorized process baseline before comparison.",
                    }
                ]
            }
        else:
            statements = {
                message.id: str(message.content)
                for message in runtime.state["messages"]
                if isinstance(message, HumanMessage)
            }
            analysis = validate_analysis(
                proposal,
                Template.model_validate(knowledge["template"]),
                [LegalEvidence.model_validate(e) for e in knowledge.get("legal_context", [])],
                runtime.context.capabilities,
                statements,
                {},
            )
            result = analysis.model_dump(mode="json")
        return Command(
            update={
                "comparison": result,
                "messages": [
                    ToolMessage(
                        content=json.dumps(result, ensure_ascii=False),
                        tool_call_id=runtime.tool_call_id,
                    )
                ],
            }
        )

    return [
        show_form,
        search_processes,
        get_aprova_reference,
        search_municipal_documents,
        retrieve_process_knowledge,
        compare_requirements,
    ]
