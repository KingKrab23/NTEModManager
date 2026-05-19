# Testing

This repository should enforce code quality locally before code reaches the main branch.

## Current tooling

- `eslint` for linting
- `prettier` for formatting
- `husky` for git hook orchestration
- `vitest` for unit and integration-style tests
- Node `24.15.0+` within the `24.x` line as the required local runtime baseline

## Expected script surface

These package scripts are part of the repo contract:

- `lint`
- `lint:fix`
- `format`
- `format:check`
- `test`
- `test:watch`
- `test:ci`
- `harness:validate`
- `build`
- `typecheck`

## Hook policy

Use Husky to enforce fast checks at commit time.

### Pre-commit

Current hook behavior:

- `prettier --check` on staged files via `lint-staged`
- `eslint` on staged TypeScript files via `lint-staged`
- `npm run test`
- `npm run harness:validate`

Pre-commit should stay fast enough that contributors do not bypass it casually.

### Pre-push

Current hook behavior:

- `npm run lint`
- `npm run format:check`
- `npm run test:ci`
- `npm run build`
- `npm run harness:validate`

If the suite becomes slow, keep the heaviest flows in CI while preserving a reliable local pre-push baseline.

## Test strategy

Minimum expected coverage areas for the first product slices:

- settings persistence
- GameBanana client parsing and error handling
- IPC contract validation
- filesystem path validation
- mod install planning and rollback behavior

## Design constraints

- tests should prefer deterministic fixtures over live third-party API calls
- parse external payloads at the boundary and test the parser separately
- filesystem tests should use temporary directories, never real game installs
- destructive operations need positive-path and rollback-path tests
- format and lint rules are part of the harness, not optional style preferences
- direct dependency version bumps must be checked against current npm registry version and `engines.node` metadata before they are committed

## CI expectations

CI should run at least:

- harness validation
- lint
- format check
- test suite

Hook failures and CI failures should point to script names that agents can rerun directly.
