"""Loopback HTTP adapter for the backend's canonical, stateless full-form /turn."""

import argparse
import json
import os
import re
from copy import deepcopy
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from jsonschema import Draft202012Validator, FormatChecker, ValidationError
from langchain_core.messages import AIMessage, HumanMessage

from .agent.context import TurnContext
from .agent.workflow import create_workflow
from .agent.specification import prepare_specification
from .agent.presentation import apply_form_preview
from .contracts import SCHEMAS, model_turn_schema
from .rag.providers import chat_from_environment
from .rag.schemas import CorpusScope
from .requirements.config import knowledge_from_environment
from .requirements.remote import remote_template_id


class ImplantationAgent:
    """One full backend snapshot in, one candidate out; no writes/checkpointer."""

    def __init__(self, model):
        self.graph = create_workflow(model, contract="implantation", max_model_calls=5)

    def invoke(self, request):
        Draft202012Validator(
            SCHEMAS["implantation-turn-request.schema.json"], format_checker=FormatChecker()
        ).validate(request)
        scope = (
            CorpusScope(
                municipality_id=request["municipio_id"],
                municipality_name=request["municipio"],
                corpus_id="backend-assigned-knowledge",
            )
            if request.get("municipio_id")
            else None
        )
        # The backend authenticates session/client ownership and agent assignment.
        # No assignment means no access to a globally configured agent's bases.
        configured_id = os.environ.get("KNOWLEDGE_AGENT_ID", "").strip()
        knowledge = (
            knowledge_from_environment(
                scope, allow_synthetic=os.environ.get("REQUIREMENTS_ALLOW_SYNTHETIC") == "true"
            )
            if scope and configured_id and request.get("agent_id") == configured_id
            else None
        )
        if knowledge:
            knowledge = knowledge.for_domain(request["dominio"])
        messages = [
            (HumanMessage if message["role"] == "employee" else AIMessage)(
                content=message["content"],
                id=message.get("id")
                or str(
                    uuid5(
                        NAMESPACE_URL,
                        f"{request['session_id']}:{index}:{message['role']}:{message['content']}",
                    )
                ),
                additional_kwargs={"actor_role": "municipal_representative"}
                if message["role"] == "employee"
                else {},
            )
            for index, message in enumerate(request["messages"])
        ]
        context = TurnContext(
            session_id=request["session_id"],
            contract="implantation",
            current_form_json=json.dumps(request["form"], ensure_ascii=False),
            organization_json=json.dumps(request.get("orgao"), ensure_ascii=False),
            municipality=scope,
            domain=request["dominio"],
            knowledge_source=knowledge,
            attachments=tuple(deepcopy(request.get("attachments", []))),
            backend_message_ids=frozenset(m.id for m in messages),
        )
        initial_knowledge = {}
        current = request["form"]
        uses_habite_se = current and current.get("modeloBase") == "habite-se"
        discussed_habite_se = not current and any(
            re.search(r"\bhabite[\s-]*se\b", m["content"].casefold())
            for m in request["messages"] if m["role"] == "employee"
        )
        if knowledge and request["dominio"] == "obras" and (
            uses_habite_se or discussed_habite_se
        ):
            # Fetch the exact real candidate before reasoning, even if the model
            # would otherwise answer without a tool call. Discovery is not acceptance.
            initial_knowledge = knowledge.retrieve(
                "Habite-se", remote_template_id("obras", "habite-se") if uses_habite_se else None,
                scope, process_id="habite-se",
            ).as_turn_data()
            initial_knowledge["prefetched"] = True
        response = self.graph.invoke(
            {"messages": messages, "knowledge": initial_knowledge, "comparison": {}, "form_preview": {}},
            context=context,
            config={"recursion_limit": 30},
        )
        result = deepcopy(response.get("structured_response"))
        apply_form_preview(result, response.get("form_preview"))
        Draft202012Validator(model_turn_schema("implantation")).validate(result)
        form = prepare_specification(
            result["form"], request["form"], response.get("knowledge", {}),
            scope.municipality_id if scope else None,
        )
        result["form"] = form
        if form:
            current = request["form"]
            if current and current["dominio"] != request["dominio"]:
                raise ValueError("Backend domain and current draft differ")
            form["id"] = current["id"] if current else "draft-" + request["session_id"]
            form["status"] = "rascunho"
            form["dominio"] = request["dominio"]
            form["orgao"]["municipio"] = request["municipio"]
            if request.get("orgao") and request["orgao"]["uf"].isalpha():
                form["orgao"]["uf"] = request["orgao"]["uf"]
            form["atualizadoEm"] = datetime.now(UTC).isoformat().replace("+00:00", "Z")
            if form["processo"]["dominio"] != request["dominio"]:
                raise ValueError("Proposed process crossed the backend domain")
        else:
            result["pronto_para_revisao"] = False
        Draft202012Validator(
            model_turn_schema("implantation"), format_checker=FormatChecker()
        ).validate(result)
        return result


def create_http_server(agent, host="127.0.0.1", port=8000):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # Do not log conversations, form payloads or credentials.

        def send_json(self, status, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            self.send_json(200 if self.path == "/health" else 404, {"ok": self.path == "/health"})

        def do_POST(self):
            if self.path != "/turn":
                self.send_json(404, {"error": "not_found"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 4_000_000:
                    self.send_json(413, {"error": "invalid_request_size"})
                    return
                request = json.loads(self.rfile.read(length))
                result = agent.invoke(request)
                self.send_json(200, result)
            except (ValidationError, ValueError, UnicodeError):
                self.send_json(422, {"error": "invalid_turn_data"})
            except Exception:  # noqa: BLE001 - never expose provider errors or municipal payloads
                self.send_json(503, {"error": "agent_unavailable"})

    return ThreadingHTTPServer((host, port), Handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--knowledge-connection", type=Path, help="Trusted, ignored local API connection file"
    )
    args = parser.parse_args()
    if args.knowledge_connection:
        connection = json.loads(args.knowledge_connection.read_text(encoding="utf-8"))
        allowed = {
            "KNOWLEDGE_API_BASE_URL",
            "KNOWLEDGE_API_TOKEN",
            "KNOWLEDGE_AGENT_ID",
            "KNOWLEDGE_DOMAIN_ID",
            "REQUIREMENTS_ALLOW_SYNTHETIC",
        }
        if not set(connection) <= allowed:
            raise ValueError("Unsupported local connection setting")
        os.environ.update(connection)
    server = create_http_server(
        ImplantationAgent(chat_from_environment(timeout=25)), port=args.port
    )
    print(f"Stateless implantation agent: http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
