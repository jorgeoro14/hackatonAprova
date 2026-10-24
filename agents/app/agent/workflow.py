"""Compose the LangChain workflow and expose the validated backend adapter."""

from copy import deepcopy

from jsonschema import Draft202012Validator
from langchain.agents import AgentState, create_agent
from langchain.agents.middleware import ModelCallLimitMiddleware
from langchain.agents.structured_output import ToolStrategy
from langchain_core.messages import AIMessage, HumanMessage

from ..contracts import model_turn_schema, turn_schema
from ..knowledge.catalog import JsonProcessCatalog, ProcessCatalog
from ..rag.workflow import MunicipalRag
from .context import TurnContext
from .helpers import build_context, merge_turn
from .middleware import interview_prompt, trim_backend_history, validate_turn_output
from .tools import build_tools


class TurnState(AgentState):
    knowledge: dict
    comparison: dict
    form_preview: dict


def create_workflow(model, *, max_model_calls=6, contract="provisional"):
    """Create a fresh workflow without provider setup or a hidden session store."""
    return create_agent(
        model=model,
        tools=build_tools(),
        context_schema=TurnContext,
        state_schema=TurnState,
        middleware=[
            trim_backend_history,
            interview_prompt,
            validate_turn_output,
            ModelCallLimitMiddleware(run_limit=max_model_calls, exit_behavior="error"),
        ],
        response_format=ToolStrategy(model_turn_schema(contract), handle_errors=True),
    )


class ProcessInterviewAgent:
    def __init__(
        self,
        model,
        catalog: ProcessCatalog | None = None,
        municipal_rag: MunicipalRag | None = None,
        *,
        max_model_calls=6,
    ):
        self._turn_schema = turn_schema()
        self._catalog = catalog if catalog is not None else JsonProcessCatalog([])
        self._municipal_rag = municipal_rag
        self._agent = create_workflow(model, max_model_calls=max_model_calls)

    def invoke(self, request: dict, *, context: TurnContext | None = None) -> dict:
        """Return the existing public agent-result shape without mutating the request.

        Backend supplies authoritative form/history every turn. No checkpointer:
        a failed exchange cannot leave hidden agent state ahead of backend state.
        Backend must enforce its overall 60-second deadline and persist atomically.
        """
        snapshot = build_context(request)
        if context is None:
            # Compatibility for the existing backend snapshot; no scope comes from chat text.
            context = TurnContext.from_request(
                request,
                catalog=self._catalog,
                municipal_rag=self._municipal_rag,
                municipality=self._municipal_rag.scope if self._municipal_rag else None,
            )
        if (
            context.session_id != request["session_id"]
            or context.current_form != snapshot["current_form"]
        ):
            raise ValueError("Runtime context must match the authoritative backend request")
        if context.backend_message_ids != frozenset(m["id"] for m in request["messages"]):
            raise ValueError("Runtime message IDs must match the backend history")
        messages = [
            (HumanMessage if m["role"] == "employee" else AIMessage)(
                content=m["text"],
                id=m["id"],
                additional_kwargs={"actor_role": "municipal_representative"}
                if m["role"] == "employee"
                else {},
            )
            for m in request["messages"]
        ]
        response = self._agent.invoke(
            {"messages": messages, "knowledge": {}, "comparison": {}},
            context=context,
            config={"recursion_limit": 30},
        )
        turn = response.get("structured_response")
        Draft202012Validator(self._turn_schema).validate(turn)
        if (
            context.municipality
            and "municipality" in turn["updates"]
            and turn["updates"]["municipality"] != context.municipality.municipality_name
        ):
            raise ValueError("Model cannot change the authorized runtime municipality")
        result = merge_turn(context.current_form, turn)
        comparison = response.get("comparison", {})
        blockers = comparison.get("missing_information", []) or comparison.get("conflicts", [])
        sources = response.get("knowledge", {}).get("source_issues", [])
        result["ready_for_review"] = not (result["missing_fields"] or blockers or sources)
        return deepcopy(result)
