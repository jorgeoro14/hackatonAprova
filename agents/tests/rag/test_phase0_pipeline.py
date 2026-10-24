"""Offline Phase 0 regression checks."""

import json

import pytest
from agents.app.paths import REPOSITORY_ROOT
from agents.app.rag.ingest import prepare_corpus
from agents.app.rag.loaders import load_documents, load_manifest
from agents.app.rag.schemas import ChunkSettings, CorpusManifest
from pydantic import ValidationError

EXAMPLE_MANIFEST = REPOSITORY_ROOT / "agents/examples/rag/manifest.synthetic.json"

pytestmark = pytest.mark.phase0


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


def test_markdown_variants_keep_original_offsets_and_phase0_is_preview(
    monkeypatch, capsys, tmp_path
):
    from agents.app.rag.evaluation import load_experiments
    from agents.scripts.rag_phase0 import main

    data = REPOSITORY_ROOT / "agents/tests/rag"
    suite = load_experiments(data / "experiments.json")
    for variant in suite.indexes:
        corpus = prepare_corpus(data / "data/manifest.synthetic.json", variant.chunks)
        for chunk in corpus.chunks:
            original = (data / "data" / chunk.metadata["source"]).read_text(encoding="utf-8")
            start = chunk.metadata["start_index"]
            assert original[start : start + len(chunk.page_content)] == chunk.page_content
            assert len(chunk.page_content) <= variant.chunks.chunk_size
    root = tmp_path / "indexes"
    monkeypatch.setattr("sys.argv", ["phase0", "--index-root", str(root)])
    assert main() == 0
    result = json.loads(capsys.readouterr().out)
    assert result["mode"] == "preview"
    assert len(result["indexes"]) == 2
    assert not root.exists()
