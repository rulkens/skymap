# Desktop app — developer guide

`packages/desktop/` is an Electron app that runs Skymap on one computer with no internet after a
first download. Two installs use it: a kiosk (flat screen) and a dome (fisheye disc for a
planetarium projector). Phones and tablets drive the sky over the local network. The design is in
[`superpowers/specs/2026-09-19-desktop-offline-app-design.md`](superpowers/specs/2026-09-19-desktop-offline-app-design.md)
(§10 lists what the owner added later); the venue install guide is
[`packages/desktop/README.md`](../packages/desktop/README.md). This file is the map for changing it.

Layout under `packages/desktop/src/`: `main/` (Electron main process), `sync/` (the data mirror),
`control/` (the React control page and its preload), `brand/` (the art page behind the icons),
`utils/`, `data/`, `@types/` (one symbol per file, as in the app). Windows load pages from
`assets/` (`test-grid.html`, `sky-curtain.html`).

## Processes and windows

`main/main.ts` calls `runLifecycle` (`main/runLifecycle.ts`), which owns everything below. It
takes the single-instance lock first, so a second launch only raises the control window.

| Window            | File                                        | What it is                                                                                                                                                                                       |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sky               | `main/openSkyWindow.ts`, `loadSkyPage.ts`   | Frameless, black, fills one display. Loads `https://localhost:47823/?remote` (kiosk) or `/?dome&remote` (dome) from the app's own server. Hosts the relay room.                                  |
| Control           | `main/openControlWindow.ts`, `src/control/` | 960 x 760 React page from `file://`, sandboxed, talks to main only through the preload bridge. Close hides it.                                                                                   |
| Test grid         | `main/showTestGrid.ts`, `assets/test-grid.html` | Not a window: a child view laid over the sky window (dome grid with FRONT at the bottom, or the display number). Main owns its on/off state and pushes it, so the menu tick and the page agree. |
| About             | `main/openAboutWindow.ts`                   | 560 x 500 child of the control window, loading `?view=about` from the same page and preload. One branded window on both platforms.                                                               |
| Sky curtain       | `main/addOverlay.ts`, `assets/sky-curtain.html` | A black child view that fades in over every sky load and out once `window.__skymap.ready` resolves, or after 10 s.                                                                           |

- The control page is shown only when a person is needed: first run, no complete data, a stored
  display that is missing, or the shortcut. It is never shown before its first paint.
- Bridge contract: `src/@types/ControlBridge.ts`, implemented in `control/preload.cts` and the
  `ipcMain` handlers in `runLifecycle.ts`. Every handler checks the sender is the control window
  (the About window may only call `getAbout`). Growing the bridge is a contract change.
- `main/superviseWindow.ts` reloads a crashed renderer or GPU process, kills a renderer hung for
  30 s, and refuses navigation off the app's origin. An InfoCard link is a dead click on purpose.
- With one screen the control window floats above the sky (`screen-saver` level) and
  `CommandOrControl+Alt+K` (`data/controlShortcut.ts`) shows or hides it.

## Data mirror

Code: `src/sync/`, with `tools/deploy/r2/buildOfflineInventory.ts` on the publishing side.

- **Inventory.** `syncR2.ts` uploads `data/offline-inventory.json` last (see
  [DEPLOY.md](DEPLOY.md)): every offline group's files with sha256 and size. The app fetches it
  from `DESKTOP_DATA_ORIGIN` (the app's R2 data host, read from `.env.production` at build time by
  `vite.config.ts` and baked in as a define) with a 5 s timeout. No answer, or a non-OK status,
  means `offline`.
- **Mirror.** `<userData>/data/` holds the bucket's `data/` tree key for key. `synced.json` maps
  each key to the sha256 of the file verified there. `planSync` downloads what is unsynced,
  changed, or gone from disk, group by group, 8 files at a time (`downloadVerified` checks the
  hash and writes a `.part` file first). `synced.json` is written after every group, also on
  failure, so the next run resumes.
