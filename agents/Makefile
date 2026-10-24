.PHONY: test test-rag test-requirements studio lint format-check contracts check rag_phase0 rag_phase1 rag_phase2 rag_phase3 rag_phase2_fast rag_phase3_fast

RAG_RUN = uv run --directory .. --project agents --extra rag

# Run with make -C agents from the repository root, if Make is installed.
test:
	uv run --project . pytest tests

test-rag:
	uv run --project . --extra rag pytest tests

test-requirements:
	uv run --project . --extra requirements pytest tests/test_requirements.py tests/rag/test_legislation.py

studio:
	uv run --directory .. --project agents --all-extras langgraph dev --config langgraph.json --no-browser

lint:
	uv run --project . ruff check .

format-check:
	uv run --project . ruff format --check .

contracts:
	node ../scripts/check-contracts.mjs

check: test lint format-check contracts

# Planning is the default. Pass RAG_ARGS="--live ..." for Phase 1/2/3 provider calls.
# Phase 0 sends chunks to the embedding provider only with RAG_ARGS="--embed ...".
rag_phase0:
	$(RAG_RUN) python -m agents.scripts.rag_phase0 $(RAG_ARGS)

rag_phase1:
	$(RAG_RUN) python -m agents.scripts.rag_phase1_runner $(RAG_ARGS)

rag_phase2:
	$(RAG_RUN) python -m agents.scripts.rag_phase2_runner $(RAG_ARGS)

rag_phase3:
	$(RAG_RUN) python -m agents.scripts.rag_phase3_runner $(RAG_ARGS)

rag_phase2_fast:
	$(RAG_RUN) python -m agents.scripts.rag_phase2_runner --fast $(RAG_ARGS)

rag_phase3_fast:
	$(RAG_RUN) python -m agents.scripts.rag_phase3_runner --fast $(RAG_ARGS)
