"""Preview municipal chunks offline; embed only when --embed is explicitly supplied."""

import argparse
import json
import sys
from pathlib import Path

from ..app.rag.ingest import prepare_corpus
from ..app.rag.schemas import ChunkSettings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "manifest", type=Path, help="Local corpus manifest with relative source paths"
    )
    parser.add_argument("--chunk-size", type=int, default=1000)
    parser.add_argument("--strategy", choices=["recursive", "markdown"], default="recursive")
    parser.add_argument("--chunk-overlap", type=int, default=200)
    parser.add_argument(
        "--embed", action="store_true", help="Send chunks to the embedding provider"
    )
    parser.add_argument(
        "--index-dir", type=Path, help="Required with --embed; keep under agents/.local/"
    )
    args = parser.parse_args()
    if args.embed and args.index_dir is None:
        parser.error("--embed requires --index-dir")
    try:
        settings = ChunkSettings(
            strategy=args.strategy, chunk_size=args.chunk_size, chunk_overlap=args.chunk_overlap
        )
        corpus = prepare_corpus(args.manifest, settings)
        summary = {
            "mode": "embed" if args.embed else "preview",
            "scope": corpus.manifest.scope.model_dump(),
            "data_kind": corpus.manifest.data_kind,
            "document_count": len(corpus.manifest.documents),
            "chunk_count": len(corpus.chunks),
            "chunk_settings": settings.model_dump(),
        }
        if args.embed:
            from ..app.rag.providers import embeddings_from_environment
            from ..app.rag.store import build_index

            embeddings, spec = embeddings_from_environment()
            descriptor = build_index(corpus, args.index_dir, embeddings, spec)
            summary["collection_name"] = descriptor.collection_name
            summary["embedding"] = descriptor.embedding.model_dump()
    except Exception:  # noqa: BLE001 - source/embedding errors may contain municipal text
        print(
            "Ingestion failed. Check the manifest, source readability, optional rag dependencies "
            "and embedding settings. No new index snapshot was activated.",
            file=sys.stderr,
        )
        return 1
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
