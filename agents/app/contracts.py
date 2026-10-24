"""Load canonical schemas rather than maintaining parallel form models."""

import json
from copy import deepcopy
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from .paths import AGENT_ROOT, SCHEMA_ROOT

BASE_URI = SCHEMA_ROOT.as_uri() + "/"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


SCHEMAS = {path.name: load_json(path) for path in SCHEMA_ROOT.glob("*.json")}
REGISTRY = Registry().with_resources(
    (BASE_URI + name, Resource.from_contents(schema)) for name, schema in SCHEMAS.items()
)
FORM_SCHEMA = SCHEMAS["form.schema.json"]
INTENTS = load_json(AGENT_ROOT / "intents.json")


def validate(name: str, value: dict) -> None:
    schema = {"$ref": BASE_URI + name}
    Draft202012Validator(schema, registry=REGISTRY, format_checker=FormatChecker()).validate(value)


def missing_fields(form: dict) -> list[str]:
    validate("form.schema.json", form)
    return sorted(field for field in FORM_SCHEMA["x-required-for-review"] if not form[field])


def turn_schema() -> dict:
    """Internal extraction schema; updates reuse the public form's field definitions."""
    return {
        "title": "interview_turn",
        "description": "Primary employee intent, supported field updates, and next interview reply.",
        "type": "object",
        "additionalProperties": False,
        "required": ["intent", "updates", "assistant_reply"],
        "properties": {
            "intent": {"enum": [intent["name"] for intent in INTENTS]},
            "updates": {
                "type": "object",
                "additionalProperties": False,
                "properties": deepcopy(FORM_SCHEMA["properties"]),
                "description": "Only changed fields. Arrays replace the whole collection, preserving unrelated items.",
            },
            "assistant_reply": deepcopy(
                SCHEMAS["agent-result.schema.json"]["properties"]["assistant_reply"]
            ),
        },
    }


def model_turn_schema(contract: str = "provisional") -> dict:
    if contract == "implantation":
        return deepcopy(SCHEMAS["implantation-turn-result.schema.json"])
    return turn_schema()
