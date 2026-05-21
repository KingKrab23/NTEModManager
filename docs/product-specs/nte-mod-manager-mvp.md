# NTE Mod Manager MVP

## Objective

Ship a desktop app that lets a user install and manage NTE mods from GameBanana or local files with minimal risk.

## User stories

- As a player, I can select my NTE install folder.
- As a player, I can install the required mod framework files into my configured NTE folder without copying them by hand.
- As a player, I can search or inspect mod metadata.
- As a player, I can install a mod from a downloaded archive or known source.
- As a player, I can disable or remove a mod.
- As a player, I can see what the app changed.

## Functional requirements

- persist selected game path
- persist app settings
- download and place the required ASI loader and signature bypass files into the validated NTE install layout
- fetch and display mod data from GameBanana
- browse recent NTE mods from the validated GameBanana `gameid=23012` feed
- display a mod screenshot or preview image when the API provides one
- derive the installable file URL from `Files().aFiles()[fileId]._sDownloadUrl`
- install mods into the correct location
- install supported Unreal asset files from downloaded GameBanana archives into `HT/Content/Paks/~mods/<mod-folder>` so same-named mod files do not overwrite unrelated installs
- synthesize a matching `.sig` file from an existing Pak signature template when a downloaded `.pak` file needs one and the archive does not include it
- keep enough metadata to uninstall cleanly
- list installed GameBanana mods separately from the browse feed
- allow uninstalling a recorded mod completely
- allow reinstalling a recorded mod from the newest available GameBanana file entry
- show operation results and failures

## Guardrails

- never mutate files outside approved directories
- confirm dangerous actions
- warn on partial installs and expose recovery steps
- validate remote payloads before use
- do not trust renderer-supplied download URLs for privileged install actions

## Out of scope

- multi-game support
- online accounts
- mod ratings, comments, or social features
