# GameBanana Browser And Installer

## Goal

Add a safe first-pass GameBanana browser and downloader/installer for the NTE game entry.

## Validated API flow

The current implementation should treat the following GameBanana API flow as the source of truth for the MVP:

1. list recent NTE mods with:
   - `Core/List/New?itemtype=Mod&gameid=23012&page={page}`
2. fetch mod details with:
   - `Core/Item/Data?itemtype=Mod&itemid={modId}&fields=...&return_keys=1`
3. derive the real downloadable file from:
   - `Files().aFiles()[fileId]._sDownloadUrl`
4. prefer the newest non-archived file when multiple file entries exist

## Scope

- show recent GameBanana mods for game id `23012`
- display screenshot-friendly mod cards and a details panel
- allow page-by-page browsing of the recent mod feed
- download the selected file through the validated file-entry URL
- only allow non-archived `.zip` file entries through the MVP installer flow
- extract supported Unreal mod assets and install them into the configured NTE Pak directory
- create a matching `.sig` file from an existing template when a `.pak` file needs one and the archive did not provide it
- record installed GameBanana mods in an app-managed registry
- show installed mods in a separate app tab
- support uninstalling a recorded mod completely
- support downloading and installing the newest available version for a recorded mod
- produce a clear install activity summary with backups and rollback-safe writes

## Guardrails

- parse GameBanana payloads at the boundary
- do not trust renderer-supplied download URLs
- only write under the configured NTE install root
- keep archive extraction inside app-managed staging directories
- back up replaced files before install and roll back on failure

## Acceptance criteria

- a user can browse page-based recent mods from GameBanana for NTE
- a user can inspect a preview image when one is available
- a user can install a selected mod file into a validated game path
- a user can switch to an installed-mod tab and see recorded installs
- a user can uninstall a recorded mod and restore replaced files where backups exist
- a user can trigger a newest-version install for a recorded mod
- install results show which files were created, replaced, or synthesized
- tests cover payload parsing and install planning behavior

## Known MVP limits

- the public flow is based on the recent-mod feed, not a full documented catalog endpoint
- the installer only copies recognized Unreal mod asset files
- the installer only accepts non-archived `.zip` GameBanana file entries
- enable/disable flows remain follow-up work
