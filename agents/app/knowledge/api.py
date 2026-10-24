"""Read-only knowledge API consumer; authorization is never a model argument."""

import json
import re
import time
from collections.abc import Callable
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from pydantic import BaseModel, ConfigDict, Field, StrictBool, ValidationError


class KnowledgeApiError(RuntimeError):
    """Sanitized failure safe for graph state; never include headers or response bodies."""

    def __init__(self, code: str, status: int | None = None):
        self.code = code
        self.status = status
        super().__init__(f"Knowledge API {code}" + (f" (HTTP {status})" if status else ""))


class ApiRecord(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, strict=True)


class NormSummary(ApiRecord):
    id: str = Field(min_length=1)
    title: str
    sphere: str
    kind: str
    number: str
    year: int
    tags: list[str] = Field(default_factory=list)
    summary: str | None = None
    officialUrl: str | None = None
    coverage: str | None = None
    relevance: str = ""


class AssignedBase(ApiRecord):
    id: str = Field(min_length=1)
    name: str
    available: StrictBool
    selection: Literal["selected", "automatic"]
    maturity: Literal["ready", "in_review"]
    guide: str | None = None
    norms: list[NormSummary]


class AssignedKnowledge(ApiRecord):
    agentId: str
    bases: list[AssignedBase]


class FullNorm(NormSummary):
    baseId: str
    text: str


class SystemDocument(ApiRecord):
    id: str
    titulo: str
    conteudo: str


class SearchHit(ApiRecord):
    origem: Literal["sistema", "legislacao", "processo"]
    fonte: str
    titulo: str
    texto: str
    score: float


