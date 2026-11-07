# Updating the desktop app itself

**Surfaced:** 2026-11-06, while landing the desktop app (owner: "update as backlog item"). **Readiness:** awaiting-decision (which option).

Today only the data updates itself (at launch, daily or Update now). The app does not:
`packages/desktop/electron-builder.yml` has `publish: null`, and every build says 0.5.0. A venue updates by
installing the new dmg or installer over the old one; settings (`settings.json`), the CA and the data
mirror live in userData and survive, and a newer build opened beside a running older one takes over
(`isNewerBuild`, `takeInstanceLock`).

**Options, cheapest first.**

| Option | What it takes | What a venue gets |
|---|---|---|
| A. Manual (today) | nothing | a new installer from us, installed by hand |
| B. Update notice | a version file on R2 beside `data/offline-inventory.json`, read with the data sync; the control window says a newer version is out and where to get it | knows when to update; still installs by hand; works unsigned on both systems |
| C. Windows auto-update | `electron-updater` with R2 as a generic feed (`latest.yml` and the installers, published by the dist step), plus B for macOS | Windows downloads in the background and installs on restart |
| D. Auto-update everywhere | C plus Developer ID signing and notarization in `npm run dist` | both update themselves; signing also drops the open-anyway warnings |

**Constraints.** macOS's updater (Squirrel.Mac, under `electron-updater`) refuses an unsigned app, so in-place
updates on a Mac need the "Signing and notarization" item first (Apple Developer Program, yearly fee).
Windows updates unsigned, but SmartScreen warns until the app is signed. Any option needs a real version
bump per release (`packages/desktop/package.json`), which the About window shows beside the build time.
A venue offline at an update check sees the old version until it is online again, like the data.

**Suggested order.** B first (small, no signing, the same rhythm as data updates), D with the first signed
release. Pick it up with the first public release of the desktop app.
