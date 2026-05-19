# NTE Mod Manager Agent Guide

This repository is organized for agent legibility first.

Start here, then follow the linked source of truth:

- Product intent: `docs/PRODUCT_SENSE.md`
- Current product spec: `docs/product-specs/nte-mod-manager-mvp.md`
- Architecture rules: `ARCHITECTURE.md`
- Frontend constraints: `docs/FRONTEND.md`
- Visual direction: `docs/design-docs/visual-direction.md`
- Testing and hooks: `docs/TESTING.md`
- Toolchain baseline: `docs/references/toolchain-baseline.md`
- Reliability rules: `docs/RELIABILITY.md`
- Security rules: `docs/SECURITY.md`
- Active execution plans: `docs/exec-plans/active/`
- Quality tracking: `docs/QUALITY_SCORE.md`

## Working rules

1. Keep this file short. It is a map, not an encyclopedia.
2. When making product or architectural decisions, update the relevant document in `docs/`.
3. Prefer small, reviewable changes with explicit acceptance criteria.
4. Do not guess external API shapes. Validate boundaries and document assumptions.
5. Keep filesystem operations behind a small service boundary.
6. Default to Electron + TypeScript unless a decision document says otherwise.
7. If a task changes behavior, add or update the relevant execution plan or product spec.

## Domain assumptions

- Target platforms: Windows and macOS
- App type: desktop mod manager
- Primary external integration: GameBanana API
- Core local responsibilities:
  - discover game install paths
  - import, install, enable, disable, and remove mods
  - persist user settings and profiles
  - manage files safely and reversibly where practical

## Change checklist

Before closing a task, verify:

- product behavior matches the relevant spec
- architecture boundaries are still respected
- risky filesystem actions are explicit and recoverable
- docs remain accurate
