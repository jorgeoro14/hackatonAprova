"""Immutable, backend-owned input and dependencies for one disposable agent run."""

import json
from dataclasses import dataclass, field
from typing import Any

from jsonschema import Draft202012Validator

from ..contracts import missing_fields, model_turn_schema, validate
from ..rag.schemas import CorpusScope
from ..requirements.schemas import Capabilities


@dataclass(frozen=True, kw_only=True)
class TurnContext:
    session_id: str
    current_form_json: str
    contract: str = "provisional"
    organization_json: str | None = None
    municipality: CorpusScope | None = None
    domain: str | None = None
    attachments: tuple = ()
    catalog: Any = field(default=None, repr=False)
    municipal_rag: Any = field(default=None, repr=False)
    knowledge_source: Any = field(default=None, repr=False)
    capabilities: Capabilities = field(default_factory=lambda: Capabilities(source="unverified"))
    backend_message_ids: frozenset[str] = frozenset()
    max_history_tokens: int = 6000

    def __post_init__(self):
        if self.contract == "implantation":
            # Keep the root $defs when validating recursive list fields from Zod.
            Draft202012Validator(model_turn_schema(self.contract)).validate({
                "assistant_reply": "Runtime validation", "form": self.current_form,
                "pendencias": [], "pronto_para_revisao": False,
            })
        else:
            validate("form.schema.json", self.current_form)
        if self.max_history_tokens < 1:
            raise ValueError("History token budget must be positive")
        if self.municipality:
            form = self.current_form
            name = (
                (
                    form.get("orgao", {}).get("municipio")
                    if self.contract == "implantation"
                    else form["municipality"]
                )
                if form
                else None
            )
            if (
                name is not None
                and name.strip().casefold() != self.municipality.municipality_name.casefold()
            ):
                raise ValueError("Form municipality differs from the authorized runtime scope")
        for service in (self.municipal_rag, self.knowledge_source):
            if service is not None and (
                self.municipality is None or service.scope != self.municipality
            ):
                raise ValueError(
                    "Retrieval dependency differs from the authorized runtime municipality"
                )
        if (
            self.knowledge_source
            and self.knowledge_source.domain
            and self.domain != self.knowledge_source.domain
        ):
            raise ValueError("Runtime domain differs from the server-authorized domain")

    @property
    def current_form(self) -> dict:
        # Return a fresh value: neither tools nor prompt assembly can mutate the input snapshot.
        return json.loads(self.current_form_json)

    @property
    def missing_required_fields(self) -> list[str]:
        if self.contract == "implantation":
            return (
                [p["caminho"] for p in self.current_form.get("pendencias", [])]
                if self.current_form
                else ["processo"]
            )
        return missing_fields(self.current_form)

    @classmethod
    def from_request(cls, request, **dependencies):
        validate("agent-request.schema.json", request)
        return cls(
            session_id=request["session_id"],
            current_form_json=json.dumps(request["form"], ensure_ascii=False, sort_keys=True),
            backend_message_ids=frozenset(m["id"] for m in request["messages"]),
            **dependencies,
        )
