"""Export a validated declarative specification and its implementer review report."""

import json
from pathlib import Path

from .comparison import digest
from .schemas import Specification


def export_specification(specification: dict, destination: Path) -> tuple[Path, Path]:
    spec = Specification.model_validate(specification)
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / "specification.json"
    report = destination / "report.md"
    output.write_text(spec.model_dump_json(indent=2) + "\n", encoding="utf-8")
    lines = [
        "# Requirements specification",
        "",
        f"Municipality: {spec.scope.municipality_name} ({spec.scope.municipality_id})",
        f"Process: {spec.process_name or 'Pending identification'}",
        f"Revision: {spec.revision}; status: {spec.status}; data kind: {spec.data_kind}",
        "Application status: not applied",
        f"Export SHA-256: {digest(spec.model_dump(mode='json'))}",
        "",
        (
            "This is a declarative configuration proposal for an implementer. "
            "Vendor mapping, local legal application and human decisions must be reviewed."
        ),
        "",
        "## Changes",
        "",
    ]
    lines.extend(
        f"- `{c.change_id}`: {c.action} `{c.field_id}`; origin: {c.origin}; "
        f"legal validation: {c.legal_validation}. {c.rationale}"
        for c in spec.changes
    )
    if not spec.changes:
        lines.append("No changes recorded.")
    lines += ["", "## Legal references", ""]
    lines.extend(
        f"- `{e.chunk_id}`: {e.document_id}, article {e.article}; "
        f"effectiveness: {e.effective_status}; applicability: {e.applicability}; "
        f"checked: {e.verified_at}. [Official source]({e.source_url})"
        for e in spec.legal_references
    )
    lines += ["", "## Unresolved information and conflicts", ""]
    lines.extend(f"- {b.key}: {b.description}" for b in spec.blockers)
    lines += ["", "## Next questions", ""]
    lines.extend(f"- {q.key}: {q.text}" for q in spec.pending_questions)
    lines += [
        "",
        "## Resulting field preview",
        "",
        "```json",
        json.dumps([f.model_dump() for f in spec.resulting_fields], ensure_ascii=False, indent=2),
        "```",
        "",
    ]
    report.write_text("\n".join(lines), encoding="utf-8")
    return output, report
