"""One verified questionnaire source and English interpretation for both agents."""

import json
from hashlib import sha256

from ..paths import DOCS_ROOT, KNOWLEDGE_ROOT, REPOSITORY_ROOT


def load_implementation_reference() -> dict:
    metadata = json.loads(
        (KNOWLEDGE_ROOT / "aprova/implantation-questionnaire.json").read_text(encoding="utf-8")
    )
    content = (REPOSITORY_ROOT / metadata["repository_path"]).read_text(encoding="utf-8")
    # Git on Windows may check out CRLF; line ending conversion is not a source revision.
    if sha256(content.encode("utf-8")).hexdigest() != metadata["content_sha256"]:
        raise ValueError(
            "Implantation questionnaire differs from its pinned reference; refresh provenance"
        )
    return {"metadata": metadata, "content": content}


def implementation_guide() -> str:
    return (DOCS_ROOT / "implementation-form.md").read_text(encoding="utf-8")
