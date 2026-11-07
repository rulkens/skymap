# Signing and notarization for the desktop installers

**Surfaced:** 2026-11-04. **Readiness:** deferred; the spec already puts it out of scope.

Both installers are unsigned. A Mac says it cannot check the app for malware and needs Open Anyway
in Privacy & Security; Windows SmartScreen shows "Windows protected your PC" and needs Run anyway.
`packages/desktop/README.md` walks a venue through both.

**What it would take.** An Apple Developer ID and notarization for the dmg, a Windows code-signing
certificate for the nsis installer, signing identities in `electron-builder.yml`, and secrets in the
release environment.

**Cost.** Recurring fees and key handling. Pick it up when the unsigned warnings block a real install.
