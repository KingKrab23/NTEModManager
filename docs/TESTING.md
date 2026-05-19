# Testing

This repository should enforce code quality locally before code reaches the main branch.

## Tooling goals

- `eslint` for linting
- `prettier` for formatting
- `husky` for git hook orchestration
- automated tests for unit and integration coverage

## Expected script surface

When the app scaffold is added, keep these package scripts stable:

- `lint`
- `lint:fix`
- `format`
- `format:check`
- `test`
- `test:watch`
- `test:ci`
- `harness:validate`

## Hook policy

Use Husky to enforce fast checks at commit time.

### Pre-commit

Run only fast, deterministic checks:

- `prettier --check` on staged files or the repository
- `eslint` on staged or affected files
- a small fast unit test slice when available
- `node scripts/validate-harness.mjs`

Pre-commit should stay fast enough that contributors do not bypass it casually.

### Pre-push

Run broader checks before remote integration:

- full lint pass
- full format check
- full unit test suite
- integration tests that do not require destructive local state

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

## CI expectations

CI should run at least:

- harness validation
- lint
- format check
- test suite

Hook failures and CI failures should point to script names that agents can rerun directly.
