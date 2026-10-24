# Manual frontend agent test

The application agent replies in Brazilian Portuguese, including when the user
writes in English. Existing conversation history is preserved. Schema keys,
identifiers, enum values and exact source quotations keep their original values.

## Start the local stack

Use PowerShell from the repository root. Keep the OpenAI key in the root `.env`;
never put it in a frontend environment variable. Node 22+, npm and uv are required.
If dependencies are missing, run `npm ci` in the root and in `frontend/` first.

If these services are already running, use their existing terminals. Restart the
Python agent after updating its code or generated schemas. Do not start a second
service on an occupied port.

1. Backend, terminal one:

   ```powershell
   $env:AGENT_URL = 'http://127.0.0.1:8000'
   $env:CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
   npm run dev:local
   ```

   This uses the isolated local database under `agents/.local/frontend-db`,
   rather than the production `DATABASE_URL`.

2. Agent, terminal two, from the repository root:

   ```powershell
   uv run --env-file .env --project agents --all-extras python -m agents.app.server --knowledge-connection agents/.local/frontend-connection.json
   ```

   The ignored connection file was prepared for the synthetic Cascavel conversation.
   If it is missing or its temporary token expired, first register the synthetic
   contact in the frontend, then run the following with the backend running:

   ```powershell
   uv run --env-file .env --project agents --all-extras python -m agents.scripts.prepare_frontend_test --domain meio-ambiente --allow-synthetic
   ```

   Restart the Python service afterward. The helper expects a dedicated Cascavel
   municipality with exactly one conversation. It assigns the synthetic local
   knowledge agent and stores its credentials only on the server. It uses the
   local seeded `head` account and `SEED_SENHA` (default `aprova123`).

3. Frontend, terminal three:

   ```powershell
   cd frontend
   $env:VITE_USE_MOCKS = 'false'
   $env:VITE_API_URL = 'http://127.0.0.1:3333/api/v1'
   node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort
   ```

4. Open <http://127.0.0.1:5173/chat>. Use the synthetic test phone
   `45990000659` to resume the prepared conversation. If registration is needed,
   use the fictional name `Synthetic Integration Test`, municipality `Cascavel`
   and department `Meio Ambiente`. Do not enter real citizen information.

## Exercise the conversation

Send these prompts one at a time, adjusting to the agent's actual questions:

1. `Quero adaptar o modelo de Licença Ambiental Prévia para Cascavel, PR. Consulte o modelo disponível e explique quais informações estão faltando.`
2. `Confirmo o uso do modelo sintético de Licença Ambiental Prévia apenas para este teste local. Taxas, prazos e exigências legais ainda precisam de validação da prefeitura.`
3. `Quero adaptar o modelo de Licença Ambiental Prévia para Cascavel, PR. Consulte o modelo disponível e explique quais informações estão faltando.`
4. `Corrigindo a solicitação anterior: o e-mail deve continuar opcional e ter o rótulo E-mail para acompanhamento.`
5. `Mostre o rascunho para revisão e liste as pendências. Ainda não confirmo nem autorizo o envio.`
6. `Please summarize the pending questions.`

Check manually that replies remain in Brazilian Portuguese, including step six;
answered questions are not repeated; corrections preserve unrelated information;
the draft reflects the requested optional field; and missing legal information
remains pending. Reload the page to check backend persistence. Review the draft
before using any confirmation or submission controls.

The available LAP baseline is synthetic. It is not verified Cascavel legislation
or an approved municipal configuration. The agent proposes a draft; frontend and
backend own persistence and confirmation. No configuration is applied to Aprova.

If the UI reports a connection error, check the three service terminals, port
values, mock setting and CORS origin. For an unavailable knowledge source, refresh
the local connection file and restart Python. Do not paste credentials into chat.

No automated or additional live tests were run for the language change, as requested.

For the API-to-form display conditions and browser Network checks, see
[Agent API and frontend form integration](agent-form-integration.md).
