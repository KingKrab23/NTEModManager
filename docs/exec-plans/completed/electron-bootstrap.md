# Electron Bootstrap

## Goal

Bootstrap a maintainable Electron + TypeScript application scaffold that follows the repository harness.

## Delivered

- Electron main, preload, renderer, and shared source layout
- typed IPC contract for reading settings and selecting a game directory
- JSON-backed settings persistence in the main process
- minimal functional renderer shell with the NTE-inspired visual system
- ESLint, Prettier, Vitest, Husky, and local hook wiring

## Verification target

- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run harness:validate`

## Follow-up work

1. add a GameBanana catalog client with boundary validation
2. add game path verification beyond absolute-path checks
3. add a mod install planner and rollback-safe filesystem workflow
