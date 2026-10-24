"""Extract public Aprova API shapes, without calling authenticated API endpoints."""

import argparse
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.request import urlopen

SOURCE_URL = "https://hubapi.aprova.com.br/_bundle/aprovahubapi.json?download="
OUTPUT_PATH = Path(__file__).with_name("knowledge") / "aprova" / "api-contract.json"
RESOURCE_TAGS = {
    "Process": "process",
    "Type": "forms",
    "Template": "templates",
    "Dispatch": "dispatches",
    "Blueprint Process": "blueprints",
}


def schema_from_openapi(value):
    """Preserve validation keywords; remove prose/examples and convert OAS3 nullable."""
    if isinstance(value, list):
        return [schema_from_openapi(item) for item in value]
    if not isinstance(value, dict):
        return value
    result = {}
    for key, item in value.items():
        if key in {"description", "example", "examples", "title", "nullable"}:
            continue
        if key == "properties":
            # Property names such as 'description' and 'title' are API data, not prose.
            result[key] = {name: schema_from_openapi(prop) for name, prop in item.items()}
        else:
            result[key] = schema_from_openapi(item)
    if value.get("nullable"):
        result = {"anyOf": [result, {"type": "null"}]}
    return result


def extract_contract(spec: dict, source_bytes: bytes) -> dict:
    if not spec.get("openapi", "").startswith("3.0."):
        raise ValueError("Expected the documented OpenAPI 3.0 format")
    operations = {}
    for path, path_item in spec["paths"].items():
        for method, operation in path_item.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            resource = next(
                (RESOURCE_TAGS[tag] for tag in operation.get("tags", []) if tag in RESOURCE_TAGS),
                None,
            )
            if resource is None:
                continue
            if operation.get("security") != [{"InternalAuth": []}]:
                raise ValueError(
                    "Unexpected authentication scheme; review the source specification"
                )
            operation_id = operation["operationId"]
            if operation_id in operations:
                raise ValueError("Duplicate operation identifier in source specification")
            responses = {}
            for status, response in operation["responses"].items():
                schema = response.get("content", {}).get("application/json", {}).get("schema")
                responses[status] = schema_from_openapi(schema) if schema is not None else None
            body = operation.get("requestBody")
            operations[operation_id] = {
                "resource": resource,
                "method": method.upper(),
                "path": path,
                "parameters": [
                    {
                        "name": parameter["name"],
                        "in": parameter["in"],
                        "required": parameter.get("required", False),
                        "schema": schema_from_openapi(parameter["schema"]),
                    }
                    for parameter in path_item.get("parameters", [])
                    + operation.get("parameters", [])
                ],
                "request_body": {
                    "required": body.get("required", False),
                    "schema": schema_from_openapi(body["content"]["application/json"]["schema"]),
                }
                if body
                else None,
                "responses": responses,
            }
    serialized = json.dumps(operations)
    if '"$ref"' in serialized:
        raise ValueError("Source now uses schema references; update extraction before publishing")
    return {
        "source_kind": "public_api_documentation",
        "source_url": SOURCE_URL,
        "retrieved_at": datetime.now(UTC).isoformat(),
        "source_sha256": hashlib.sha256(source_bytes).hexdigest(),
        "api_servers": [server["url"] for server in spec.get("servers", [])],
        "authentication": {"type": "api_key", "header": "x-api-key"},
        "schema_format": "JSON Schema with OpenAPI 3.0 nullable converted to anyOf",
        "execution_policy": "reference_only_no_api_calls",
        "operations": operations,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-file", type=Path, help="Offline OpenAPI JSON snapshot")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args()
    if args.source_file:
        source = args.source_file.read_bytes()
    else:
        with urlopen(SOURCE_URL, timeout=30) as response:
            source = response.read()
    spec = json.loads(source.decode("utf-8-sig"))
    contract = extract_contract(spec, source)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(contract, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Extracted {len(contract['operations'])} documented operations to {args.output}")


if __name__ == "__main__":
    main()
