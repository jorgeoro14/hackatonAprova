"""One backend-contract request per CLI invocation; JSON output only."""

import argparse
import json
import os
import sys
from pathlib import Path

from ..app.agent.context import TurnContext
from ..app.agent.workflow import ProcessInterviewAgent
from ..app.contracts import load_json
from ..app.knowledge.catalog import JsonProcessCatalog
from ..app.rag.providers import chat_from_environment
from ..app.rag.schemas import CorpusScope
from ..app.requirements.config import knowledge_from_environment
from ..app.requirements.schemas import Capabilities


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", type=Path)
    parser.add_argument("--catalog", type=Path, help="Explicitly supplied trusted process catalog")
    parser.add_argument(
        "--rag-index", type=Path, help="Backend-authorized municipal index directory"
    )
    parser.add_argument(
        "--scope",
        type=Path,
        help="Trusted server JSON CorpusScope; required for remote API knowledge",
    )
    parser.add_argument("--domain", help="Trusted assigned process domain")
    parser.add_argument(
        "--capabilities", type=Path, help="Reviewed server-side builder capabilities"
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
        request = load_json(args.request)
        scope = (
            CorpusScope.model_validate(load_json(args.scope))
            if args.scope
            else municipal_rag.scope
            if municipal_rag
            else None
        )
        configured = any(
            os.environ.get(name, "").strip()
            for name in (
                "KNOWLEDGE_API_BASE_URL",
                "KNOWLEDGE_API_TOKEN",
                "KNOWLEDGE_AGENT_ID",
                "KNOWLEDGE_DOMAIN_ID",
            )
        )
        if configured and scope is None:
            raise ValueError("Remote knowledge requires a backend-authorized --scope")
        knowledge = knowledge_from_environment(scope) if configured else None
        context = TurnContext.from_request(
            request,
            municipality=scope,
            domain=args.domain or (knowledge.domain if knowledge else None),
            catalog=catalog,
            municipal_rag=municipal_rag,
            knowledge_source=knowledge,
            capabilities=Capabilities.model_validate(load_json(args.capabilities))
            if args.capabilities
            else Capabilities(source="pending_implementer_vendor_mapping"),
        )
        result = ProcessInterviewAgent(model).invoke(
            request,
            context=context,
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
