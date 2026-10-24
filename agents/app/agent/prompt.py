"""Assemble the interview instructions from one registry and pinned form guide."""

import json

from ..contracts import INTENTS
from ..paths import AGENT_ROOT, DOCS_ROOT


def build_system_prompt() -> str:
    prompt = (AGENT_ROOT / "prompt.txt").read_text(encoding="utf-8")
    form_guide = (DOCS_ROOT / "implementation-form.md").read_text(encoding="utf-8")
    return (
        prompt
        + "\nImplantation guide:\n"
        + form_guide
        + "\nIntent registry:\n"
        + json.dumps(INTENTS)
    )
