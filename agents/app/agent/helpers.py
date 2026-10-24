"""Pure turn preparation and validated form merging for the backend adapter."""

from copy import deepcopy

from ..contracts import missing_fields, validate


def build_context(request: dict) -> dict:
    validate("agent-request.schema.json", request)
    snapshot = deepcopy(request)
    return {
        "current_form": snapshot["form"],
        "missing_required_fields": missing_fields(snapshot["form"]),
        "conversation": snapshot["messages"],
    }


def merge_turn(form: dict, turn: dict) -> dict:
    updates = turn["updates"]
    if turn["intent"] in {"pause", "out_of_scope"} and updates:
        raise ValueError("This intent cannot update the form")
    for field in ("municipality", "process_name"):
        if field in updates and form[field] is not None and updates[field] != form[field]:
            raise ValueError("Changing session identity requires a new session")
    candidate = {**form, **deepcopy(updates)}
    result = {
        "assistant_reply": turn["assistant_reply"],
        "form": candidate,
        "missing_fields": missing_fields(candidate),
    }
    validate("agent-result.schema.json", result)
    return result