- **Inventory last.** `<userData>/data/inventory.json` is the fetched text, written only after
  every group succeeded. Its presence plus every key verified (`hasCompleteLocalSet`) is what
  "complete" means everywhere else. A failed run leaves the previous set intact.
- **Prune only at sky load.** `pruneOrphans` deletes files outside the local `inventory.json`
  (bookkeeping files and `.part` files are kept). `createSkyLoader` runs it just before showing the
  sky and never while a sync runs, because the old inventory would delete files being downloaded.
- **Disk check.** Before downloading, the plan's bytes are compared with free space;
  `InsufficientDiskError` carries needed and free bytes to the control page.
- **Outcome table.** `syncThenLoad` in `runLifecycle.ts` is spec §5: synced loads the sky (or, for
  a manual Update now, waits for Restart sky); offline or failed with data on disk shows status
  only and loads the sky; with no data it raises the control window.
- **Update policy.** `setup.dataUpdates` is `atLaunch`, `daily` at an `HH:MM`, or `manual`.
  `rearm` sets the next daily timer (`utils/nextDailyRun.ts`). A complete set with a policy other
  than `atLaunch` loads the sky without syncing first.
- **Dev.** `resolveDataRoot` returns the repo's `public/data` for an unpackaged run, or
  `SKYMAP_DATA_DIR` if set. Both are `dev`: no sync, no prune, no daily timer, Update now ignored.
- **Pointer-last.** The mirror is only safe because R2 uploads a pointer after every file it names
  and never changes what a pointer names. An asset family that breaks that breaks the kiosk.

## Server, CA and certificates

- `main/startAppServer.ts`: one HTTPS server on `0.0.0.0:47823` (`data/appServerPort.ts`), GET and
  HEAD only. It serves the web build (`main/distDir.ts`: `resources/dist` packaged, the repo's
  `dist/` otherwise), `/data/` from the mirror, and `/ca.crt`. Paths are resolved lexically
  (`main/resolveAppPath.ts`) and then by realpath, so a symlink cannot leave a root. Responses are
  `no-cache` so Restart sky sees a replaced manifest.
- `main/ensureLanCertificate.ts`: a per-install EC CA (20 years, name `Skymap local CA <hex>`,
  `pathLenConstraint 0`) and a leaf (397 days, the Apple limit) whose subject alternative names
  are the machine's host names and LAN addresses. Both live in `<userData>/certs/`. A corrupt CA
  or key is replaced rather than blocking launch; tablets then trust the new CA once more.
- **Reissue.** `startSecureServer.ts` re-reads the LAN names every 30 s
  (`data/lanCheckIntervalMs.ts`) and `renewServerCertificate.ts` swaps the leaf into the live
  server with `setSecureContext`. The CA never changes, so trust on tablets survives. The leaf is
  also reissued within 30 days of expiry.
- The app's own windows accept the leaf through `setCertificateVerifyProc` only if the CA signed
  it; everything else goes back to Chromium's verdict.
- Tablets fetch `/ca.crt` and install it once (steps in the README and the Help view).

## Relay wiring

`main/attachDesktopRelay.ts` attaches `tools/utils/remote/attachRemoteRelay` to the same server.

- **Stored room code.** `<userData>/remote-room.json` (`main/readRoomCode.ts`). It lasts across
  launches so a tablet bookmark keeps working. `codeFor` returns it for every host.
- **Who may host.** `mayHost` needs a loopback socket (`utils/isLoopbackRequest.ts`, the peer
  address, never a header) and `Origin` equal to `https://localhost:47823` (`data/appOrigin.ts`).
  Loopback alone would admit any local browser tab.
- **`onSky: false`.** `pairingOnSky: false` keeps the pairing QR off the sky; the control page
  draws it from `RelayHandle.onRoom`.
- **Rotation.** `main/rotateRoomCode.ts` stores the new code, then calls `relay.rotate`, which
  closes the old room's remotes with 4001. Clicks are queued (`utils/serially.ts`).
