"""Search the prepared article corpus without embeddings or provider calls."""

import argparse
import json

from agents.app.paths import REPOSITORY_ROOT
from agents.app.rag.legislation import search_laws


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query")
    parser.add_argument("--k", type=int, default=5)
    args = parser.parse_args()
    results = search_laws(
        REPOSITORY_ROOT / "knowledge_base/chunks/lexical.sqlite3", args.query, k=args.k
    )
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
