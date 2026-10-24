"""Local public-documentation reference, separate from municipal process catalogs."""

import argparse
import json
from copy import deepcopy
from pathlib import Path
from typing import Literal

from .contracts import load_json

AprovaResource = Literal["process", "forms", "templates", "dispatches", "blueprints"]
KNOWLEDGE_ROOT = Path(__file__).with_name("knowledge") / "aprova"
API_CONTRACT = load_json(KNOWLEDGE_ROOT / "api-contract.json")
RESOURCE_GUIDE = load_json(KNOWLEDGE_ROOT / "resources.json")
RESPONSE_TEMPLATES = load_json(KNOWLEDGE_ROOT / "response-templates.json")


def get_reference(resource: str, operation_id: str | None = None) -> dict:
    """Return summaries, or one full operation schema, with explicit provenance."""
    if resource not in RESOURCE_GUIDE["resources"]:
        raise ValueError("Unknown Aprova reference resource")
    operations = {
        name: operation
        for name, operation in API_CONTRACT["operations"].items()
        if operation["resource"] == resource
    }
    if operation_id is not None:
        if operation_id not in operations:
            raise ValueError("Operation does not belong to this Aprova reference resource")
        selected = {operation_id: operations[operation_id]}
    else:
        selected = {}
        for name, operation in operations.items():
            body = operation["request_body"]
            selected[name] = {
                "method": operation["method"],
                "path": operation["path"],
                "parameters": operation["parameters"],
                "request_fields": sorted(body["schema"].get("properties", {})) if body else [],
                "response_statuses": list(operation["responses"]),
            }
    return deepcopy(
        {
            "source_kind": API_CONTRACT["source_kind"],
            "source_url": API_CONTRACT["source_url"],
            "retrieved_at": API_CONTRACT["retrieved_at"],
            "execution_policy": API_CONTRACT["execution_policy"],
            "is_municipal_catalog": False,
            "is_employee_answer": False,
            "is_official_developer_questionnaire": False,
            "resource": resource,
            "guide": RESOURCE_GUIDE["resources"][resource],
            "operations": selected,
            "response_templates": {
                "data_kind": RESPONSE_TEMPLATES["data_kind"],
                "usage": RESPONSE_TEMPLATES["usage"],
                "templates": [
                    template
                    for template in RESPONSE_TEMPLATES["templates"]
                    if template["operation_id"] in selected
                ],
            },
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("resource", choices=sorted(RESOURCE_GUIDE["resources"]))
    parser.add_argument(
        "--operation-id", help="Include the full schema for one documented operation"
    )
    args = parser.parse_args()
    try:
        reference = get_reference(args.resource, args.operation_id)
    except ValueError as error:
        parser.error(str(error))
    print(json.dumps(reference, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
