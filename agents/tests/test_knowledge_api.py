"""Knowledge API scope, transport and end-to-end graph boundaries, without real data."""

import json
import threading
from copy import deepcopy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from agents.app.knowledge.api import KnowledgeApi, KnowledgeApiError
from agents.app.requirements.comparison import validate_analysis
from agents.app.requirements.config import knowledge_from_environment
from agents.app.requirements.export import export_specification
from agents.app.requirements.remote import ApiKnowledgeSource, remote_template_id
from agents.app.requirements.retrieval import TemplateCatalog
from agents.app.requirements.schemas import AnalysisProposal, InterviewReply
from agents.app.requirements.workflow import RequirementsAgent
from agents.tests.test_requirements import (
    BASE,
    CAPS,
    EVIDENCE,
    SCOPE,
    FakeLaws,
    FakeModel,
    review_for,
)
from langgraph.checkpoint.memory import InMemorySaver

FIXTURE = Path(__file__).parents[1] / "examples/requirements/knowledge-api.synthetic.json"


class SyntheticApi:
    def __init__(self):
        self.data = json.loads(FIXTURE.read_text(encoding="utf-8"))
        self.calls = []
        self.failure = None
        self.extra_hits = []

    def __call__(self, path, params, headers, timeout):
        self.calls.append((path, params, headers, timeout))
        if self.failure:
            raise KnowledgeApiError("request_failed", self.failure)
        if path == "/api/v1/agents/synthetic-agent/knowledge":
            return deepcopy(self.data["knowledge"])
        if path.startswith("/api/v1/norm-bases/"):
            parts = path.split("/")
            return deepcopy(next(n for n in self.data["norms"] if n["id"] == parts[6]))
        if path == "/sistema":
            return [
                {k: v for k, v in d.items() if k != "conteudo"}
                for d in self.data["system_documents"]
            ]
        if path == "/sistema/synthetic-fields":
            return deepcopy(self.data["system_documents"][0])
        if path.startswith("/dominios/") and path.endswith("/processos"):
            domain = path.split("/")[2]
            return [
                {k: p[k] for k in ("id", "nome", "descricao", "exemplo")}
                for p in self.data["processes"]
                if p["dominio"] == domain
            ]
        if path == "/dominios/obras/processos/synthetic-permit":
            return deepcopy(self.data["processes"][0])
        if path == "/busca":
            layer, domain = params["camada"], params.get("dominio")
            sources = {
                "sistema": "synthetic-fields",
                "legislacao": "synthetic-law",
                "processo": "synthetic-permit",
            }
            hits = (
                []
                if domain == "governo-digital"
                else [
                    {
                        "origem": layer,
                        "fonte": sources[layer],
                        "titulo": "Synthetic permit",
                        "texto": "Synthetic search passage only.",
                        "score": 1.0,
                    }
                ]
            )
            return hits + self.extra_hits
        raise AssertionError(f"Unexpected endpoint: {path}")


def setup_remote(*, allow_synthetic=True, **kwargs):
    fake = SyntheticApi()
    api = KnowledgeApi(
        "https://knowledge.example.invalid", "synthetic-token", "synthetic-agent", transport=fake
    )
    return fake, api, ApiKnowledgeSource(api, SCOPE, allow_synthetic=allow_synthetic, **kwargs)


def test_all_read_routes_and_auth_headers_are_used_without_node_agent_calls():
    fake, _, remote = setup_remote()
    selected = remote_template_id("obras", "synthetic-permit")
    result = remote.retrieve("Synthetic permit", selected, SCOPE)
    assert result.template.template_id == selected
    assert result.context["process_baseline"] == fake.data["processes"][0]
    assert result.context["process_baseline"]["fluxo"]["etapas"]
    assert result.context["system_documents"][0]["conteudo"]
    assert len(result.evidence) == 2
    assert all(e.effective_status == e.applicability == "unverified" for e in result.evidence)
    assert all(e.article in {"1", "2"} and e.knowledge_base_id == "obras" for e in result.evidence)
    assert fake.calls[0][0].endswith("/knowledge")
    paths = {c[0] for c in fake.calls}
    assert {
        "/sistema",
        "/sistema/synthetic-fields",
        "/busca",
        "/dominios/obras/processos",
        "/dominios/obras/processos/synthetic-permit",
        "/api/v1/norm-bases/obras/norms/synthetic-law",
    } <= paths
    assert not any(
        "implantacoes" in path or "/chat/" in path or "removed" in path for path in paths
    )
    for path, params, headers, timeout in fake.calls:
        assert 0 < timeout <= 5
        assert ("Authorization" in headers) == path.startswith("/api/v1/")
        if path == "/busca":
            assert params["limite"] == 5
            assert params["camada"] in {"sistema", "legislacao", "processo"}
            if params["camada"] != "sistema":
                assert params["dominio"] in {"obras", "governo-digital"}
    serialized = json.dumps(result.context)
    assert "synthetic-token" not in serialized
    assert "Unavailable test base" not in serialized