def segment(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}", value):
        raise KnowledgeApiError("invalid_identifier")
    return quote(value, safe="")


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class KnowledgeApi:
    """Server-owned origin/token with bounded GET-only transport and no redirects."""

    def __init__(
        self,
        base_url: str,
        token: str,
        agent_id: str,
        *,
        transport: Callable | None = None,
        timeout: float = 5,
        max_bytes: int = 4_000_000,
    ):
        url = urlsplit(base_url)
        if (
            url.scheme not in {"http", "https"}
            or not url.hostname
            or url.username
            or url.password
            or url.query
            or url.fragment
            or url.path not in {"", "/"}
            or (url.scheme == "http" and url.hostname not in {"localhost", "127.0.0.1", "::1"})
        ):
            raise KnowledgeApiError("invalid_origin_use_https_or_loopback")
        if not token.strip() or any(c.isspace() for c in token):
            raise KnowledgeApiError("missing_or_invalid_token")
        segment(agent_id)
        self.base_url = base_url.rstrip("/")
        self.agent_id = agent_id
        self._token = token
        self._transport = transport
        self.timeout = timeout
        self.max_bytes = max_bytes

    def _get(self, path: str, *, authenticated=False, params=None, deadline=None):
        remaining = (
            self.timeout if deadline is None else min(self.timeout, deadline - time.monotonic())
        )
        if remaining <= 0:
            raise KnowledgeApiError("deadline_exceeded")
        headers = {"Accept": "application/json"}
        if authenticated:
            headers["Authorization"] = "Bearer " + self._token
        if self._transport:
            return self._transport(path, params or {}, headers, remaining)
        url = self.base_url + path + ("?" + urlencode(params) if params else "")
        try:
            with build_opener(NoRedirects()).open(
                Request(url, headers=headers, method="GET"), timeout=remaining
            ) as response:
                body = response.read(self.max_bytes + 1)
                if len(body) > self.max_bytes:
                    raise KnowledgeApiError("response_too_large")
                return json.loads(body)
        except HTTPError as exc:
            raise KnowledgeApiError("request_failed", exc.code) from None
        except (URLError, OSError, TimeoutError):
            raise KnowledgeApiError("unavailable") from None
        except (ValueError, UnicodeError):
            raise KnowledgeApiError("invalid_json") from None

    @staticmethod
    def _validate(model, data):
        try:
            return model.model_validate(data)
        except ValidationError:
            raise KnowledgeApiError("invalid_response") from None

    def load_knowledge(self, **kwargs) -> AssignedKnowledge:
        result = self._validate(
            AssignedKnowledge,
            self._get(
                f"/api/v1/agents/{segment(self.agent_id)}/knowledge", authenticated=True, **kwargs
            ),
        )
        if result.agentId != self.agent_id or len({b.id for b in result.bases}) != len(
            result.bases
        ):
            raise KnowledgeApiError("assignment_mismatch")
        for base in result.bases:
            segment(base.id)
            if len({n.id for n in base.norms}) != len(base.norms):
                raise KnowledgeApiError("duplicate_norm_ids")
            for norm in base.norms:
                segment(norm.id)
        return result

    def assigned_base(self, knowledge: AssignedKnowledge, domain: str) -> AssignedBase:
        if knowledge.agentId != self.agent_id:
            raise KnowledgeApiError("assignment_mismatch")
        base = next((b for b in knowledge.bases if b.id == domain and b.available), None)
        if base is None:
            raise KnowledgeApiError("base_outside_agent_scope")
        return base

    def get_norm(
        self, knowledge: AssignedKnowledge, domain: str, norm_id: str, **kwargs
    ) -> FullNorm:
        base = self.assigned_base(knowledge, domain)
        if norm_id not in {n.id for n in base.norms}:
            raise KnowledgeApiError("norm_outside_agent_scope")
        norm = self._validate(
            FullNorm,
            self._get(
                f"/api/v1/norm-bases/{segment(domain)}/norms/{segment(norm_id)}",
                authenticated=True,
                **kwargs,
            ),
        )
        if norm.id != norm_id or norm.baseId != domain:
            raise KnowledgeApiError("norm_identity_mismatch")
        return norm

    def list_system(self, **kwargs) -> list[dict]:
        items = self._get("/sistema", **kwargs)
        return self._listing(items, "titulo")

    @staticmethod
    def _listing(items, name):
        if not isinstance(items, list) or any(
            not isinstance(x, dict) or not isinstance(x.get(name), str) for x in items
        ):
            raise KnowledgeApiError("invalid_listing")
        ids = [segment(x.get("id")) for x in items]
        if len(set(ids)) != len(ids):
            raise KnowledgeApiError("duplicate_listing_ids")
        return items

    def get_system(self, document_id: str, discovered_ids: set[str], **kwargs) -> SystemDocument:
        if document_id not in discovered_ids:
            raise KnowledgeApiError("undiscovered_system_document")
        result = self._validate(
            SystemDocument, self._get(f"/sistema/{segment(document_id)}", **kwargs)
        )
        if result.id != document_id:
            raise KnowledgeApiError("system_identity_mismatch")
        return result

    def list_processes(self, knowledge: AssignedKnowledge, domain: str, **kwargs) -> list[dict]:
        self.assigned_base(knowledge, domain)
        return self._listing(self._get(f"/dominios/{segment(domain)}/processos", **kwargs), "nome")

    def get_process(
        self,
        knowledge: AssignedKnowledge,
        domain: str,
        process_id: str,
        discovered_ids: set[str],
        **kwargs,
    ) -> dict:
        self.assigned_base(knowledge, domain)
        if process_id not in discovered_ids:
            raise KnowledgeApiError("undiscovered_process")
        result = self._get(f"/dominios/{segment(domain)}/processos/{segment(process_id)}", **kwargs)
        if (
            not isinstance(result, dict)
            or result.get("id") != process_id
            or result.get("dominio") != domain
            or not isinstance(result.get("formulario"), dict)
            or not isinstance(result.get("fluxo"), dict)
        ):
            raise KnowledgeApiError("invalid_process_baseline")
        return result

    def search(
        self,
        knowledge: AssignedKnowledge,
        query: str,
        layer: Literal["sistema", "legislacao", "processo"],
        *,
        domain: str | None = None,
        allowed_ids: set[str],
        **kwargs,
    ) -> list[SearchHit]:
        if layer not in {"sistema", "legislacao", "processo"}:
            raise KnowledgeApiError("invalid_search_layer")
        if not isinstance(query, str) or not query.strip():
            return []
        if layer != "sistema":
            base = self.assigned_base(knowledge, domain)
            if layer == "legislacao":
                allowed_ids = allowed_ids & {n.id for n in base.norms}
        elif domain is not None:
            raise KnowledgeApiError("system_search_has_no_domain")
        params = {"q": query[:1000], "camada": layer, "limite": 5}
        if domain is not None:
            params["dominio"] = domain
        raw = self._get("/busca", params=params, **kwargs)
        if not isinstance(raw, list):
            raise KnowledgeApiError("invalid_search_response")
        hits = [self._validate(SearchHit, item) for item in raw]
        # Never return raw, unscoped snippets to the model or persist them in state.
        return [h for h in hits if h.origem == layer and h.fonte in allowed_ids][:5]
