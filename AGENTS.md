# Repository instructions

- Communicate with the user exclusively in English. Keep code, identifiers, and development documentation in English. Product interface language is a separate team decision.
- Follow DRY: reuse shared logic instead of duplicating it.
- Follow ETC: keep modules decoupled and interfaces easy to change.
- Read CONTRIBUTING.md, docs/product.md, and the relevant contracts before editing a component.
- Treat contracts/ as the shared source of truth. Change contracts and affected examples before changing implementations; coordinate incompatible changes with all three roles.
- Keep frontend -> backend -> agent boundaries. Provider credentials and model calls belong on the server.
- Never invent employee answers. Preserve missing information as null or an empty collection and ask follow-up questions.
- Do not use production employee or citizen data in fixtures, logs, examples, or demo recordings.
- Do not overwrite unrelated local changes. Keep changes small and focused.
- Run node scripts/check-contracts.mjs for shared-contract changes. Add appropriate runtime checks when application code is introduced.
- Do not introduce a framework or infrastructure dependency without recording the decision in docs/decisions.md.
- End every change report with bullet points covering what changed, why, validation, and any material trade-offs.