- **Network picker.** `setup.network` names an interface; `utils/lanOriginFor.ts` builds the QR
  origin from it, else the first interface. `utils/listLanInterfaces.ts` lists them. Before the
  sky hosts, main sends the stored code and origin itself, so the QR works during the first
  download.
- `server.on('upgrade')` destroys any upgrade outside `REMOTE_PATH_PREFIX`; once a listener exists
  Node stops closing them.
- The relay cannot report connected remotes, which is why setup shows no "Paired" confirmation.

## Windows, hot-plug and the quit gate

- `main/placeWindows.ts` is pure: the sky goes to the stored display by id, else the one
  display of the same size (ids change on re-plug), else the primary; the control window gets
  another display or none. Zero displays returns `null` and waits for `display-added`.
- `runLifecycle.ts` listens to `display-added` and `display-removed`: it re-places the windows,
  refills the sky window, and pushes the display list to the page. A projector switched on after
  boot takes the sky back. If the stored display is missing, the control window opens.
- `main/createQuitGate.ts`: the sky window and the control window ignore close (Alt+F4, Cmd+W)
  until `allowQuit`. Quit is the control page's Quit panel or the menu's Quit item; both call the
  gate, never the `quit` role.
- `main/installAppMenu.ts` with `buildMenuTemplate`: macOS has one menu bar, and it carries the
  menu only while the control window or About has focus, so a visitor's keyboard on the sky has no
  Cmd+Q, Cmd+H or Cmd+W. Windows hangs it on the control window, hidden until Alt. In `--windowed`
  the menu is always there with Reload and Toggle DevTools.
- The sky window hides scrollbars, text selection and, after 3 s still, the cursor
  (`hideSkyChrome.ts`, `utils/createIdleTimer.ts`). Fades respect `prefers-reduced-motion` in
  their own pages.

## Build and packaging

- `packages/desktop/vite.config.ts` has three modes (plus `brand`, below): `control` (the React
  page, an IIFE at `build/control/`), `preload` (`preload.cts` to `preload.cjs`), and `main`
  (`build/main/main.cjs`, everything but Electron and Node bundled, including `ws` and
  `selfsigned`). `npm run build -w packages/desktop` runs all three.
- Root `vite build --mode desktop` builds the web app with `.env.desktop`: an empty
  `VITE_DATA_BASE_URL` so `dataUrl()` resolves to the app's own `/data/`, and no analytics. A plain
  `npm run build` bakes the R2 URL in and is the wrong input.
- `scripts/buildBrandAssets.ts` (`npm run brand -w packages/desktop`) builds the brand page
  (`src/brand/`, mode `brand`) and shoots it with Playwright's Chromium into `resources/`: `icon.icns`,
  `icon.ico`, `icon.png`, the dmg background at 1x and 2x, and the NSIS header and sidebar
  bitmaps. The encoders are in `scripts/utils/`. `resources/` is gitignored, so a changed mark is a
  source change. It needs `npx playwright install chromium`.
