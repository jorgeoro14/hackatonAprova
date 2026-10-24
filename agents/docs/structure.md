# Agent project structure

The organization follows the local `ai-agent-sales` reference: application code
under `app/`, agent composition under `app/agent/`, operational commands under
`scripts/`, documentation under `docs/`, and offline checks under `tests/`.
Everything stays inside `agents/` to preserve this repository's team ownership.

```text
agents/
  app/
    agent/
      workflow.py       # LangChain composition and validated backend adapter
      prompt.py         # Prompt assembly
      prompt.txt        # Interview instructions
      intents.json      # Single machine-readable intent registry
      tools.py          # Read-only LangChain tools with injected dependencies
      helpers.py        # Snapshot preparation and form merging
    knowledge/
      catalog.py        # Replaceable municipal process catalog interface
      aprova_reference.py # Local public-documentation lookup and inspection CLI
    rag/
      schemas.py        # Internal manifest, scope, index and evidence models
      loaders.py        # Manifest-based local document loaders
      ingest.py         # Offline chunk preparation and source provenance
      store.py          # Persistent municipal vector indexes and scoped retrieval
      workflow.py       # Relevance, rewrite and grounded answer graph
      providers.py      # Explicit server-side embedding configuration
      evaluation.py     # Phase datasets, experiments, scoring and reports
      structured.py     # Shared structured-model invocation
    contracts.py        # Validation using the shared repository schemas
    paths.py            # Working-directory-independent asset locations
  scripts/
    run_interview.py    # Provider setup and one-turn CLI
    extract_aprova_docs.py # Public OpenAPI snapshot extraction
    ingest_municipal_docs.py # Offline preview or explicit embedding/indexing
    rag_phase0.py       # Chunk/index variant preparation
    rag_phase1_runner.py # Vector retrieval baseline
    rag_phase2_runner.py # Retrieval experiment comparisons
    rag_phase3_runner.py # Agentic RAG and optional answer judging
    rag_phase_common.py # Shared CLI planning, preflight and report orchestration
  knowledge/aprova/     # Documentation data and synthetic response templates
  docs/
    implementation-form.md # Pinned questionnaire guidance loaded into the prompt
    intents.md          # Intent selection guide
    structure.md        # This guide
    rag.md              # Municipal document preparation and agentic retrieval
    rag_testing_flow.md # Phase commands and reference/documentation audit
  examples/             # Explicitly selected synthetic process catalog
  data/municipal/       # Incoming documents/manifests; local and ignored
  .local/rag/           # Persistent indexes; local and ignored
  tests/
    rag/                # Phase-marked RAG checks, shared dataset and experiment matrix
      data/             # Explicitly synthetic evaluation documents
      analysis/         # Local reports; generated files ignored
    test_interview.py   # Interview adapter and RAG-tool integration checks
    test_aprova_reference.py # Public API-reference checks
  interview.py          # Stable backend import; delegates to app/agent/workflow.py
  __main__.py           # Stable python -m agents entry point
  Makefile              # Optional component check shortcuts
  pyproject.toml        # Dependency and test/lint configuration
  uv.lock               # Locked dependencies
```

## Runtime boundaries

The backend continues to use:

```python
from agents.interview import ProcessInterviewAgent

agent = ProcessInterviewAgent(model, catalog)
result = agent.invoke(request)
```

`workflow.py` composes `create_agent` with the prompt, tools and internal response
schema. The adapter calls the helpers to validate the incoming snapshot, preserve
its facts, merge validated model updates, and validate the public result. The
backend owns conversation persistence, deadlines and confirmation. Importing the
workflow does not construct a provider model or require a provider key.

`app/knowledge/` holds catalog/API lookup code; `knowledge/` holds its reference
data. `app/rag/` now holds the separate municipal ingestion and retrieval pipeline,
with raw files under ignored `data/municipal/` and local indexes under ignored
`.local/rag/`. The interview decides when to call the RAG tool; its LangGraph
subgraph grades, optionally rewrites and generates cited evidence. See
[the RAG guide](rag.md). The course project's sales CRM and data are not part
of this component.

The [phase organization audit](rag_testing_flow.md) records what matches the
reference, what was adapted, and which retrieval features remain unimplemented.
Phase runners use the same ingestion/retrieval/graph code as the application;
scoring and reports are shared rather than copied into each runner.

The root `langgraph.json` now registers a separate synthetic requirements graph
for local Studio inspection. `app/requirements/` contains its schemas, comparison,
retrieval adapters, graph, prompts and exports. The live graph has a separate
configuration and requires server-side settings. This development surface does
not replace the current backend adapter or its shared request/result contract;
see [requirements.md](requirements.md) for the remaining integration boundary.

## Commands and deployment

Run the commands in [the component README](../README.md) from the repository
root. The interview command remains `python -m agents`; the documentation
inspection command is now `python -m agents.app.knowledge.aprova_reference`, and
the snapshot refresh command is `python -m agents.scripts.extract_aprova_docs`.
Maintenance modules also accept `--help` without credentials.

Asset paths are resolved from `app/paths.py`, not the shell's working directory.
Deploy the repository's `contracts/schemas/` together with `agents/app/`,
`agents/docs/`, `agents/knowledge/`, and the required entry points. The package
remains repository-scoped rather than an independently installable wheel.
