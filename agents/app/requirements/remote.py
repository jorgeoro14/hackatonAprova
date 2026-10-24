"""Bounded API retrieval for the requirements graph, isolated from model/provider code."""

import json
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from hashlib import sha256

from pydantic import ValidationError

from ..knowledge.api import KnowledgeApi, KnowledgeApiError
from ..rag.legislation import article_spans, split_span
from ..rag.schemas import CorpusScope
from .retrieval import _normalized, normalize_process_model, team_field_types
from .schemas import Issue, LegalEvidence, Template


def remote_template_id(domain: str, process_id: str) -> str:
    """Namespace domain-local IDs without exceeding the internal Identifier contract."""
    return "api-" + sha256(f"{domain}/{process_id}".encode()).hexdigest()[:32]


def _terms(text: str) -> set[str]:
    return {t for t in re.findall(r"\w+", _normalized(text)) if len(t) > 2}


def _baseline_laws(value) -> set[str]:
    if isinstance(value, list):
        return set().union(*(_baseline_laws(item) for item in value))
    if not isinstance(value, dict):
        return set()
    references = value.get("baseLegal", [])
    own = (
        {ref for ref in references if isinstance(ref, str)}
        if isinstance(references, list)
        else set()
    )
    return own | set().union(*(_baseline_laws(item) for item in value.values()))


@dataclass
class RetrievedKnowledge:
    candidates: list[Template] = field(default_factory=list)
    template: Template | None = None
    evidence: list[LegalEvidence] = field(default_factory=list)
    context: dict = field(default_factory=dict)
    issues: list[Issue] = field(default_factory=list)

    def as_turn_data(self) -> dict:
        return {
            "template_candidates": [t.model_dump(mode="json") for t in self.candidates],
            "template": self.template.model_dump(mode="json") if self.template else None,
            "legal_context": [e.model_dump(mode="json") for e in self.evidence],
            "knowledge_context": self.context,
            "source_issues": [i.model_dump() for i in self.issues],
        }


