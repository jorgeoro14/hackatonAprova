"""Read-only catalog boundary; load only sources authorized for this deployment."""

from copy import deepcopy
from typing import Protocol

from jsonschema import Draft202012Validator

from .contracts import FORM_SCHEMA

CATALOG_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "additionalProperties": False,
        "required": ["process_id", "version", "source", "name", "baseline"],
        "properties": {
            **{
                key: {"type": "string", "minLength": 1, "pattern": r"\S"}
                for key in ("process_id", "version", "source", "name")
            },
            "baseline": FORM_SCHEMA,
        },
    },
}


class ProcessCatalog(Protocol):
    def search(self, query: str) -> list[dict]:
        """Return possible mappings with their versions and sources."""
        ...


class JsonProcessCatalog:
    def __init__(self, records: list[dict]):
        Draft202012Validator(CATALOG_SCHEMA).validate(records)
        keys = [(record["process_id"], record["version"]) for record in records]
        if len(set(keys)) != len(keys):
            raise ValueError("Duplicate process ID/version in catalog")
        self._records = deepcopy(records)

    def search(self, query: str) -> list[dict]:
        query = query.strip().casefold()
        if not query:
            return []
        return deepcopy(
            [
                record
                for record in self._records
                if query in record["name"].casefold() or query == record["process_id"].casefold()
            ]
        )
