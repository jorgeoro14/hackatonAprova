# Development rules

## Work in small, integrated increments

Keep main runnable. Branch from current main using feat/chat-ui, feat/session-api, or feat/process-interview; use fix/ and docs/ for other work. Open a focused pull request, get one teammate review, and squash merge after checks pass. Pull main before starting the next task. Avoid long-lived branches per role.

Link each pull request to one issue with a concrete acceptance criterion. A task is complete when its user-visible outcome works through the real flow, not merely when one component works alone.

## Ownership and shared files

Frontend owns frontend/, backend owns backend/, and agents owns agents/. Ownership coordinates work; teammates can contribute across boundaries. Announce changes to shared schemas, root configuration, dependency lockfiles, and deployment files before editing them. One person coordinates each shared change.

The backend owner coordinates contracts/. A breaking contract change requires agreement from both consumers before merging. Put the contract and the corresponding consumer changes in one pull request when practical. Keep one canonical schema and import or generate types from it; do not maintain divergent copies.

## Integration contract

Use contracts/openapi.json and contracts/schemas/ as the baseline. Required fields, nullability, status values, error codes, and examples must match in every component. No direct frontend calls to the model provider or agent runtime.

Mocks must use the versioned examples and remain behind an explicit development setting. Connect the real agent early. Do not show mock data as a real extraction in the demo.

## Definition of done

- Acceptance criteria work through the integrated flow.
- Loading, retry, and validation errors are understandable.
- Contract and relevant component checks pass.
- Behavior changes include updated examples or documentation.
- Secrets and real citizen data are absent from commits and logs.
- Startup instructions and environment variables are documented.
- A teammate reviews the change and can reproduce the result.

## Practical checks

Run node scripts/check-contracts.mjs before a contract pull request. Each component must add its own install, run, and test commands when the stack is chosen. Test meaningful boundaries: payload validation, state transitions, retry behavior, agent extraction, and form confirmation. Keep tests proportional to the change.

Use concise commits such as feat: add session endpoint or docs: define review workflow. Never commit .env files, dependencies, build output, credentials, or production data.

## Hackathon rhythm

At kickoff, agree on the process to demonstrate and allocate issues. Integrate a minimal real flow in the first few hours. Check in at each milestone: what works, what blocks integration, and what contract changed. Reserve the last 20-25% of the event for deployment, integration fixes, and demo rehearsal.

## GitHub settings

After the team is invited, replace the commented CODEOWNERS examples with actual handles. A repository administrator should protect main with one review and the contracts status check, if supported by the repository plan. Workflow files alone do not enable branch protection.