- `electron-builder.yml`: mac `dmg` (arm64, the host's arch), win `nsis` x64, artifact names
  `Skymap-<version>-mac.dmg` and `Skymap-<version>-win-setup.exe`, the version from the package's
  `package.json`. The web build rides as `extraResources` at `resources/dist`, outside the asar
  so the server can stream it, with `dist/data/**` filtered out (it would add 2.7 GB).
  `publish: null`: no auto-update channel.
- `installer/installer.nsh` is the nsis include: branding colours, the firewall rule
  (`netsh advfirewall`, TCP 47823, private and domain profiles, added on install and removed on
  uninstall), and the uninstaller's unticked "Downloaded sky data" box, which deletes
  `%APPDATA%\Skymap\data` only when ticked and never on an update. The exe name and the port are
  hard-coded there; `packages/desktop/tests/electronBuilderConfig.test.ts` pins the port against
  `APP_SERVER_PORT`. The installer is per machine, which is what lets it add the rule.
- Release: `npm run dist -w packages/desktop` (web build in desktop mode, brand, build,
  electron-builder for both targets, into `packages/desktop/release/`). Both installers are
  unsigned, about 340 MB each.

## Dev runs

- `npm run desktop` builds the main process and control page, then `electron . --windowed`.
  It reads `public/data` (or `SKYMAP_DATA_DIR`) and serves the repo's root `dist/`, so run
  `vite build --mode desktop` at the root first.
- `--windowed` gives the sky a normal 1280 x 720 window with DevTools and the full menu.
- In a worktree without `public/data`, point `SKYMAP_DATA_DIR` at a checkout that has it.
- Manual checks that no test covers: install on Windows (firewall rule, uninstaller box, "Launch
  Skymap"), boot with networking off, WebGPU on D3D12, a tablet pairing after trusting `/ca.crt`,
  a projector switched on after boot, the dome grid landing front-down, the dmg's Finder labels in
  light mode, and the black wait at show start (up to 10 s while tiles load).

## Tests

- `npm test -w packages/desktop` and `npm run typecheck -w packages/desktop` are a CI step
  (`.github/workflows/ci.yml`). The desktop package has its own `vitest.config.ts` (node
  environment, `tests/**/*.test.{ts,tsx}`) and `tsconfig.json`; `tests/` mirrors `src/`.
- The control page is tested in jsdom: a file opts in with `// @vitest-environment jsdom` (see
  `tests/control/components/SetupFlow/SetupFlow.test.tsx`). The bridge is passed as a prop, so a
  test drives the page with a fake one.
- Server, sync (against a local HTTP fixture), placement, menu template, relay and rotation
  logic have tests under `tests/main`, `tests/sync` and `tests/utils`.
- The desktop package is not in the root `vitest` run (`tests/**` at the repo root only); its tests run
  with its own config. The inventory builder's test is `tests/tools/deploy/r2/buildOfflineInventory.test.ts`.

## Landmines

- **Module resolution.** The desktop `tsconfig.json` uses Bundler resolution and imports are
  extensionless, like the app. An earlier NodeNext setup forced `.js` extensions and could not
  compile `tools/utils/remote/attachRemoteRelay`; Vite bundles it instead.
- **Module scripts are blocked on `file://`.** The control page is an IIFE with a plain `defer`
  script (`plainScript` plugin in `vite.config.ts`). A `type="module"` tag renders nothing.
- **Fonts for `file://`.** `tokens.css` names its faces at `/fonts/`, which on `file://` is the
  disk root. The `bundledFonts` plugin rebases them so Vite bundles the files beside the page. A
  new asset type on the page also needs adding to its CSP meta.
- **Port 47823 and the single instance.** The port is fixed so bookmarks and trusted origins
  survive. A second Electron on the machine fails to listen. An Electron left behind by a crashed
  dev run or a test harness keeps the port and the lock; find it with `lsof -i :47823` and kill
  it before blaming the code.
- **`sync-r2` inventory has never run for real.** `syncR2.ts` builds and uploads
  `offline-inventory.json`, but only typecheck, unit tests and reading cover that path. Its first
  real run is also the first real test of `runSync` against R2. The inventory build throws on an
  empty offline group, by design.
- **Architecture.** The mac build is arm64 only. An Intel Mac gets no installer until someone
  builds `x64` or a universal one (backlog).
- **Firewall prompt on macOS.** The unsigned app cannot be given a preinstalled rule, so macOS asks
  to accept incoming connections on first launch. Deny leaves the sky working and no remote.
- **Uninstaller user.** The nsis uninstaller reads the current user's `%APPDATA%`; if another
  admin elevates it, it looks in that admin's profile.
- **Unsigned.** Gatekeeper and SmartScreen both warn; the README tells the venue how to proceed.
  Signing and notarization are out of scope (spec) and in the backlog.
