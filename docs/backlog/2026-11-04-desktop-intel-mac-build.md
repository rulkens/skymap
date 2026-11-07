# Intel or universal macOS build for the desktop app

**Surfaced:** 2026-11-04 (ruled "arm64-only for now" while building the installers). **Readiness:** deferred.

`packages/desktop/electron-builder.yml` has `mac: target: dmg` with no `arch`, so electron-builder
builds the host's architecture: arm64 on the dev machine. An Intel Mac cannot run that dmg.

**Options.** `arch: [x64, arm64]` gives two dmgs; `arch: universal` gives one roughly twice the
size (today about 338 MiB). Neither has been tried, and `packages/desktop/tests/electronBuilderConfig.test.ts`
would need a look with two artifacts.

**Why deferred.** No venue has asked, and a universal build doubles the download. Pick it up when
an Intel show machine is a real install.
