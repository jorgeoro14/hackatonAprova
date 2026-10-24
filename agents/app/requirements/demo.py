"""Explicit synthetic local/Studio demo; no municipal facts or model calls."""

import json

from .retrieval import TemplateCatalog
from .schemas import AnalysisProposal, Capabilities, FormField, Template


class DemoModel:
    """Deterministic synthetic conversation, not an LLM or municipal policy."""

    def with_structured_output(self, schema):
        if schema is not AnalysisProposal:
            raise ValueError("Demo requires an explicit process and mode")
        return self

    def invoke(self, messages):
        data = json.loads(messages[-1].content)
        statements = data["statements"]
        reply = next(
            (
                (key, text)
                for key, text in statements.items()
                if "optional email" in text.casefold()
            ),
            None,
        )
        if reply is None:
            return {
                "suggested_changes": [],
                "conflicts": [],
                "next_questions": [
                    {
                        "key": "contact_channel",
                        "text": "Which contact channel should be added, and is it required?",
                    }
                ],
            }
        return {
            "suggested_changes": [
                {
                    "action": "add_field",
                    "field_id": "contact_email",
                    "patch": {"label": "Contact email", "field_type": "email", "required": False},
                    "origin": "municipality_request",
                    "rationale": "Optional contact requested in this synthetic demo.",
                    "statements": [{"message_id": reply[0], "quote": reply[1]}],
                    "legal_basis": [],
                }
            ],
            "next_questions": [],
            "conflicts": [],
        }


def demo_dependencies():
    template = Template(
        template_id="information-request-demo",
        name="Information request demo",
        version="synthetic-v1",
        source="explicit_synthetic_demo",
        synthetic=True,
        fields=[
            FormField(
                field_id="request_description",
                label="Request description",
                field_type="texto_longo",
                required=True,
            )
        ],
    )
    return TemplateCatalog([template], allow_synthetic=True), Capabilities(
        source="synthetic_demo_only_not_vendor_verification",
        verified=True,
        synthetic=True,
        actions=["add_field", "update_field", "remove_field", "set_required", "add_condition"],
        field_types=["email", "texto_longo", "texto", "sim_nao"],
    )
