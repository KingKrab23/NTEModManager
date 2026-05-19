# Toolchain Baseline

This repository targets Node `24.15.0+` within the Node `24.x` line.

## Versioning rule

Do not change direct dependency versions by guesswork.

Before changing them, check:

- the current published version in the npm registry
- the package `engines.node` requirement
- whether the package still fits the repository's active Node baseline

## Current baseline

- required Node runtime: `24.15.0+ <25`
- package installs on older runtimes should fail fast
- if a security fix requires a newer Node line, update this document before changing package versions
