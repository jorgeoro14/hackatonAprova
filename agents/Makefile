.PHONY: test test-rag lint format-check contracts check

# Run with make -C agents from the repository root, if Make is installed.
test:
	uv run --project . pytest tests

test-rag:
	uv run --project . --extra rag pytest tests

lint:
	uv run --project . ruff check .

format-check:
	uv run --project . ruff format --check .

contracts:
	node ../scripts/check-contracts.mjs

check: test lint format-check contracts
