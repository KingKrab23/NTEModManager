# GameBanana Browser And Installer

## Goal

Add a safe first-pass GameBanana browser and downloader/installer for the NTE game entry.

## Validated API flow

The current implementation should treat the following GameBanana API flow as the source of truth for the MVP:

1. list recent NTE mods with:
   - `Core/List/New?itemtype=Mod&gameid=23012&page={page}`
2. fetch mod details with:
   - `Core/Item/Data?itemtype=Mod&itemid={modId}&fields=...&return_keys=1`
   - `https://gamebanana.com/apiv11/Mod/{modId}/ProfilePage` for the live category object used by the NTE character filter
3. derive the real downloadable file from:
   - `Files().aFiles()[fileId]._sDownloadUrl`
4. prefer the newest non-archived file when multiple file entries exist

## Scope

- show recent GameBanana mods for game id `23012`
- display screenshot-friendly mod cards and a details panel
- support renderer-local browse filtering and sorting on the loaded page
  - search by mod name, author, summary, body, and install notes
  - filter between all mods, installable mods, previewed mods, and unsupported archives
  - filter the loaded browse window by GameBanana's live NTE skin category or character
  - sort the loaded browse window by recent feed order, downloads, likes, or name
- preload the first 25 recent GameBanana pages into one local browse window on startup and refresh
- download the selected file through the validated file-entry URL
- support a one-click setup install for the known Censorship Remover GameBanana mod by resolving its newest supported file from the live mod page data at install time
- allow non-archived `.zip`, `.7z`, and `.rar` file entries through the MVP installer flow
- allow local `.zip`, `.7z`, and `.rar` NTE mod archives through a drag-and-drop or native file-picker install entry point
- extract supported Unreal mod assets and install them into `HT/Content/Paks/~mods/<mod-folder>`
- create a matching `.sig` file from an existing template when a `.pak` file needs one and the archive did not provide it
- record installed GameBanana mods in an app-managed registry
- show installed mods in a separate app tab
- support enabling or disabling a recorded mod by moving its dedicated managed folder between the active `~mods` directory and app-managed backup storage outside the game install
- support uninstalling a recorded mod completely
- support selecting and installing a supported current GameBanana file for a recorded mod, defaulting to the newest supported file
- produce a clear install activity summary with backups and rollback-safe writes

## Guardrails

- parse GameBanana payloads at the boundary
- do not trust renderer-supplied download URLs
- only write under the configured NTE install root
- keep archive extraction inside app-managed staging directories
- back up replaced files before install and roll back on failure

## Acceptance criteria

- a user can browse a combined recent-mod window sourced from the first 25 GameBanana pages for NTE
- a user can refine the loaded recent-mod window with local search, filter chips, and sort controls
- a user can narrow the loaded recent-mod window to a specific NTE character when GameBanana categorizes the mod under a skin character
- a user can inspect a preview image when one is available
- a user can install a selected mod file into a validated game path
- a user can install a local supported archive into a validated game path by dropping it onto the app or choosing it from a native file dialog
- a user can install the known Censorship Remover utility into the validated `Win64` binaries directory from the setup surface without hardcoding a stale `dl` URL
- a user can switch to an installed-mod tab and see recorded installs
- a user can refine the installed-mod registry with local search and filter controls
- a user can disable a recorded mod without deleting its managed files, then enable it again later
- a user can uninstall a recorded mod and restore replaced files where backups exist
- a user can choose from the current supported GameBanana files for a recorded mod and install the selected file
- install results show which files were created, replaced, or synthesized
- tests cover payload parsing and install planning behavior

## Renderer behavior notes

- browse filters only refine the currently loaded 25-page window; they do not issue new GameBanana queries
- the character selector only lists the known NTE skin categories that are present in the currently loaded recent-mod window
- unsupported archive entries remain visible in the browser for inspection, but install actions stay disabled
- local archive installs reuse the managed staging, extraction, signature synthesis, and rollback-aware copy flow, but they do not appear in the recorded GameBanana install tab
- installed-mod search and filters only operate on the app-managed install registry

## Known MVP limits

- the public flow is based on the recent-mod feed, not a full documented catalog endpoint
- the installer only copies recognized Unreal mod asset files
- the installer only accepts non-archived `.zip`, `.7z`, and `.rar` GameBanana file entries
- enable or disable only applies to app-managed installs that live under the dedicated managed `~mods/<mod-folder>` directory
