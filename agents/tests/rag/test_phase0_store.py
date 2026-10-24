"""Exercise actual local Chroma using deterministic embeddings, without provider calls."""

import json
from dataclasses import replace

import pytest
from agents.app.paths import REPOSITORY_ROOT
from agents.app.rag.ingest import prepare_corpus
from agents.app.rag.schemas import EmbeddingSpec
from agents.app.rag.store import ChromaMunicipalRetriever, build_index, read_descriptor
from agents.tests.rag.fakes import OfflineEmbeddings as TestEmbeddings

pytest.importorskip("langchain_chroma")


@pytest.fixture
def corpus():
    return prepare_corpus(REPOSITORY_ROOT / "agents/examples/rag/manifest.synthetic.json")


def test_persistent_index_is_idempotent_and_queryable_after_reload(tmp_path, corpus):
    embeddings = TestEmbeddings()
    spec = EmbeddingSpec(model="offline-test-embeddings")
    descriptor = build_index(corpus, tmp_path, embeddings, spec)
    calls = embeddings.document_calls
    assert build_index(corpus, tmp_path, embeddings, spec) == descriptor
    assert embeddings.document_calls == calls
    retriever = ChromaMunicipalRetriever(tmp_path, embeddings, spec)
    documents = retriever.search("application triage")
    assert {doc.id for doc in documents} == {doc.id for doc in corpus.chunks}
    assert all(doc.metadata["municipality_id"] == "example-city" for doc in documents)
    assert embeddings.query_calls == 1


def test_changed_source_activates_new_snapshot_without_stale_chunks(tmp_path, corpus):
    embeddings = TestEmbeddings()
    spec = EmbeddingSpec(model="offline-test-embeddings")
    index_dir = tmp_path / "index"
    first = build_index(corpus, index_dir, embeddings, spec)
    sources = tmp_path / "sources"
    sources.mkdir()
    (sources / corpus.manifest.documents[0].path).write_text(
        "Updated fictional permit guide.", encoding="utf-8"
    )
    manifest = sources / "manifest.json"
    manifest.write_text(corpus.manifest.model_dump_json(), encoding="utf-8")
    updated = prepare_corpus(manifest)
    second = build_index(updated, index_dir, embeddings, spec)
    assert first.collection_name != second.collection_name
    assert read_descriptor(index_dir) == second
    documents = ChromaMunicipalRetriever(index_dir, embeddings, spec).search("permit")
    assert {doc.id for doc in documents} == {doc.id for doc in updated.chunks}
    assert all(doc.id not in {old.id for old in corpus.chunks} for doc in documents)


def test_embedding_model_and_scope_mismatch_fail_before_query(tmp_path, corpus):
    embeddings = TestEmbeddings()
    spec = EmbeddingSpec(model="offline-test-embeddings")
    build_index(corpus, tmp_path, embeddings, spec)
    with pytest.raises(ValueError, match="match"):
        ChromaMunicipalRetriever(tmp_path, embeddings, EmbeddingSpec(model="another-model"))
    assert embeddings.query_calls == 0
    other_manifest = corpus.manifest.model_dump(mode="json")
    other_manifest["scope"]["municipality_id"] = "different-city"
    other_corpus = replace(corpus, manifest=type(corpus.manifest).model_validate(other_manifest))
    with pytest.raises(ValueError, match="separate"):
        build_index(other_corpus, tmp_path, embeddings, spec)


def test_failed_rebuild_keeps_previous_active_snapshot(tmp_path, corpus):
    embeddings = TestEmbeddings()
    first = build_index(
        corpus, tmp_path, embeddings, EmbeddingSpec(model="offline-test-embeddings")
    )

    class FailedEmbeddings(TestEmbeddings):
        def embed_documents(self, texts):
            raise TimeoutError("Synthetic failure")

    with pytest.raises(TimeoutError):
        build_index(corpus, tmp_path, FailedEmbeddings(), EmbeddingSpec(model="new-test-model"))
    assert read_descriptor(tmp_path) == first
    assert (
        json.loads((tmp_path / "index.json").read_text())["collection_name"]
        == first.collection_name
    )


pytestmark = pytest.mark.phase0
