"""One backend-contract request per CLI invocation; JSON output only."""

import argparse
import json
import os
import sys
from pathlib import Path

from .catalog import JsonProcessCatalog
from .contracts import load_json
from .interview import ProcessInterviewAgent


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("request", type=Path)
    parser.add_argument("--catalog", type=Path, help="Explicitly supplied trusted process catalog")
    args = parser.parse_args()
    if os.environ.get("MODEL_PROVIDER") != "openai":
        parser.error("Set MODEL_PROVIDER=openai for the initial CLI adapter")
    model_name = os.environ.get("MODEL_NAME", "").strip()
    api_key = os.environ.get("MODEL_API_KEY", "").strip()
    if not model_name or not api_key:
        parser.error("Set server-side MODEL_NAME and MODEL_API_KEY")
    from langchain_openai import ChatOpenAI

    try:
        catalog = JsonProcessCatalog(load_json(args.catalog) if args.catalog else [])
        model = ChatOpenAI(model=model_name, api_key=api_key, timeout=40, max_retries=0)
        result = ProcessInterviewAgent(model, catalog).invoke(load_json(args.request))
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
