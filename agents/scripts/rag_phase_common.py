"""Shared phase planning, explicit live execution and local report handling."""

import argparse
import json
import sys
from hashlib import sha256
from pathlib import Path

from ..app.paths import AGENTS_ROOT
from ..app.rag.evaluation import (
    evaluate_agentic_rag,
    evaluate_retrieval,
    load_dataset,
    load_experiments,
    summarize,
    write_report,
)
from ..app.rag.store import read_descriptor

PHASE_DATA = AGENTS_ROOT / "tests" / "rag"
DEFAULT_INDEX_ROOT = AGENTS_ROOT / ".local" / "rag" / "phases"


def phase_parser(description: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("--experiments", type=Path, default=PHASE_DATA / "experiments.json")
    parser.add_argument("--index-root", type=Path, default=DEFAULT_INDEX_ROOT)
    return parser


def run_phase(phase: int) -> int:
    parser = phase_parser(
        f"RAG Phase {phase}: plan offline; --live explicitly enables provider calls"
    )
    parser.add_argument("--dataset", type=Path, default=PHASE_DATA / "rag_queries.json")
    parser.add_argument("--experiment", help="Select one named experiment")
    parser.add_argument("--fast", action="store_true", help="Use at most three queries")
    parser.add_argument(
        "--max", type=int, dest="maximum", help="Maximum number of queries per experiment"
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Run against the prepared index using configured providers",
    )
    parser.add_argument("--output-dir", type=Path, default=PHASE_DATA / "analysis")
    if phase == 3:
        parser.add_argument(
            "--judge", action="store_true", help="Also call the explicit EVAL_MODEL_NAME judge"
        )
    args = parser.parse_args()
    if args.maximum is not None and args.maximum < 1:
        parser.error("--max must be positive")
    try:
        suite = load_experiments(args.experiments)
        dataset = load_dataset(args.dataset)
        selected = [
            exp
            for exp in suite.experiments
            if args.experiment is None or exp.name == args.experiment
        ]
        if phase == 1:
            selected = [exp for exp in selected if exp.retrieval.search_type == "vector"]
        if not selected:
            raise ValueError("No compatible experiment selected")
        if phase == 3 and args.experiment is None:
            selected = selected[:1]
        count = min(
            len(dataset.queries),
            args.maximum or len(dataset.queries),
            3 if args.fast else len(dataset.queries),
        )
        queries = dataset.queries[:count]
        if args.fast and count > 1 and not any(case.should_abstain for case in queries):
            negative = next((case for case in dataset.queries if case.should_abstain), None)
            if negative is not None:
                queries = [*queries[:-1], negative]
        dataset = dataset.model_copy(update={"queries": queries})
        plan = {
            "phase": phase,
            "mode": "live" if args.live else "plan",
            "scope": dataset.scope.model_dump(),
            "data_kind": dataset.data_kind,
            "case_count_per_experiment": count,
            "case_ids": [case.id for case in dataset.queries],
            "experiments": [exp.model_dump() for exp in selected],
            "judge_enabled": bool(getattr(args, "judge", False)),
        }
        if not args.live:
            print(json.dumps(plan, indent=2))
            return 0

        # Preflight all selected snapshots before constructing clients or making calls.
        descriptors = {}
        variants = {variant.name: variant for variant in suite.indexes}
        for experiment in selected:
            descriptor = read_descriptor(args.index_root / experiment.index)
            if descriptor.scope != dataset.scope or descriptor.data_kind != dataset.data_kind:
                raise ValueError("Index and dataset scope/data kind differ")
            if descriptor.chunk_settings != variants[experiment.index].chunks:
                raise ValueError("Index chunk settings differ from experiment configuration")
            descriptors[experiment.index] = descriptor
        from ..app.rag.providers import chat_from_environment, embeddings_from_environment
        from ..app.rag.store import ChromaMunicipalRetriever
        from ..app.rag.workflow import MunicipalRag

        embeddings, spec = embeddings_from_environment()
        if any(descriptor.embedding != spec for descriptor in descriptors.values()):
            raise ValueError("Index and query embedding settings differ")
        model = chat_from_environment() if phase == 3 else None
        judge = chat_from_environment("EVAL_MODEL_NAME") if plan["judge_enabled"] else None
        rows = []
        for experiment in selected:
            retriever = ChromaMunicipalRetriever(
                args.index_root / experiment.index, embeddings, spec, settings=experiment.retrieval
            )
            if phase == 3:
                rows.extend(
                    evaluate_agentic_rag(dataset, MunicipalRag(model, retriever), experiment, judge)
                )
            else:
                rows.extend(evaluate_retrieval(dataset, retriever, experiment))
        metadata = {
            **plan,
            "embedding": spec.model_dump(),
            "indexes": {name: descriptor.model_dump() for name, descriptor in descriptors.items()},
            "chat_model": model.model_name if model else None,
            "judge_model": judge.model_name if judge else None,
            "evaluation_target": "agentic_rag_subgraph" if phase == 3 else "retriever",
            "dataset_sha256": sha256(args.dataset.read_bytes()).hexdigest(),
            "experiments_sha256": sha256(args.experiments.read_bytes()).hexdigest(),
            "dependency_lock_sha256": sha256((AGENTS_ROOT / "uv.lock").read_bytes()).hexdigest(),
        }
        write_report(args.output_dir, phase, dataset, suite, rows, metadata)
        print(json.dumps({"phase": phase, "mode": "live", "summary": summarize(rows)}, indent=2))
        return 1 if any(row["status"] == "error" for row in rows) else 0
    except Exception:  # noqa: BLE001 - never log raw source/provider errors
        print(
            "Phase failed. Check dataset/experiment schemas, index scope/settings and provider configuration. No successful run is claimed.",
            file=sys.stderr,
        )
        return 1
