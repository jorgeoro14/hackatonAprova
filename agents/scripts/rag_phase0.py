"""Phase 0: preview chunk variants; embed only with explicit --embed."""

import json
import sys
from pathlib import Path

from ..app.rag.evaluation import load_experiments
from ..app.rag.ingest import prepare_corpus
from .rag_phase_common import PHASE_DATA, phase_parser


def main() -> int:
    parser = phase_parser(__doc__)
    parser.add_argument(
        "--manifest", type=Path, default=PHASE_DATA / "data" / "manifest.synthetic.json"
    )
    parser.add_argument(
        "--embed", action="store_true", help="Send chunks to the configured embedding provider"
    )
    args = parser.parse_args()
    try:
        suite = load_experiments(args.experiments)
        # Prepare every variant first so malformed source files never trigger partial embedding.
        prepared = [
            (variant.name, prepare_corpus(args.manifest, variant.chunks))
            for variant in suite.indexes
        ]
        summary = {"phase": 0, "mode": "embed" if args.embed else "preview", "indexes": []}
        embeddings = spec = None
        if args.embed:
            from ..app.rag.providers import embeddings_from_environment
            from ..app.rag.store import build_index

            embeddings, spec = embeddings_from_environment()
        for name, corpus in prepared:
            row = {
                "name": name,
                "scope": corpus.manifest.scope.model_dump(),
                "data_kind": corpus.manifest.data_kind,
                "document_count": len(corpus.manifest.documents),
                "chunk_count": len(corpus.chunks),
                "chunk_settings": corpus.settings.model_dump(),
            }
            if args.embed:
                descriptor = build_index(corpus, args.index_root / name, embeddings, spec)
                row["collection_name"] = descriptor.collection_name
            summary["indexes"].append(row)
        print(json.dumps(summary, indent=2))
        return 0
    except Exception:  # noqa: BLE001 - source/provider errors can contain private text
        print(
            "Phase 0 failed. Check the manifest, chunk variants and embedding configuration. No complete suite build is claimed; completed snapshots remain available.",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
