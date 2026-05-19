# Architecture

This project is expected to be an Electron desktop application with a TypeScript codebase.

The main goal of the architecture is to isolate risky desktop concerns such as filesystem access from UI code while keeping the system small enough for humans and agents to reason about quickly.

## Top-level domains

- `catalog`
  - GameBanana search, fetch, parse, cache
- `mods`
  - install, uninstall, enable, disable, reconcile state
- `profiles`
  - selected mods, load order, per-game presets
- `settings`
  - app config, game paths, preferences
- `filesystem`
  - file copy, move, backup, rollback, validation
- `platform`
  - Electron app lifecycle, IPC, shell integrations

## Layering

Each domain should follow the same direction of dependency:

`types -> schemas -> repository -> service -> runtime -> ui`

Rules:

- `ui` must not talk to Node or the filesystem directly
- all desktop privileges flow through typed IPC boundaries
- external API payloads are parsed at the boundary
- filesystem mutations go through the `filesystem` domain only
- shared utilities stay small and generic

## Electron split

- `main`
  - app startup
  - window lifecycle
  - privileged filesystem and OS interactions
  - IPC handlers
- `preload`
  - narrow typed bridge from renderer to main
- `renderer`
  - UI, state, user flows

## Early implementation priorities

1. Game path selection and validation
2. Settings persistence
3. GameBanana mod search and details fetch
4. Mod install pipeline with backups
5. Enabled/disabled mod state and reconciliation

## Non-goals for the first slice

- plugin architecture
- cloud sync
- background daemon
- complex mod conflict resolution UI
