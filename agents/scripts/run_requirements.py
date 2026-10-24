"""Local checkpointed requirements interview. Run from the repository root."""

import argparse
import json
import os
from pathlib import Path

from agents.app.paths import REPOSITORY_ROOT
from agents.app.rag.providers import chat_from_environment
from agents.app.requirements.config import knowledge_from_environment, requirements_scope
from agents.app.requirements.demo import DemoModel, demo_dependencies
from agents.app.requirements.export import export_specification
from agents.app.requirements.retrieval import CuratedLawSearch, load_team_models
from agents.app.requirements.schemas import (
    Capabilities,
    InterviewReply,
    ReviewDecision,
)
from agents.app.requirements.workflow import RequirementsAgent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--thread", required=True)
    parser.add_argument(
        "--db", type=Path, default=REPOSITORY_ROOT / "agents/.local/requirements.sqlite3"
    )
    parser.add_argument(
        "--index", type=Path, default=REPOSITORY_ROOT / "knowledge_base/chunks/lexical.sqlite3"
    )
    parser.add_argument("--capabilities", type=Path)
    parser.add_argument("--allow-synthetic-models", action="store_true")
    parser.add_argument("--demo", action="store_true")
    operation = parser.add_mutually_exclusive_group(required=True)
    operation.add_argument("--start", metavar="MESSAGE")
    operation.add_argument("--reply-json", type=Path)
    operation.add_argument("--review-json", type=Path)
    operation.add_argument("--status", action="store_true")
    parser.add_argument("--process-query")
    parser.add_argument("--mode", choices=["use_existing", "adapt_existing", "create_new"])
    parser.add_argument("--template-id")
    parser.add_argument("--reviewer-role")
    parser.add_argument(
        "--actor-role",
        choices=["municipal_representative", "implementer"],
        default="municipal_representative",
    )
    parser.add_argument("--export", type=Path)
    args = parser.parse_args()
    if args.demo:
        catalog, capabilities = demo_dependencies()
        model = DemoModel()
    else:
        catalog = load_team_models(
            REPOSITORY_ROOT / "knowledge/dominios", allow_synthetic=args.allow_synthetic_models
        )
        capabilities = (
            Capabilities.model_validate_json(args.capabilities.read_text(encoding="utf-8"))
            if args.capabilities
            else Capabilities(source="pending_implementer_vendor_mapping")
        )
        model = None if args.status or args.review_json else chat_from_environment()
        if args.review_json:
            # A revision resumes analysis and therefore needs the model as well.
            raw = json.loads(args.review_json.read_text(encoding="utf-8"))
            if raw.get("decision") == "revise":
                model = chat_from_environment()
    os.environ["LANGGRAPH_STRICT_MSGPACK"] = "true"
    from langgraph.checkpoint.sqlite import SqliteSaver

    args.db.parent.mkdir(parents=True, exist_ok=True)
    with SqliteSaver.from_conn_string(str(args.db)) as checkpointer:
        agent = RequirementsAgent(
            model=model,
            scope=requirements_scope(),
            catalog=catalog,
            laws=CuratedLawSearch(args.index),
            capabilities=capabilities,
            checkpointer=checkpointer,
            reviewer_roles=frozenset({"implementation_specialist"}),
            knowledge_source=None
            if args.demo
            else knowledge_from_environment(
                requirements_scope(), allow_synthetic=args.allow_synthetic_models
            ),
        )
        if args.start:
            agent.start(
                args.thread,
                args.start,
                actor_role=args.actor_role,
                process_query=args.process_query
                or ("information-request-demo" if args.demo else None),
                mode=args.mode or ("adapt_existing" if args.demo else None),
                template_id=args.template_id or ("information-request-demo" if args.demo else None),
            )
        elif args.reply_json:
            agent.respond(
                args.thread,
                InterviewReply.model_validate_json(args.reply_json.read_text(encoding="utf-8")),
                actor_role=args.actor_role,
            )
        elif args.review_json:
            if not args.reviewer_role:
                parser.error(
                    "--reviewer-role is required; the hosting backend must authenticate it"
                )
            agent.review(
                args.thread,
                ReviewDecision.model_validate_json(args.review_json.read_text(encoding="utf-8")),
                reviewer_role=args.reviewer_role,
            )
        snapshot = agent.snapshot(args.thread)
        if not snapshot.values:
            parser.error("No such thread")
        spec = snapshot.values["specification"]
        if args.export:
            export_specification(spec, args.export)
        pending = [i.value for task in snapshot.tasks for i in task.interrupts]
        print(
            json.dumps(
                {
                    "thread": args.thread,
                    "revision": spec["revision"],
                    "status": spec["status"],
                    "data_kind": spec["data_kind"],
                    "change_ids": [c["change_id"] for c in spec["changes"]],
                    "blockers": spec["blockers"],
                    "next": list(snapshot.next),
                    "question": pending[0].get("question") if pending else None,
                    "specification_digest": pending[0].get("specification_digest")
                    if pending
                    else None,
                    "review_error": pending[0].get("error") if pending else None,
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