def test_unassigned_base_norm_and_undiscovered_resources_cannot_trigger_requests():
    fake, api, _ = setup_remote()
    knowledge = api.load_knowledge()
    count = len(fake.calls)
    operations = [
        lambda: api.get_norm(knowledge, "other", "synthetic-law"),
        lambda: api.get_norm(knowledge, "removed", "synthetic-law"),
        lambda: api.get_norm(knowledge, "obras", "foreign-law"),
        lambda: api.list_processes(knowledge, "other"),
        lambda: api.get_process(knowledge, "obras", "unknown", set()),
        lambda: api.get_system("unknown", set()),
        lambda: api.search(knowledge, "permit", "legislacao", domain="other", allowed_ids=set()),
        lambda: api.search(knowledge, "permit", "processo", allowed_ids=set()),
        lambda: api.search(knowledge, "permit", "all", allowed_ids=set()),
    ]
    for operation in operations:
        with pytest.raises(KnowledgeApiError):
            operation()
    assert len(fake.calls) == count


def test_search_filters_leaked_sources_and_wrong_layers_before_context_or_law_fetch():
    fake, _, remote = setup_remote()
    fake.extra_hits = [
        {
            "origem": "legislacao",
            "fonte": "foreign-law",
            "titulo": "Leak",
            "texto": "OUTSIDE ASSIGNMENT",
            "score": 99.0,
        },
        {
            "origem": "processo",
            "fonte": "unknown",
            "titulo": "Leak",
            "texto": "OUTSIDE ASSIGNMENT",
            "score": 99.0,
        },
    ]
    result = remote.retrieve("Synthetic permit", None, SCOPE)
    assert "OUTSIDE ASSIGNMENT" not in json.dumps(result.context)
    assert all("foreign-law" not in c[0] for c in fake.calls)


@pytest.mark.parametrize("status", [401, 403, 404, 429, 500])
def test_entrypoint_failure_is_closed_and_has_no_unauthenticated_fallback(status):
    fake, _, remote = setup_remote()
    fake.failure = status
    result = remote.retrieve("Synthetic permit", None, SCOPE)
    assert not result.candidates and not result.evidence and not result.context
    assert len(fake.calls) == 1
    assert str(status) in result.issues[0].description


def test_assignment_refresh_removes_previous_citations_and_baseline_access():
    fake, _, remote = setup_remote()
    selected = remote_template_id("obras", "synthetic-permit")
    first = remote.retrieve("Synthetic permit", selected, SCOPE)
    count = len(fake.calls)
    fake.data["knowledge"]["bases"][0]["available"] = False
    second = remote.retrieve(
        "Synthetic permit",
        selected,
        SCOPE,
        retained_evidence=[e.model_dump(mode="json") for e in first.evidence],
    )
    assert not second.template and not second.evidence
    assert all("obras" not in c[0] and c[1].get("dominio") != "obras" for c in fake.calls[count:])
    assert any(i.key == "legal_scope_changed" for i in second.issues)


def test_synthetic_baselines_require_explicit_opt_in_and_scope_is_server_owned():
    _, _, remote = setup_remote(allow_synthetic=False)
    assert not remote.retrieve("Synthetic permit", None, SCOPE).candidates
    with pytest.raises(KnowledgeApiError, match="municipality_scope_mismatch"):
        remote.retrieve(
            "Synthetic permit", None, SCOPE.model_copy(update={"municipality_id": "other"})
        )


def test_summaries_and_relevance_without_article_text_cannot_be_legal_evidence():
    fake, _, remote = setup_remote()
    fake.data["norms"][0]["text"] = "Synthetic summary: pretend an invented requirement exists."
    result = remote.retrieve("Synthetic permit", None, SCOPE)
    assert not result.evidence
    assert any(i.key == "law_text:synthetic-law" for i in result.issues)


@pytest.mark.parametrize("kind", ["agent", "norm", "process"])
def test_mismatched_response_identity_is_not_accepted(kind):
    fake, _, remote = setup_remote()
    if kind == "agent":
        fake.data["knowledge"]["agentId"] = "other-agent"
    elif kind == "norm":
        fake.data["norms"][0]["baseId"] = "other-base"
    else:
        fake.data["processes"][0]["dominio"] = "other-domain"
    result = remote.retrieve(
        "Synthetic permit", remote_template_id("obras", "synthetic-permit"), SCOPE
    )
    if kind in {"agent", "norm"}:
        assert not result.evidence
    if kind in {"agent", "process"}:
        assert result.template is None


