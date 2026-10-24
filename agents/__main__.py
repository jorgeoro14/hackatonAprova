"""Preserve the repository-root `python -m agents` entry point."""

from .scripts.run_interview import main

if __name__ == "__main__":
    raise SystemExit(main())
