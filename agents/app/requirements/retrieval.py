"""Read-only adapters for team process models and the curated legislation corpus."""

import json
import re
import unicodedata
from hashlib import sha256
from pathlib import Path
from typing import Protocol

from ..paths import REPOSITORY_ROOT
from ..rag.legislation import search_laws as lexical_search
from ..rag.schemas import CorpusScope
from .schemas import Capabilities, FormField, Issue, LegalEvidence, Template


def team_field_types() -> set[str]:
    """Read the canonical enum instead of maintaining a second field taxonomy."""
    source = (REPOSITORY_ROOT / "src/knowledge/schemas.ts").read_text(encoding="utf-8")
    match = re.search(r"export const TipoCampo = z\.enum\(\[(.*?)\]\)", source, re.DOTALL)
    if not match:
        raise ValueError("Canonical team field enum is unavailable")
    return set(re.findall(r'"([a-z_]+)"', match[1]))


def validate_capabilities(capabilities: Capabilities) -> Capabilities:
    if not set(capabilities.field_types) <= team_field_types():
        raise ValueError("Capability profile contains types outside the canonical team schema")
    return capabilities


def _normalized(value: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(c)
    )


def normalize_process_model(
    model: dict, *, version: str, source: str, template_id=None
) -> Template:
    """Normalize the applicant field block without discarding the caller's full baseline."""
    def normalize_field(field):
        return FormField(
            field_id=field["id"], label=field["rotulo"], field_type=field["tipo"],
            required=field["obrigatorio"], options=field.get("opcoes", []),
            help_text=field.get("ajuda"), required_when=field.get("obrigatorioSe"),
            visible_when=field.get("visivelSe"),
            children=[normalize_field(child) for child in field.get("campos", [])],
        )

    return Template(
        template_id=template_id or model["id"],
        name=model["nome"],
        version=version,
        source=source,
        synthetic=model.get("exemplo", False),
        fields=[
            normalize_field(f)
            for section in model["formulario"]["secoes"]
            for f in section["campos"]
        ],
    )


class TemplateCatalog:
    def __init__(self, templates: list[Template], *, allow_synthetic: bool = False):
        if len({t.template_id for t in templates}) != len(templates):
            raise ValueError("Ambiguous template IDs; select one pinned version per deployment")
        self._templates = [t for t in templates if allow_synthetic or not t.synthetic]
        allowed = team_field_types()
        if any(f.field_type not in allowed for t in templates for f in t.fields):
            raise ValueError("Template field type is absent from the canonical team schema")

    def search_templates(self, query: str) -> list[Template]:
        tokens = set(re.findall(r"\w+", _normalized(query)))
        if not tokens:
            return []
        return [
            t
            for t in self._templates
            if _normalized(t.template_id) == _normalized(query)
            or tokens.intersection(re.findall(r"\w+", _normalized(t.name)))
        ]


def load_team_models(root: Path, *, allow_synthetic: bool = False) -> TemplateCatalog:
    """Normalize only the field block. Preserve source IDs, example flag and version hash.

    This adapter does not claim to validate or export the full ProcessoModelo.
    The canonical TypeScript validator remains responsible for that envelope.
    """
    templates = []
    for path in sorted(root.glob("*/processos/*.json")):
        raw = path.read_bytes()
        model = json.loads(raw)
        templates.append(
            normalize_process_model(
                model,
                version=sha256(raw).hexdigest(),
                source=path.as_posix(),
            )
        )
    return TemplateCatalog(templates, allow_synthetic=allow_synthetic)


class LawSearch(Protocol):
    def search_laws(self, query: str, scope: CorpusScope) -> list[LegalEvidence]: ...


class CuratedLawSearch:
    def __init__(self, index: Path):
        self.index = index

    def coverage_issues(self, scope: CorpusScope) -> list[Issue]:
        manifest = self.index.parent.parent / "metadata/manifest.json"
        data = json.loads(manifest.read_text(encoding="utf-8"))
        if data["municipality_ibge"] != scope.municipality_id:
            raise ValueError("Coverage manifest has a different municipality scope")
        return [
            Issue(key=gap["key"], description=gap["description"])
            for gap in data.get("coverage_gaps", [])
        ]

    def search_laws(self, query: str, scope: CorpusScope) -> list[LegalEvidence]:
        if scope.municipality_id != "4104808":
            raise ValueError("The curated legislation index is scoped to Cascavel PR 4104808")
        result = []
        for chunk in lexical_search(self.index, query, k=6):
            if chunk["municipality_ibge"] != scope.municipality_id:
                raise ValueError("Retrieved law has a different municipality scope")
            result.append(
                LegalEvidence(
                    chunk_id=chunk["chunk_id"],
                    document_id=chunk["document_id"],
                    municipality_id=scope.municipality_id,
                    article=chunk["article"],
                    jurisdiction=chunk["jurisdiction"],
                    source_url=chunk["source_url"],
                    source_sha256=chunk["source_sha256"],
                    excerpt=chunk["text"],
                    effective_status=chunk["effective_status"],
                    # Collected text is evidence to review, never certification of local application.
                    applicability="conditional"
                    if chunk["applicability"] == "conditional"
                    else "unverified",
                    verified_at=chunk["verified_at"],
                )
            )
        return result
