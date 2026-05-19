# NTE Mod Manager MVP

## Objective

Ship a desktop app that lets a user install and manage NTE mods from GameBanana or local files with minimal risk.

## User stories

- As a player, I can select my NTE install folder.
- As a player, I can search or inspect mod metadata.
- As a player, I can install a mod from a downloaded archive or known source.
- As a player, I can disable or remove a mod.
- As a player, I can see what the app changed.

## Functional requirements

- persist selected game path
- persist app settings
- fetch and display mod data from GameBanana
- install mods into the correct location
- keep enough metadata to uninstall cleanly
- show operation results and failures

## Guardrails

- never mutate files outside approved directories
- confirm dangerous actions
- warn on partial installs and expose recovery steps
- validate remote payloads before use

## Out of scope

- multi-game support
- online accounts
- mod ratings, comments, or social features
