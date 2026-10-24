"""Offline ingestion, retrieval, citation and municipality-boundary checks."""

import json
from copy import deepcopy

import pytest
from agents.app.paths import REPOSITORY_ROOT
from agents.app.rag.ingest import prepare_corpus
from agents.app.rag.loaders import load_documents, load_manifest
from agents.app.rag.schemas import ChunkSettings, CorpusManifest
from agents.app.rag.workflow import MunicipalRag
from langchain_core.runnables import RunnableLambda
from pydantic import ValidationError

EXAMPLE_MANIFEST = REPOSITORY_ROOT / "agents/examples/rag/manifest.synthetic.json"


@pytest.fixture(autouse=True)
def disable_external_tracing(monkeypatch):
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    monkeypatch.setenv("LANGCHAIN_TRACING_V2", "false")


class StructuredModel:
    def __init__(self, **responses):
        self.responses = responses
        self.calls = []

    def with_structured_output(self, schema):
        def respond(messages):
            self.calls.append((schema.__name__, messages))
            return schema.model_validate(self.responses[schema.__name__].pop(0))

        return RunnableLambda(respond)


class Retriever:
    def __init__(self, documents):
        self.scope = load_manifest(EXAMPLE_MANIFEST).scope
        self.documents = documents
        self.queries = []

    def search(self, query):
        self.queries.append(query)
        return deepcopy(self.documents)


def evidence_document():
    return prepare_corpus(EXAMPLE_MANIFEST).chunks[0]


def test_prepare_is_offline_deterministic_and_keeps_source_provenance():
    first = prepare_corpus(EXAMPLE_MANIFEST)
    second = prepare_corpus(EXAMPLE_MANIFEST)
    assert [chunk.id for chunk in first.chunks] == [chunk.id for chunk in second.chunks]
    assert first.manifest.data_kind == "synthetic"
    for chunk in first.chunks:
        assert chunk.metadata["municipality_id"] == "example-city"
        assert chunk.metadata["document_id"] == "demo-permit-guide"
        assert chunk.metadata["chunk_id"] == chunk.id
        assert len(chunk.metadata["content_sha256"]) == 64
        assert chunk.metadata["start_index"] >= 0
        assert chunk.metadata["page"] == 0
        assert "version" not in chunk.metadata
        assert len(chunk.page_content) <= first.settings.chunk_size


def test_changed_content_and_chunk_configuration_change_chunk_ids(tmp_path):
    manifest = load_manifest(EXAMPLE_MANIFEST)
    (tmp_path / manifest.documents[0].path).write_text("Synthetic text. " * 100, encoding="utf-8")
    path = tmp_path / "manifest.json"
    path.write_text(manifest.model_dump_json(), encoding="utf-8")
    first = prepare_corpus(path)
    smaller = prepare_corpus(path, ChunkSettings(chunk_size=200, chunk_overlap=30))
    assert len(smaller.chunks) > len(first.chunks)
    assert {chunk.id for chunk in smaller.chunks}.isdisjoint(chunk.id for chunk in first.chunks)
    (tmp_path / manifest.documents[0].path).write_text(
        "Different synthetic text.", encoding="utf-8"
    )
    assert prepare_corpus(path).chunks[0].id != first.chunks[0].id


def test_manifest_rejects_path_escape_duplicates_and_invalid_overlap(tmp_path):
    manifest = load_manifest(EXAMPLE_MANIFEST)
    outside = tmp_path / "outside.txt"
    outside.write_text("Synthetic unrelated file", encoding="utf-8")
    inside = tmp_path / "inside"
    inside.mkdir()
    altered = manifest.model_dump(mode="json")
    altered["documents"][0]["path"] = "../outside.txt"
    with pytest.raises(ValueError, match="inside"):
        load_documents(CorpusManifest.model_validate(altered), inside)
    altered["documents"][0]["path"] = str(outside)
    with pytest.raises(ValueError, match="relative"):
        load_documents(CorpusManifest.model_validate(altered), inside)
    altered["documents"].append(altered["documents"][0])
    with pytest.raises(ValidationError, match="unique"):
        CorpusManifest.model_validate(altered)
    with pytest.raises(ValidationError, match="smaller"):
        ChunkSettings(chunk_size=100, chunk_overlap=100)


def test_missing_and_empty_sources_do_not_publish_partial_corpus(tmp_path):
    manifest = load_manifest(EXAMPLE_MANIFEST)
    with pytest.raises(FileNotFoundError):
        load_documents(manifest, tmp_path)
    (tmp_path / manifest.documents[0].path).write_text(" \n ", encoding="utf-8")
    with pytest.raises(ValueError, match="unreadable"):
        load_documents(manifest, tmp_path)


def test_grade_then_generate_returns_only_real_citations():
    doc = evidence_document()
    model = StructuredModel(
        RelevanceGrade=[{"relevant_chunk_ids": [doc.id]}],
        GroundedAnswer=[
            {
                "supported": True,
                "answer": "This synthetic guide describes triage.",
                "citation_ids": [doc.id],
            }
        ],
    )
    retriever = Retriever([doc])
    result = MunicipalRag(model, retriever).search("How does the fictional triage work?")
    assert result.status == "answered"
    assert result.attempts == 1
    assert [source.chunk_id for source in result.sources] == [doc.id]
    assert result.sources[0].version is None
    assert result.sources[0].data_kind == "synthetic"
    assert result.is_employee_answer is False


