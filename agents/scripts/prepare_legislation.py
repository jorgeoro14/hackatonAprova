"""Rebuild the curated Cascavel article corpus offline; never create embeddings."""

import csv
import json
from hashlib import sha256
from pathlib import Path

from agents.app.rag.legislation import article_spans, build_lexical_index, prepare_chunks

ROOT = Path(__file__).resolve().parents[2] / "knowledge_base"


def main():
    catalog = json.loads((ROOT / "metadata/source-catalog.json").read_text(encoding="utf-8"))
    documents, chunks = [], []
    (ROOT / "chunks").mkdir(exist_ok=True)
    (ROOT / "reports").mkdir(exist_ok=True)
    for source in catalog["documents"]:
        path = ROOT / source["local_path"]
        raw = path.read_bytes()
        text = raw.decode("utf-8")
        source = {**source, "size_bytes": len(raw), "sha256": sha256(raw).hexdigest()}
        spans = article_spans(text)
        prepared, excluded = prepare_chunks(source, text)
        source.update(article_blocks=len(spans), chunk_count=len(prepared), exclusions=excluded)
        documents.append(source)
        chunks.extend(prepared)
    with (ROOT / "chunks/articles.jsonl").open("w", encoding="utf-8", newline="\n") as f:
        for chunk in chunks:
            f.write(json.dumps(chunk, ensure_ascii=False) + "\n")
    build_lexical_index(ROOT / "chunks/lexical.sqlite3", chunks)
    manifest = {
        **{key: value for key, value in catalog.items() if key != "documents"},
        "documents": documents,
        "chunk_count": len(chunks),
        "embedding_status": "not_generated",
        "lexical_index": "chunks/lexical.sqlite3",
        "semantic_input": "chunks/articles.jsonl",
        "archived_text_bytes": sum(d["size_bytes"] for d in documents),
    }
    (ROOT / "metadata/manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    columns = [
        "title",
        "jurisdiction",
        "repository_path",
        "local_path",
        "size_bytes",
        "article_blocks",
        "relevance",
        "service_types",
        "effective_status",
        "source_url",
        "index_policy",
    ]
    with (ROOT / "reports/inventory.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows({**d, "service_types": ";".join(d["service_types"])} for d in documents)
    table = [
        "# Collected legislative texts",
        "",
        (
            "Article counts are detected article blocks, including quoted amendments and repeated "
            "historical/transitional numbers; they are not a count of operative requirements."
        ),
        "",
        (
            "| Document | Jurisdiction | Exact repository path | Size (KiB) | Article blocks | "
            "Relevance | Application | Effectiveness | Official source |"
        ),
        "| --- | --- | --- | ---: | ---: | --- | --- | --- | --- |",
    ]
    for d in documents:
        table.append(
            f"| {d['title']} | {d['jurisdiction']} | "
            f"{d['repository_path'] or 'External supplement (no repository file path)'} | "
            f"{d['size_bytes'] / 1024:.2f} | {d['article_blocks']} | {d['relevance']} | "
            f"{', '.join(d['service_types'])} | {d['effective_status']} | "
            f"[Source]({d['source_url']}) |"
        )
    table += ["", "## Selected files", ""]
    table.extend(f"- `{d['local_path']}` — {d['index_policy']}" for d in documents)
    (ROOT / "reports/inventory.md").write_text("\n".join(table) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "documents": len(documents),
                "indexed_documents": sum(d["chunk_count"] > 0 for d in documents),
                "chunks": len(chunks),
                "text_bytes": manifest["archived_text_bytes"],
            }
        )
    )


if __name__ == "__main__":
    main()
