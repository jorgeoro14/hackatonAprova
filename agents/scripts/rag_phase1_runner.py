"""Phase 1 runner; shared implementation avoids divergent scoring and CLI behavior."""

from .rag_phase_common import run_phase


def main() -> int:
    return run_phase(1)


if __name__ == "__main__":
    raise SystemExit(main())
