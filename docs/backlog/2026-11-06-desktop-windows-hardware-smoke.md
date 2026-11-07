# Windows hardware smoke for the desktop app

**Surfaced:** 2026-11-06 (owner has no Windows machine; ruled "ship it, marked untried"). **Readiness:** manual.

`npm run dist -w packages/desktop` cross-builds `Skymap-<version>-win-setup.exe` on macOS. The
main-process code is shared with the Mac build and covered by the desktop tests, but nothing
Windows-specific has run: the NSIS installer, `installer/installer.nsh`, D3D12 WebGPU, Windows
display hot-plug.

**Checks, on a Windows 64-bit PC with a recent GPU driver:**

- Install: SmartScreen "Run anyway", the admin prompt, the firewall rule for TCP 47823 and 47824 on
  private and domain networks (`netsh advfirewall firewall show rule name=Skymap`).
- First sync completes; quit, go offline, launch: the sky renders (WebGPU on D3D12).
- A tablet scans the QR, the setup page on port 47824 walks it through trusting the certificate,
  and the remote steers the sky.
- A projector switched on after boot takes the sky; the dome grid lands with FRONT at the bottom.
- Escape on the sky leaves full screen; F11 and View › Full screen fill it again.
- Uninstall: the rule goes; "Downloaded sky data" deletes `%APPDATA%\Skymap\data` only when ticked.

**Where it came from.** The "Manual on Windows" step of
`docs/superpowers/plans/completed/2026-09-19-desktop-offline-app.md` (Task 10) and its Definition
of Done. Pick it up when a Windows PC or a venue tester is at hand; file any failure as a bug.
