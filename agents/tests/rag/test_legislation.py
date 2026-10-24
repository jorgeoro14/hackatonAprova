"""Exact article boundaries and retrieval-ready source integrity."""

import json
from hashlib import sha256

from agents.app.rag.legislation import article_spans, build_lexical_index, search_laws, split_span


def test_wrapped_formatted_suffixed_and_repeated_article_numbers():
    text = "**Art. 1º** A\r\n§ 1º Related\r\n\r\nArt.\r\n8º-A. B\r\nArt. 10-A. C\r\n**Art.** 1. D"
    spans = article_spans(text)
    assert [(s["article"], s["occurrence"]) for s in spans] == [
        ("1", 1),
        ("8-A", 1),
        ("10-A", 1),
        ("1", 2),
    ]
    assert "§ 1º Related" in text[spans[0]["start"] : spans[0]["end"]]


def test_large_article_splits_preserve_every_character():
    text = "Paragraph with related provisions.\n\n" * 600
    spans = split_span(text, 0, len(text))
    assert "".join(text[start:end] for start, end in spans) == text
    assert max(end - start for start, end in spans) <= 6500


def test_lexical_index_is_read_only_and_query_syntax_is_not_executed(tmp_path):
    path = tmp_path / "index.sqlite3"
    chunks = [{"chunk_id": "one", "document_id": "test", "text": "Identificação do requerente"}]
    build_lexical_index(path, chunks)
    assert search_laws(path, 'identificacao " OR *')[0]["chunk_id"] == "one"
    assert search_laws(path, "unmatched") == []


def test_collected_source_checksums_article_offsets_and_exclusions():
    from agents.app.paths import REPOSITORY_ROOT

    root = REPOSITORY_ROOT / "knowledge_base"
    manifest = json.loads((root / "metadata/manifest.json").read_text(encoding="utf-8"))
    documents = {d["document_id"]: d for d in manifest["documents"]}
    for source in documents.values():
        raw = (root / source["local_path"]).read_bytes()
        assert len(raw) == source["size_bytes"]
        assert sha256(raw).hexdigest() == source["sha256"]
        if source.get("repository_sha256"):
            assert sha256(raw).hexdigest() == source["repository_sha256"]
    for line in (root / "chunks/articles.jsonl").read_text(encoding="utf-8").splitlines():
        chunk = json.loads(line)
        source = documents[chunk["document_id"]]
        text = (root / source["local_path"]).read_bytes().decode("utf-8")
        assert text[chunk["start_index"] : chunk["end_index"]] == chunk["text"]
        assert chunk["article"] in source["selected_articles"]
        assert chunk["requires_human_review"] is True
    assert documents["repo-14133"]["chunk_count"] == 0
    assert documents["repo-140"]["chunk_count"] == 0
    assert documents["repo-pr-constitution"]["chunk_count"] == 0
    assert manifest["embedding_status"] == "not_generated"