def test_domain_pin_cannot_expand_scope_and_keeps_assigned_cross_cutting_guidance():
    fake, _, remote = setup_remote(domain="other")
    assert not remote.retrieve("Synthetic permit", None, SCOPE).context
    assert len(fake.calls) == 1
    _, _, remote = setup_remote(domain="obras")
    result = remote.retrieve("Synthetic permit", None, SCOPE)
    assert {b["id"] for b in result.context["assigned_bases"]} == {"obras", "governo-digital"}


@pytest.mark.parametrize("origin", ["municipality_request", "legal_requirement"])
def test_requirement_notes_reject_fabricated_quotes_and_preserve_valid_sources(origin):
    note = {
        "target_path": "taxas",
        "requirement": "Synthetic fee rule",
        "origin": origin,
        "statements": [{"message_id": "m1", "quote": "Invented municipal answer"}]
        if origin == "municipality_request"
        else [],
        "legal_basis": [{"chunk_id": EVIDENCE.chunk_id, "quote": "Invented legal text"}]
        if origin == "legal_requirement"
        else [],
    }
    invalid = validate_analysis(
        {"requirement_notes": [note]}, BASE, [EVIDENCE], CAPS, {"m1": "Actual synthetic answer"}, {}
    )
    assert invalid.conflicts and not invalid.requirement_notes
    if origin == "municipality_request":
        note["statements"][0]["quote"] = "Actual synthetic answer"
    else:
        note["legal_basis"][0]["quote"] = EVIDENCE.excerpt
    valid = validate_analysis(
        {"requirement_notes": [note, note]},
        BASE,
        [EVIDENCE],
        CAPS,
        {"m1": "Actual synthetic answer"},
        {},
    )
    assert not valid.conflicts
    assert len(valid.requirement_notes) == 1
    assert valid.requirement_notes[0].mapping_status == "pending"
    retained = validate_analysis(
        AnalysisProposal(),
        BASE,
        [EVIDENCE],
        CAPS,
        {"m1": "Actual synthetic answer"},
        {},
        previous_analysis=valid.model_dump(),
    )
    assert retained.requirement_notes == valid.requirement_notes
    assert any(i.key.startswith("questionnaire_mapping:") for i in retained.missing_information)
    if origin == "legal_requirement":
        assert retained.legal_references == [EVIDENCE]
        removed = validate_analysis(
            AnalysisProposal(), BASE, [], CAPS, {}, {}, previous_analysis=retained.model_dump()
        )
        assert removed.conflicts
        assert not removed.legal_references


def test_law_chunk_ids_are_stable_and_retained_articles_are_refetched():
    fake, _, remote = setup_remote()
    first = remote.retrieve("Synthetic permit", None, SCOPE)
    second = remote.retrieve("Synthetic permit", None, SCOPE)
    assert [e.chunk_id for e in first.evidence] == [e.chunk_id for e in second.evidence]
    fake.data["norms"][0]["text"] += "Amended synthetic fixture."
    changed = remote.retrieve("Synthetic permit", None, SCOPE)
    assert {e.chunk_id for e in first.evidence}.isdisjoint(e.chunk_id for e in changed.evidence)


def test_nested_baseline_legal_references_are_prioritized_over_generic_search_matches():
    fake, _, remote = setup_remote()
    summary = fake.data["knowledge"]["bases"][0]["norms"][0]
    for identifier in ["generic-a", "generic-b", "generic-c", "generic-d", "nested-law"]:
        fake.data["knowledge"]["bases"][0]["norms"].append({**summary, "id": identifier})
        fake.data["norms"].append({**fake.data["norms"][0], "id": identifier})
    fake.data["processes"][0]["formulario"]["secoes"][0]["campos"][0]["baseLegal"] = ["nested-law"]
    result = remote.retrieve(
        "Synthetic permit", remote_template_id("obras", "synthetic-permit"), SCOPE
    )
    assert any(e.norm_id == "nested-law" for e in result.evidence)
    assert any(i.key == "legal_retrieval_budget" for i in result.issues)


def test_request_budget_stops_extra_calls_and_reports_incomplete_retrieval():
    fake, _, remote = setup_remote(max_calls=2)
    result = remote.retrieve("Synthetic permit", None, SCOPE)
    assert len(fake.calls) == 2
    assert any("request_budget_exceeded" in i.description for i in result.issues)