def test_irrelevant_documents_trigger_one_rewrite_preserving_original_question():
    doc = evidence_document()
    model = StructuredModel(
        RelevanceGrade=[{"relevant_chunk_ids": []}, {"relevant_chunk_ids": [doc.id]}],
        RewrittenQuery=[{"query": "fictional application triage"}],
        GroundedAnswer=[
            {
                "supported": True,
                "answer": "Synthetic triage checks completeness.",
                "citation_ids": [doc.id],
            }
        ],
    )
    retriever = Retriever([doc])
    question = "Which checks come first?"
    result = MunicipalRag(model, retriever).search(question)
    assert retriever.queries == [question, "fictional application triage"]
    assert result.attempts == 2
    generation = next(messages for name, messages in model.calls if name == "GroundedAnswer")
    assert json.loads(generation[-1].content)["question"] == question


def test_empty_retrieval_stops_at_budget_and_never_generates_an_answer():
    model = StructuredModel(RewrittenQuery=[{"query": "clearer question"}])
    retriever = Retriever([])
    result = MunicipalRag(model, retriever).search("A question")
    assert result.status == "no_evidence"
    assert result.answer is None
    assert result.sources == []
    assert len(retriever.queries) == 2
    assert [name for name, _ in model.calls] == ["RewrittenQuery"]


@pytest.mark.parametrize(
    "citation_ids,supported", [(["invented-source"], True), ([], True), ([], False)]
)
def test_unsupported_or_invented_answer_citations_abstain(citation_ids, supported):
    doc = evidence_document()
    model = StructuredModel(
        RelevanceGrade=[{"relevant_chunk_ids": [doc.id]}],
        GroundedAnswer=[
            {"supported": supported, "answer": "Unsupported", "citation_ids": citation_ids}
        ],
    )
    result = MunicipalRag(model, Retriever([doc])).search("Question")
    assert result.status == "no_evidence"
    assert result.answer is None
    assert not result.sources


def test_foreign_municipal_document_is_rejected_before_model_call():
    doc = evidence_document()
    doc.metadata["municipality_id"] = "another-city"
    model = StructuredModel()
    with pytest.raises(ValueError, match="scope"):
        MunicipalRag(model, Retriever([doc])).search("Question")
    assert not model.calls


def test_foreign_corpus_and_invented_grade_citations_are_rejected():
    doc = evidence_document()
    doc.metadata["corpus_id"] = "another-corpus"
    with pytest.raises(ValueError, match="scope"):
        MunicipalRag(StructuredModel(), Retriever([doc])).search("Question")
    model = StructuredModel(RelevanceGrade=[{"relevant_chunk_ids": ["invented"]}])
    with pytest.raises(ValueError, match="unretrieved"):
        MunicipalRag(model, Retriever([evidence_document()])).search("Question")


def test_graph_has_no_hidden_evidence_from_previous_invocation():
    doc = evidence_document()
    model = StructuredModel(
        RelevanceGrade=[{"relevant_chunk_ids": [doc.id]}, {"relevant_chunk_ids": []}],
        GroundedAnswer=[
            {"supported": True, "answer": "Synthetic source answer", "citation_ids": [doc.id]}
        ],
    )
    rag = MunicipalRag(model, Retriever([doc]), max_attempts=1)
    assert rag.search("First question").sources
    assert rag.search("Unrelated second question").sources == []


def test_rag_rejects_unknown_or_mismatched_session_municipality():
    rag = MunicipalRag(StructuredModel(), Retriever([]))
    rag.validate_municipality(" Example CITY ")
    for name in (None, "Other City"):
        with pytest.raises(ValueError, match="municipality"):
            rag.validate_municipality(name)


def test_no_scope_argument_is_exposed_to_the_model():
    from agents.app.agent.tools import build_tools
    from agents.app.knowledge.catalog import JsonProcessCatalog

    search = next(
        tool
        for tool in build_tools(JsonProcessCatalog([]))
        if tool.name == "search_municipal_documents"
    )
    assert set(search.args) == {"query"}
    result = json.loads(search.invoke({"query": "What is the local deadline?"}))
    assert result["status"] == "not_configured"
    assert result["answer"] is None
    assert not result["sources"]


def test_cli_preview_neither_embeds_nor_writes_an_index(monkeypatch, capsys, tmp_path):
    from agents.app.rag import providers
    from agents.scripts.ingest_municipal_docs import main

    def embedding_must_not_run():
        raise AssertionError("Preview must not request embeddings")

    index_dir = tmp_path / "index"
    monkeypatch.setattr(providers, "embeddings_from_environment", embedding_must_not_run)
    monkeypatch.setattr(
        "sys.argv", ["ingest", str(EXAMPLE_MANIFEST), "--index-dir", str(index_dir)]
    )
    assert main() == 0
    captured = capsys.readouterr()
    result = json.loads(captured.out)
    assert result["mode"] == "preview"
    assert result["chunk_count"] > 0
    assert "licensing clerk" not in captured.out
    assert not captured.err
    assert not index_dir.exists()


def test_cli_ingestion_failure_does_not_print_source_details(monkeypatch, capsys, tmp_path):
    from agents.scripts.ingest_municipal_docs import main

    missing = tmp_path / "sensitive-document-title.json"
    monkeypatch.setattr("sys.argv", ["ingest", str(missing)])
    assert main() == 1
    captured = capsys.readouterr()
    assert not captured.out
    assert "sensitive-document-title" not in captured.err
    assert "No new index snapshot was activated" in captured.err
