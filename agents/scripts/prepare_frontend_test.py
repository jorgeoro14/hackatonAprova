"""Bind a dedicated local demo conversation to explicitly selected API knowledge."""

import argparse
import json
import os
from urllib.request import Request, urlopen

from agents.app.paths import REPOSITORY_ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--municipality", default="Cascavel")
    parser.add_argument("--domain", required=True, help="Actual domain ID containing the uploaded model")
    parser.add_argument("--conversation-id", help="Select explicitly when the municipality has multiple conversations")
    parser.add_argument("--allow-synthetic", action="store_true")
    parser.add_argument("--default-only", action="store_true", help="Configure future conversations without selecting a session")
    args = parser.parse_args()
    base = "http://127.0.0.1:3333/api/v1"
    token = None

    def call(path, body=None, method=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = Request(
            base + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers=headers,
            method=method,
        )
        with urlopen(req, timeout=10) as response:
            return json.load(response)

    token = call(
        "/auth/login", {"username": "head", "password": os.environ.get("SEED_SENHA", "aprova123")}
    )["token"]
    clients = call("/clients?pageSize=100")["items"]
    client = next(
        c
        for c in clients
        if c["name"].casefold() == ("Prefeitura de " + args.municipality).casefold()
    )
    conversations = call(f"/clients/{client['id']}/conversations")["items"]
    if args.conversation_id:
        conversations = [c for c in conversations if c["id"] == args.conversation_id]
    if not args.default_only and len(conversations) != 1:
        raise ValueError("Use a dedicated local municipality with exactly one test conversation")
    agents = call(f"/clients/{client['id']}/agents")
    name = "Local implantation demo: " + args.domain
    agent = next((a for a in agents if a["name"] == name), None)
    if agent is None:
        agent = call(
            f"/clients/{client['id']}/agents",
            {"name": name, "status": "draft", "normBaseIds": [args.domain]},
        )
    call(f"/clients/{client['id']}/agent-defaults/{args.domain}", {"agentId": agent["id"]}, method="PUT")
    if not args.default_only:
        call(f"/conversations/{conversations[0]['id']}/agent", {"agentId": agent["id"]}, method="PUT")
    destination = REPOSITORY_ROOT / "agents/.local/frontend-connection.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(
            {
                "KNOWLEDGE_API_BASE_URL": "http://127.0.0.1:3333",
                "KNOWLEDGE_API_TOKEN": token,
                "KNOWLEDGE_AGENT_ID": agent["id"],
                "KNOWLEDGE_DOMAIN_ID": args.domain,
                "REQUIREMENTS_ALLOW_SYNTHETIC": "true" if args.allow_synthetic else "false",
            }
        ),
        encoding="utf-8",
    )
    print("Local domain default configured; temporary credentials saved under ignored agents/.local/.")


if __name__ == "__main__":
    main()