def test_graph_uses_full_remote_baseline_then_exports_quote_backed_questionnaire_notes(tmp_path):
    fake, _, remote = setup_remote()

    def proposal(data):
        assert data["knowledge_context"]["process_baseline"]["fluxo"]["etapas"]
        assert data["knowledge_context"]["assigned_bases"][0]["guide"]
        message_id = next(iter(data["statements"]))
        return {
            "requirement_notes": [
                {
                    "target_path": "taxas",
                    "requirement": "Ask the implementer to record the municipal fee rule.",
                    "origin": "municipality_request",
                    "statements": [{"message_id": message_id, "quote": "Record our fee rule"}],
                }
            ]
        }

    model = FakeModel([proposal, {"next_questions": []}])
    runtime = RequirementsAgent(
        model=model,
        scope=SCOPE,
        catalog=TemplateCatalog([]),
        laws=FakeLaws(),
        capabilities=CAPS,
        checkpointer=InMemorySaver(),
        reviewer_roles=frozenset({"implementation_specialist"}),
        knowledge_source=remote,
    )
    initial = runtime.start(
        "remote", "Record our fee rule", process_query="Synthetic permit", mode="adapt_existing"
    )
    assert initial["specification"]["pending_questions"][0]["key"] == "select_template"
    selected = remote_template_id("obras", "synthetic-permit")
    result = runtime.respond(
        "remote",
        InterviewReply(
            message="Use the synthetic baseline",
            selected_template_id=selected,
            answered_question_keys=["select_template"],
        ),
    )
    assert len(result["specification"]["requirement_notes"]) == 1
    assert result["specification"]["implementation_questionnaire_completed"] is False
    assert (
        result["specification"]["knowledge_context"]["process_baseline"]
        == fake.data["processes"][0]
    )
    assert any(
        b["key"].startswith("questionnaire_mapping:") for b in result["specification"]["blockers"]
    )
    decision = review_for(runtime, "remote")
    blocked = runtime.review("remote", decision, reviewer_role="implementation_specialist")
    assert blocked["__interrupt__"][0].value["error"]
    files = export_specification(result["specification"], tmp_path)
    assert all(p.exists() for p in files)
    exported = files[0].read_text(encoding="utf-8")
    assert '"mapping_status": "pending"' in exported
    assert "synthetic-token" not in exported
    assert not any("implantacoes" in c[0] or "/chat/" in c[0] for c in fake.calls)


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com",
        "https://user:secret@example.com",
        "https://example.com/api/v1",
        "https://example.com?token=secret",
        "file:///tmp",
    ],
)
def test_remote_origin_rejects_credentials_paths_and_nonlocal_plain_http(url):
    with pytest.raises(KnowledgeApiError):
        KnowledgeApi(url, "synthetic-token", "synthetic-agent")


def test_environment_requires_all_settings_and_never_defaults_to_an_agent(monkeypatch):
    for name in (
        "KNOWLEDGE_API_BASE_URL",
        "KNOWLEDGE_API_TOKEN",
        "KNOWLEDGE_AGENT_ID",
        "KNOWLEDGE_DOMAIN_ID",
    ):
        monkeypatch.delenv(name, raising=False)
    assert knowledge_from_environment(SCOPE) is None
    monkeypatch.setenv("KNOWLEDGE_API_BASE_URL", "https://example.invalid")
    with pytest.raises(ValueError, match="together"):
        knowledge_from_environment(SCOPE)


def test_real_http_transport_encodes_search_and_never_follows_redirects():
    fake = SyntheticApi()
    seen = []
    malformed = False

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            parsed = urlsplit(self.path)
            seen.append((parsed.path, self.headers.get("Authorization")))
            if parsed.path in {"/sistema", "/api/v1/norm-bases/obras/norms/synthetic-law"}:
                self.send_response(302)
                self.send_header("Location", "/must-not-follow")
                self.end_headers()
                return
            query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
            if parsed.path == "/busca":
                assert query["q"] == "permit & fee?"
                payload = []
            else:
                payload = fake(parsed.path, query, dict(self.headers), 5)
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b"not-json" if malformed else json.dumps(payload).encode())

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        api = KnowledgeApi(
            f"http://127.0.0.1:{server.server_port}", "synthetic-token", "synthetic-agent"
        )
        knowledge = api.load_knowledge()
        assert (
            api.search(
                knowledge,
                "permit & fee?",
                "legislacao",
                domain="obras",
                allowed_ids={"synthetic-law"},
            )
            == []
        )
        with pytest.raises(KnowledgeApiError, match="302"):
            api.list_system()
        with pytest.raises(KnowledgeApiError, match="302"):
            api.get_norm(knowledge, "obras", "synthetic-law")
        api.max_bytes = 32
        with pytest.raises(KnowledgeApiError, match="response_too_large"):
            api.load_knowledge()
        api.max_bytes = 4_000_000
        malformed = True
        with pytest.raises(KnowledgeApiError, match="invalid_json"):
            api.load_knowledge()
        assert seen[0][1] == "Bearer synthetic-token"
        assert seen[1][1] is None
        assert not any(path == "/must-not-follow" for path, _ in seen)
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=2)
