"""One backend-contract request per CLI invocation; JSON output only."""

import argparse
import json
import sys
from pathlib import Path

from ..app.agent.workflow import ProcessInterviewAgent
from ..app.contracts import load_json
from ..app.knowledge.catalog import JsonProcessCatalog
from ..app.rag.providers import chat_from_environment


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", type=Path)
    parser.add_argument("--catalog", type=Path, help="Explicitly supplied trusted process catalog")
    parser.add_argument(
        "--rag-index", type=Path, help="Backend-authorized municipal index directory"
    )
    args = parser.parse_args()
    try:
        catalog = JsonProcessCatalog(load_json(args.catalog) if args.catalog else [])
        model = chat_from_environment(timeout=40)
        municipal_rag = None
        if args.rag_index is not None:
            from ..app.rag.providers import embeddings_from_environment
            from ..app.rag.store import ChromaMunicipalRetriever
            from ..app.rag.workflow import MunicipalRag

            embeddings, spec = embeddings_from_environment()
            retriever = ChromaMunicipalRetriever(args.rag_index, embeddings, spec)
            rag_model = chat_from_environment()
            municipal_rag = MunicipalRag(rag_model, retriever)
        result = ProcessInterviewAgent(model, catalog, municipal_rag).invoke(
            load_json(args.request)
        )
    except Exception:  # noqa: BLE001 - sanitize all CLI failures that may include municipal text
        # Provider/validation exceptions may contain municipal text; do not log them.
        print(
            "Agent request failed; no result was committed. Check configuration and payloads.",
            file=sys.stderr,
        )
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
