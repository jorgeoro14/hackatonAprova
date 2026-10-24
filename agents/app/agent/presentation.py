"""Prepare a source-preserving form preview without confirming municipal answers."""

import json
from copy import deepcopy
from datetime import UTC, datetime

from jsonschema import Draft202012Validator

from ..contracts import model_turn_schema


def build_form_preview(context, knowledge):
    if context.current_form:
        return deepcopy(context.current_form)
    data = knowledge.get("knowledge_context", {})
    process = data.get("process_baseline")
    if process is None:
        previews = data.get("process_previews", [])
        if len(previews) != 1:
            return None
        process = previews[0]
    organization = json.loads(context.organization_json) if context.organization_json else None
    if not organization or process.get("dominio") != context.domain:
        return None
    blocks = [key for key in (
        "resumo", "formulario", "documentos", "taxas", "setores", "fluxo", "despachos", "documentoFinal"
    ) if key in process]
    pending = [{
        "caminho": block,
        "descricao": "Valores do modelo de referência; confirmar com a prefeitura as regras que permanecem e as alterações necessárias.",
    } for block in blocks]
    pending.append({
        "caminho": "formulario",
        "descricao": "Fundamentos legais e aplicabilidade municipal ainda precisam de validação; a prévia não representa aprovação.",
    })
    form = {
        "id": "draft-" + context.session_id,
        "status": "rascunho", "dominio": context.domain,
        "modeloBase": process["id"], "orgao": organization,
        "processo": deepcopy(process), "legislacaoLocal": [],
        "origens": [{"caminho": key, "origem": "modelo"} for key in blocks],
        "pendencias": pending, "evidenciasLegais": [],
        "citacoesRequisitos": [], "alteracoesCampos": [],
        "atualizadoEm": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    }
    Draft202012Validator(model_turn_schema("implantation")).validate({
        "assistant_reply": "Prévia do formulário", "form": form,
        "pendencias": pending, "pronto_para_revisao": True,
    })
    return form


def apply_form_preview(result, preview):
    """A presentation action always emits a form card, never municipal approval."""
    if preview:
        if result["form"] is None:
            result["form"] = deepcopy(preview)
            result["pendencias"] = deepcopy(preview.get("pendencias", []))
            result["assistant_reply"] = (
                "Segue abaixo a prévia editável do formulário, com os campos do modelo de referência. "
                "As regras e pendências ainda precisam ser revisadas pela prefeitura; nada foi confirmado ou enviado."
            )
        result["pronto_para_revisao"] = True
    return result
