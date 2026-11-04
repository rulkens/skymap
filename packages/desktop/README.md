# Skymap desktop

An Electron app that runs Skymap offline on one computer: a kiosk (flat) or a dome (fisheye) sky
window, a control window, and phones or tablets as remotes over the local network. Specs and plan:
`docs/superpowers/specs/2026-09-19-desktop-offline-app-design.md`.

## Develop

```bash
npm run desktop     # build the main process and control page, then electron . --windowed
```

- It reads the catalogs from the repo's `public/data` (or `SKYMAP_DATA_DIR`) and skips the
  sync and the prune.
- It serves the web build from the repo's root `dist/`, so run `vite build --mode desktop`
  at the root first (a plain `npm run build` bakes the R2 data URL into the pages).
- `--windowed` gives the sky a normal window with DevTools, and the View menu Reload and Toggle
  DevTools. In a show the menu only exists while the control window or About has focus.

## Package

```bash
npm run dist --workspace packages/desktop   # dmg and a Windows nsis installer in release/
```

- It builds the web app in desktop mode (an empty data base URL, no analytics), bundles the main
  process, the preload and the control page with Vite, then runs electron-builder for both
  targets. Both are unsigned.
- First it runs `npm run brand`: `scripts/buildBrandAssets.ts` shoots the brand page (`src/brand/`,
  the website's wordmark and star field) in headless Chromium into `resources/`: `icon.icns`,
  `icon.ico` (16–256), the dmg background at 1x and 2x and the installer's header and sidebar
  bitmaps. They are not committed; a new mark is a change to `public/favicon.svg` or `src/brand/`.
  It needs Playwright's Chromium (`npx playwright install chromium`).
- The Windows installer cross-builds on macOS arm64 without Wine (Verification B), about a minute.
- The web build ships as an `extraResources` copy at `resources/dist`, outside the asar so the
  server can stream it.
- Manual checks on Windows before a release: install, first sync, boot offline with WebGPU on D3D12,
  a tablet pairing after trusting `/ca.crt`, a projector switched on after boot taking the sky, the
  dome grid landing front-down.

## Where things live

- **Data root:** `<userData>/data/` mirrors the bucket's `data/` tree key for key, plus
  `synced.json` (key to sha256 of each verified file) and `inventory.json` (the last complete sync).
- **Settings:** `<userData>/setup.json`; the room code `remote-room.json`; the certificates `certs/`.
- **Pointer-last invariant (spec section 4):** a pointer file (the data manifest, a tile manifest) is
  uploaded after every file it names, and what a pointer names never changes at its key. That is
  why a sync that stops half way is safe: `inventory.json` is written last, and orphans are removed
  only when the sky loads after a complete sync.
- **Port:** the app serves HTTPS on `0.0.0.0:47823` (`APP_SERVER_PORT`). The sky window loads
  `https://localhost:47823/`.
- **Shortcut:** `CommandOrControl+Alt+K` shows or hides the control window. On one screen it floats
  over the sky.

## First launch and the firewall

macOS and Windows may ask to accept incoming network connections the first time Skymap starts.

- **Allow** lets phones and tablets pair with the app.
- **Deny** keeps the sky working with no remote.

The Windows installer adds an inbound rule named "Skymap" for TCP 47823 on private and domain
networks (`installer/installer.nsh`), so Windows does not ask. The public profile stays closed, and
uninstalling removes the rule. The rule names the port, so change it there when `APP_SERVER_PORT`
changes. macOS gets no rule because the app is unsigned; choose Allow in its prompt.

## Pair a phone or tablet

Scan the QR in the control window. The page is served over HTTPS with a certificate from this
install's own CA, so a tablet warns until it trusts that CA once:

- **iOS:** open `https://<address>:47823/ca.crt` in Safari and allow the profile download. Install it
  in Settings, General, VPN & Device Management, then turn it on under Settings, General, About,
  Certificate Trust Settings.
- **Android:** open `https://<address>:47823/ca.crt`, then install it from Settings, Security,
  Encryption & credentials, Install a certificate, CA certificate. Tapping through the warning
  works too; trusting the CA stops it coming back.

The control window shows the exact address. Give the computer's network a DHCP reservation, so the
address in a tablet's bookmark keeps working after a restart.
