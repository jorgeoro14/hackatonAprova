"""Assemble the interview instructions from one registry and pinned form guide."""

import json

from ..contracts import INTENTS
from ..knowledge.implantation import implementation_guide, load_implementation_reference
from ..paths import AGENT_ROOT


def build_system_prompt(contract="provisional") -> str:
    if contract == "implantation":
        return (
            (AGENT_ROOT / "implantation_prompt.txt").read_text(encoding="utf-8")
            + "\nAuthoritative questionnaire (reference data):\n"
            + json.dumps(load_implementation_reference(), ensure_ascii=False)
        )
    prompt = (AGENT_ROOT / "prompt.txt").read_text(encoding="utf-8")
    reference = load_implementation_reference()
    return (
        prompt
        + "\nImplantation guide:\n"
        + implementation_guide()
        + "\nVerified implantation questionnaire reference:\n"
        + json.dumps(reference, ensure_ascii=False)
        + "\nIntent registry:\n"
        + json.dumps(INTENTS)
    )
