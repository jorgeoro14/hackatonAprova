"""Deterministic provenance checks and field differences for full-form turns."""

import re
from copy import deepcopy


def _normalized_quote(text):
    return re.sub(r"\s+", " ", text).strip()


def _path_exists(process, path):
    if not path or path.startswith("processo."):
        return False
    current = process
    for part in path.split("."):
        if isinstance(current, list) and part.isdigit() and int(part) < len(current):
            current = current[int(part)]
        elif isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return False
    return True


def _fields(process):
    result = {}
    for section in (process or {}).get("formulario", {}).get("secoes", []):
        for field in section.get("campos", []):
            if field["id"] in result:
                raise ValueError("Duplicate field IDs in specification")
            result[field["id"]] = field
    return result


def prepare_specification(form, current, knowledge, municipality_id):
    """Ignore model-authored evidence metadata; accept citations only to real excerpts.

    Existing backend evidence is retained across disposable turns. Text matching
    establishes provenance only; semantic support and legal validity need review.
    """
    if form is None:
        if current:
            raise ValueError("An existing draft must be preserved in the response")
        return None
    candidate = deepcopy(form)
    evidence = {e["id"]: deepcopy(e) for e in (current or {}).get("evidenciasLegais", [])}
    for source in knowledge.get("legal_context", []):
        if source["municipality_id"] != municipality_id:
            raise ValueError("Legal evidence crossed municipality scope")
        evidence[source["chunk_id"]] = {
            "id": source["chunk_id"],
            "documentId": source["document_id"],
            "municipalityId": source["municipality_id"],
            "article": source["article"],
            "excerpt": source["excerpt"],
            "sourceUrl": str(source["source_url"]),
            "sourceSha256": source["source_sha256"],
            "effectiveStatus": source["effective_status"],
            "applicability": source["applicability"],
            "retrievedAt": source["verified_at"],
        }
    for item in evidence.values():
        if item["municipalityId"] != municipality_id:
            raise ValueError("Retained legal evidence crossed municipality scope")
    citations = candidate.get("citacoesRequisitos", [])
    for citation in citations:
        source = evidence.get(citation["evidenceId"])
        if source is None or source["effectiveStatus"] == "revoked":
            raise ValueError("Citation must reference retrieved, non-revoked evidence")
        quote = _normalized_quote(citation["quote"])
        if not quote or quote not in _normalized_quote(source["excerpt"]):
            raise ValueError("Citation quotation must occur in its retrieved excerpt")
        if not _path_exists(candidate["processo"], citation["caminho"]):
            raise ValueError("Citation target must exist in the proposed process")
        citation["validation"] = "pending_human_review"
    for origin in candidate.get("origens", []):
        if origin["origem"] == "legislacao" and not any(
            c["caminho"] == origin["caminho"]
            or c["caminho"].startswith(origin["caminho"] + ".")
            for c in citations
        ):
            raise ValueError("Legal origins require a matching article citation")
    candidate["evidenciasLegais"] = list(evidence.values())
    candidate["citacoesRequisitos"] = citations
    baseline = knowledge.get("knowledge_context", {}).get("process_baseline")
    before = _fields(baseline or (current or {}).get("processo"))
    if current and not baseline:
        # Recover the original field baseline from the previous server-generated
        # diff, so a correction does not erase earlier changes from the summary.
        for previous in current.get("alteracoesCampos", []):
            if previous["before"] is None:
                before.pop(previous["fieldId"], None)
            else:
                before[previous["fieldId"]] = previous["before"]
    after = _fields(candidate["processo"])
    candidate["alteracoesCampos"] = [
        {
            "fieldId": field_id,
            "action": "add_field" if field_id not in before else (
                "remove_field" if field_id not in after else "update_field"
            ),
            "before": before.get(field_id),
            "after": after.get(field_id),
        }
        for field_id in sorted(before.keys() | after.keys())
        if before.get(field_id) != after.get(field_id)
    ] if baseline or current else []
    return candidate