class ApiKnowledgeSource:
    def __init__(
        self,
        api: KnowledgeApi,
        scope: CorpusScope,
        *,
        allow_synthetic=False,
        domain: str | None = None,
        deadline_seconds=20,
        max_calls=24,
    ):
        self.api = api
        self.scope = scope
        self.allow_synthetic = allow_synthetic
        self.domain = domain
        self.deadline_seconds = deadline_seconds
        self.max_calls = max_calls

    def for_domain(self, domain: str):
        """Narrow a deployment-wide source to the backend's authorized domain."""
        if self.domain and self.domain != domain:
            raise KnowledgeApiError("domain_scope_mismatch")
        if self.domain == domain:
            return self
        return ApiKnowledgeSource(
            self.api, self.scope, domain=domain, allow_synthetic=self.allow_synthetic,
            deadline_seconds=self.deadline_seconds, max_calls=self.max_calls,
        )

    def retrieve(
        self,
        query: str,
        selected_id: str | None,
        scope: CorpusScope,
        *,
        search_query: str | None = None,
        retained_evidence: list[dict] | None = None,
        process_id: str | None = None,
    ) -> RetrievedKnowledge:
        if scope != self.scope:
            raise KnowledgeApiError("municipality_scope_mismatch")
        result = RetrievedKnowledge()
        deadline = time.monotonic() + self.deadline_seconds
        calls = 0

        def call(method, *args, **kwargs):
            nonlocal calls
            calls += 1
            if calls > self.max_calls:
                raise KnowledgeApiError("request_budget_exceeded")
            return method(*args, **kwargs, deadline=deadline)

        def issue(key, description):
            result.issues.append(Issue(key=key, description=description))

        try:
            # Always first, even on resumed turns: no shared cache of authorization.
            knowledge = call(self.api.load_knowledge)
        except KnowledgeApiError as exc:
            issue("knowledge_api", str(exc) + ". Restore access before continuing.")
            return result
        bases = [b for b in knowledge.bases if b.available]
        if self.domain:
            bases = [b for b in bases if b.id == self.domain]
            if not bases:
                issue("knowledge_scope", "Configured domain is not available to this agent.")
                return result
        if not bases:
            issue("knowledge_scope", "No assigned knowledge base is available.")
        # Keep cross-cutting legal guidance when a process domain is pinned.
        context_bases = [b for b in knowledge.bases if b.available]
        result.context = {
            "agent_id": knowledge.agentId,
            "retrieved_at": datetime.now(UTC).isoformat(),
            "municipality_binding": "trusted_server_configuration_not_provided_by_knowledge_response",
            "assigned_bases": [b.model_dump() for b in context_bases],
            "process_candidates": [],
            "process_previews": [],
            "process_baseline": None,
            "system_documents": [],
            "search_results": [],
        }
        search = (search_query or query).strip()
        # Only selected/previously cited or search-matched laws need full-text retrieval.
        norm_targets, required_targets = [], []
        for previous in retained_evidence or []:
            base_id, norm_id = previous.get("knowledge_base_id"), previous.get("norm_id")
            if any(b.id == base_id and norm_id in {n.id for n in b.norms} for b in context_bases):
                required_targets.append((base_id, norm_id))
            else:
                issue("legal_scope_changed", "Previously cited evidence is no longer assigned.")
        for base in context_bases:
            if base.id in {b.id for b in bases}:
                try:
                    norm_ids = {n.id for n in base.norms}
                    listing = call(self.api.list_processes, knowledge, base.id)
                    ids = {p["id"] for p in listing}
                    if process_id and process_id not in ids:
                        issue("process_not_found:" + base.id, "The requested process ID is not available in the assigned domain.")
                    process_hits = [] if process_id else call(
                        self.api.search, knowledge, search, "processo", domain=base.id, allowed_ids=ids
                    )
                    result.context["search_results"].extend(
                        {**h.model_dump(), "domain": base.id} for h in process_hits
                    )
                    matches = {h.fonte for h in process_hits}
                    for item in listing:
                        identifier = remote_template_id(base.id, item["id"])
                        if process_id and item["id"] != process_id:
                            continue
                        if (
                            not process_id
                            and identifier != selected_id
                            and item["id"] not in matches
                            and not (_terms(query) & _terms(item["nome"]))
                        ):
                            continue
                        if item.get("exemplo") is True and not self.allow_synthetic:
                            continue
                        process = call(self.api.get_process, knowledge, base.id, item["id"], ids)
                        if process.get("exemplo") is True and not self.allow_synthetic:
                            continue
                        source = f"{self.api.base_url}/dominios/{base.id}/processos/{item['id']}"
                        template = normalize_process_model(
                            process,
                            source=source,
                            template_id=identifier,
                            version=sha256(json.dumps(process, sort_keys=True).encode()).hexdigest(),
                        )
                        if any(f.field_type not in team_field_types() for f in template.fields):
                            raise KnowledgeApiError("unsupported_baseline_field_type")
                        result.candidates.append(template)
                        result.context["process_previews"].append(process)
                        result.context["process_candidates"].append(
                            {
                                "template_id": identifier,
                                "domain": base.id,
                                "process_id": item["id"],
                                "name": template.name,
                            }
                        )
                        if identifier == selected_id:
                            result.template = template
                            result.context["process_baseline"] = process
                            for norm_id in sorted(_baseline_laws(process)):
                                if norm_id in norm_ids:
                                    required_targets.append((base.id, norm_id))
                except KnowledgeApiError as exc:
                    issue("process_baseline:" + base.id, str(exc))
                except (KeyError, TypeError, ValueError):
                    issue("process_baseline:" + base.id, "Process baseline does not match the supported field schema.")
            try:
                norm_ids = {n.id for n in base.norms}
                hits = call(
                    self.api.search,
                    knowledge,
                    search,
                    "legislacao",
                    domain=base.id,
                    allowed_ids=norm_ids,
                )
                result.context["search_results"].extend(
                    {**h.model_dump(), "domain": base.id} for h in hits
                )
                norm_targets.extend((base.id, h.fonte) for h in hits)
                # Guide relevance can identify a law even when the search index has no hit.
                for norm in base.norms:
                    if _terms(query) & _terms(norm.title + " " + norm.relevance):
                        norm_targets.append((base.id, norm.id))
            except KnowledgeApiError as exc:
                issue("knowledge_base:" + base.id, str(exc))
            except (KeyError, TypeError, ValueError):
                issue(
                    "process_baseline:" + base.id,
                    "Process baseline does not match the supported field schema.",
                )

        unique_targets = list(dict.fromkeys([*required_targets, *norm_targets]))
        if len(unique_targets) > 4:
            issue(
                "legal_retrieval_budget",
                "Additional relevant laws require a narrower follow-up search.",
            )
        for base_id, norm_id in unique_targets[:4]:
            try:
                norm = call(self.api.get_norm, knowledge, base_id, norm_id)
                evidence = self._articles(norm, base_id, search, retained_evidence or [])
                result.evidence.extend(evidence)
                if not evidence:
                    issue(
                        "law_text:" + norm_id,
                        "No citable article with an official source URL was found in the full-text response.",
                    )
            except KnowledgeApiError as exc:
                issue("law_text:" + norm_id, str(exc))
        try:
            documents = call(self.api.list_system)
            system_ids = {d["id"] for d in documents}
            hits = call(self.api.search, knowledge, search, "sistema", allowed_ids=system_ids)
            for hit in hits[:2]:
                document = call(self.api.get_system, hit.fonte, system_ids)
                if document.id not in {d["id"] for d in result.context["system_documents"]}:
                    result.context["system_documents"].append(document.model_dump())
            result.context["search_results"].extend(h.model_dump() for h in hits)
        except KnowledgeApiError as exc:
            issue("system_documentation", str(exc))

        issue(
            "remote_legal_validation",
            "API knowledge does not verify legal currentness, municipal applicability or completeness of local rules.",
        )
        return result

    def _articles(self, norm, base_id, query, retained):
        jurisdiction = {"municipal": "municipal", "estadual": "state", "federal": "federal"}.get(
            norm.sphere
        )
        if not jurisdiction or not norm.officialUrl:
            return []
        text = norm.text
        checksum = sha256(text.encode()).hexdigest()
        candidates = []
        counts = {}
        spans = article_spans(text)
        for span in spans:
            counts[span["article"]] = counts.get(span["article"], 0) + 1
        terms = _terms(query)
        retained_ids = {e["chunk_id"] for e in retained}
        for span in spans:
            if counts[span["article"]] != 1:
                continue  # Repeated numbering needs human review, not automatic legal claims.
            for start, end in split_span(text, span["start"], span["end"]):
                excerpt = text[start:end]
                identity = f"{base_id}/{norm.id}:{checksum}:{start}:{end}"
                chunk_id = "api_law_" + sha256(identity.encode()).hexdigest()
                score = len(terms & _terms(excerpt))
                if score == 0 and chunk_id not in retained_ids:
                    continue
                try:
                    evidence = LegalEvidence(
                        chunk_id=chunk_id,
                        document_id=f"{base_id}/{norm.id}",
                        municipality_id=self.scope.municipality_id,
                        article=span["article"],
                        jurisdiction=jurisdiction,
                        source_url=norm.officialUrl,
                        source_sha256=checksum,
                        excerpt=excerpt,
                        effective_status="unverified",
                        applicability="unverified",
                        verified_at=datetime.now(UTC).date().isoformat(),
                        knowledge_base_id=base_id,
                        norm_id=norm.id,
                        retrieval_url=f"{self.api.base_url}/api/v1/norm-bases/{base_id}/norms/{norm.id}",
                    )
                except ValidationError:
                    continue
                candidates.append((chunk_id in retained_ids, score, start, evidence))
        candidates.sort(key=lambda x: (-x[0], -x[1], x[2]))
        return [item[3] for item in candidates[:4]]
