# Desktop app — developer guide

`packages/desktop/` is an Electron app that runs Skymap on one computer with no internet after a
first download. Two installs use it: a kiosk (flat screen) and a dome (fisheye disc for a
planetarium projector). Phones and tablets drive the sky over the local network. The design is in
[`superpowers/specs/completed/2026-09-19-desktop-offline-app-design.md`](superpowers/specs/completed/2026-09-19-desktop-offline-app-design.md)
(§10 lists what the owner added later); the venue install guide is
[`packages/desktop/README.md`](../packages/desktop/README.md). This file is the map for changing it.

## Layout

`packages/desktop/src/` is grouped by process first, then by concern module, then by role. The
process is the line the bundler and the sandbox enforce, so it sits on the first level, where
`tests/conventions/desktopImportBoundary.test.ts` guards it by prefix. Inside a process each concern
module holds only the role folders it needs (`@types/`, `data/`, `utils/`, `components/`), as a
Layer does in the app (ADR 0014). `tests/conventions/desktopFolderShape.test.ts` keeps the shape.

| Folder                         | Holds                                                                                                                                        | May import                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `@types/`, `data/`             | only what crosses a process boundary: the bridge contract and what it carries (`ControlState`), the IPC channel table and constants read by two processes, runtime-neutral constants. A root home exists only while something lives in it (a root `utils/` joins when a shared helper does) | no `electron`, Node or React; nothing under `main/`, `preload/`, `control/`, `brand/` |
| `main/`                        | the Electron main process (Vite mode `main`). Root: `main.ts` and `@types/`. Modules: `lifecycle`, `windows`, `sky`, `menu`, `server`, `certificates`, `lan`, `relay`, `setup`, `sync`, `files` | Electron, Node, the root homes, `tools/` (the relay); no React, CSS or page code    |
| `preload/`                     | `preload.cts`, the sandboxed bridge (Vite mode `preload`)                                                                                    | `electron` and the root homes only                                                 |
| `control/`                     | the control page (Vite root). Root: `index.html`, `main.tsx`, `control.css`, `controlChrome.module.css`. Modules: `shell`, `setup`, `pairing`, `sync`, `sky` | no `electron`, Node, `main/`, `preload/`, `brand/` or `tools/`                     |
| `brand/`                       | the art page behind the icons and installer bitmaps (Vite mode `brand`): `components/`, `@types/`                                            | as `control/`, and may reuse `control/` (the sky, `control.css`)                   |

Every folder keeps the app's rules: `@types/` files are `.d.ts` with one alias, `data/` one
constant per file, `utils/` one function per file named for it, a main-process module file declares
only its own symbol (`tests/conventions/serviceFilePurity.test.ts`), a component folder holds only
its component, styles, constants and hooks, and no folder holds more than 15 files. Windows load
pages from `assets/` (`test-grid.html`, `sky-curtain.html`).

## Processes and windows

`main/main.ts` installs process-wide error logging (a stray error would otherwise be Electron's
modal dialog over the sky), calls `runLifecycle` and, if it rejects, shows why in the README's words
(`startErrorText`: a taken port, a full disk) and exits. `runLifecycle` (`main/lifecycle/`) is
wiring: it takes the single-instance lock first, so a second launch only raises the control window,
unless it is a newer build (`isNewerBuild`, from the build time it sends): then the running one quits
and the newcomer, still asking for the lock (`takeInstanceLock`), starts in its place,
and the decisions sit in pieces with their own tests: `bootPlan` (what a launch does first),
`createSyncThenLoad` (a sync and what follows it, through `syncOutcomeAction`, spec §5's outcome
table; it never rejects and always ends the syncing status), `createDailySchedule` (the one daily timer),
`registerControlIpc` (the page's requests), `createSetupStore` (the setup in `settings.json`) and
`createSkyWindows` (`main/windows/`: the sky window, its placement and the test grid).

| Window            | File                                        | What it is                                                                                                                                                                                       |
| ----------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sky               | `main/windows/openSkyWindow.ts`, `main/sky/loadSkyPage.ts` | Black, fills one display; after Escape a window with no title bar, moved by its top edge. Loads `https://localhost:47823/?remote` (kiosk) or `/?dome&remote` (dome) from the app's own server. Hosts the relay room.                                  |
| Control           | `main/windows/openControlWindow.ts`, `src/control/` | 960 x 760 React page from `file://`, sandboxed, talks to main only through the preload bridge. Close hides it.                                                                                   |
| Test grid         | `main/sky/showTestGrid.ts`, `assets/test-grid.html` | Not a window: a child view laid over the sky window (dome grid with FRONT at the bottom; on a kiosk a frame, 10% grid, circle and centre cross with the display number and pixel size). `createSkyWindows` holds it; its on/off state is in `ControlState`, so the menu tick and the page agree, and a mode change drops it in main. |
| About             | `main/windows/openAboutWindow.ts`           | 600 x 660 child of the control window, loading `?view=about` from the same page and preload. One branded window on both platforms.                                                               |
| Sky curtain       | `main/sky/addOverlay.ts`, `assets/sky-curtain.html` | A black child view (after 0.6 s a slowly turning starfield, "Loading the universe" in the Splash's type and a rotating joke line) that fades in over every sky load and out once `window.__skymap.ready` resolves, or after 10 s.                                                                           |

- The control page is shown only when a person is needed: first run, no complete data, a stored
  display that is missing, or the shortcut. It is never shown before its first paint.
- **One state.** Main owns one `ControlState` (`src/@types/ControlState.d.ts`: status, progress,
  whether a complete set is on disk, the sky running or loading, the test grid, the room, displays
  with the sky's placement, networks, setup, first run, About's facts). It pushes it whole on
  `control:state` after every change; the page reads it once with `getState()` and takes every push.
  There is no load-time replay, so the page has no timing contract with main.
- **Bridge contract:** `src/@types/ControlBridge.d.ts`, implemented in `preload/preload.cts`.
  Channel names live in one table, `src/data/controlChannels.ts`, that preload and main both read.
  Main answers every request through `registerControlIpc`, the one sender check: a request from
  any window but the control window is refused with a rejection (the About window may only call
  `getState`). Growing the bridge is a contract change.
- **Status kinds** (`ControlStatus`): `idle`, `syncing`, `complete` (the last sync's data is
  loaded or loading), `ready` (new data waits for Restart sky), `offline`, `failed`, `diskFull`, `paused`.
  Whether data is on disk is `ControlState.hasData`, not part of the status. The page reads each
  kind's words from one table, `control/sync/data/statusView.ts`.
- **Settings** live in `<userData>/settings.json` through electron-store (`main/settings/openSettings.ts`,
  owner ruling 2026-11-06): the setup, the room code and how the sky window was left, each read
  through its own parser so a damaged value falls back to its default. Certificates and the
  mirror's lists stay files of their own; they are data, not settings.
- **Setup saves** go through `createSetupStore`, the setup's one writer (the first-run write
  too): the settings write is synchronous, so saves land in the order asked; the app follows a change only once it is stored, and a refused
  save leaves the stored setup. The page shows Saving, Saved, or an alert, and drops its draft.
- **Rotate code** is a two-step button: "Rotate code", then "Disconnect tablets and rotate"
  (Escape or leaving the button cancels). It stays busy until main has stored the new code.
- `main/windows/superviseWindow.ts` reloads a crashed renderer or GPU process (after 2 s, doubling
  to a minute while it keeps crashing, reset after a minute up), kills a renderer hung for 30 s,
  and refuses navigation off the app's origin. An InfoCard link is a dead click on purpose. A sky
  load that fails with nothing crashed is tried once more after `SKY_RETRY_MS` (`createSkyLoader`),
  then waits for Restart sky; a curtain that fails to load only loses its fade. The control and
  About windows reload at once after a renderer crash (`createControlPageWindow`).
- Once the sky first shows, `powerSaveBlocker` (`prevent-display-sleep`) keeps the display and the
  machine awake until the app quits: tablets steering over the relay are no local input, so the
  OS's idle timer would otherwise blank a dome and, at sleep, take the server and the tablets down.
- With one screen the control window floats above the sky (`screen-saver` level) and
  `CommandOrControl+,` (`data/controlShortcut.ts`, owner ruling 2026-11-06: the systems' settings
  key) brings it back: Skymap › Settings… carries it, and the sky reads it itself
  (`utils/isControlKey.ts`), since a full-screen sky has no menu. It is not a global shortcut, which
  would take Cmd+, from every other app while Skymap runs.
- **Leaving full screen.** `preload/skyPreload.cts` (no API for the page) sends `sky:escape` for an
  Escape press the page left unused: the app's own handlers (palette, popover, splash) call
  `preventDefault`, so a new Escape use in the app must too, or it also drops full screen. Main then
  makes the sky a 75% window on its display, which display changes leave alone. The window has no
  title bar, only its buttons over the page (hidden in full screen): close quits Skymap, the green
  button (or Windows' maximize) fills the screen again (owner ruling). The same preload draws a
  hairline along the top edge, and a press in the top 28 px on bare sky (not on one of the page's
  controls, the search bar or the buttons) never reaches the sky: main moves the window with the
  cursor (`utils/dragWithCursor.ts`; `-webkit-app-region` stops taking
  presses once the curtain's view has been laid over and lifted). F11 (Ctrl+Cmd+F on
  macOS, `utils/isFullScreenKey.ts`, read off the sky since Windows hangs the menu elsewhere) or
  View › Full screen puts it back. A launch puts the sky back as it was left, full screen or a
  window at its last bounds (`skyWindow` in the settings; `utils/windowBounds.ts` falls back to
  three quarters of the screen when the top edge would be out of reach).

## Data mirror

Code: `src/main/sync/`, with `tools/deploy/r2/buildOfflineInventory.ts` on the publishing side.

- **Inventory.** `syncR2.ts` uploads `data/offline-inventory.json` last (see
  [DEPLOY.md](DEPLOY.md)): every offline group's files with sha256 and size. Its key has one home,
  `tools/deploy/data/offlineInventoryKey.ts`, read by both sides. The app fetches it from
  `DESKTOP_DATA_ORIGIN` (the app's R2 data host, read from `.env.production` at build time by
  `vite.config.ts` and baked in as a define) within `INVENTORY_TIMEOUT_MS`. No answer means `offline`; a non-OK
  status means `failed`.
- **Mirror.** `<userData>/data/` holds the bucket's `data/` tree key for key. `synced.json` maps
  each key to the sha256 of the file verified there. `listMirrorKeys` lists what is on disk in one
  async walk (never `existsSync` per key: 70k of them blocked main for seconds), and runSync,
  `hasCompleteLocalSet` and `pruneOrphans` all read it. `planSync` downloads what is unsynced,
  changed, or gone from disk, group by group, 8 files at a time (`downloadVerified` checks the
  hash and writes a `.part` file first). `synced.json` is written after every group, also on
  failure, so the next run resumes. A key that would leave the mirror is refused.
- **Pause.** The button beside the progress bar aborts the run's signal (`pauseSync`): in-flight
  files are dropped with their `.part`, and the outcome is `paused`. Resume is Update now, whose
  bar counts on from the paused bytes (`createSyncThenLoad` carries them); a launch or daily update
  resumes too.
- **Failure.** A failed run carries a `SyncFailure`: the first file to fail (null for none), its
  error, and a reason. `stale` (a 404 or a hash mismatch) means the list names files the bucket no
  longer holds as listed: a deploy landed, or a `sync-r2` without the inventory publisher replaced
  them. The control page shows the file and error under the status line, and main logs it.
- **Retries.** `downloadWithRetries` tries a file `DOWNLOAD_RETRIES` more times after a network or
  server error or a refused rename (Windows antivirus), and a download that receives nothing for
  `DOWNLOAD_IDLE_MS` is aborted. A 404 or a sha mismatch (`UpstreamChangedError`) fails at once:
  a deploy landed mid-run. Progress goes out at most every `PROGRESS_INTERVAL_MS`, plus once at
  the end, and is reset when a sync starts.
- **Outcomes.** `runSync` returns `synced`, `unchanged` (nothing to download against the same
  inventory: a current sky is not reloaded), `offline`, `failed`, or `diskFull` with needed and
  free bytes.
- **Inventory last.** `<userData>/data/inventory.json` is the fetched text, written only after
  every group succeeded. Its presence plus every key verified (`hasCompleteLocalSet`) is what
  "complete" means everywhere else. A failed run leaves the previous set intact.
- **Prune only at sky load.** `pruneOrphans` deletes files outside the local `inventory.json`
  (bookkeeping files and `.part` files are kept). `createSkyLoader` runs it just before showing the
  sky. Syncs, prunes and sky loads share one queue in `runLifecycle`, so a prune never meets a
  download (the old inventory would delete files being downloaded) and two loads never overlap; a
  sky load asked for during a sync waits for it.
- **Outcome table.** `syncOutcomeAction` is spec §5: synced loads the sky (or, for a manual
  Update now, waits for Restart sky); offline, failed or a full disk with data on disk shows the
  status and loads the sky if none runs; with no data it raises the control window. Restart sky
  without a complete set is refused in main and disabled, with the reason, in the page.
- **Update policy.** `setup.dataUpdates` is `atLaunch`, `daily` at an `HH:MM`, or `manual`.
  `createDailySchedule` holds the one daily timer (`main/sync/utils/nextDailyRun.ts`) and re-arms
  after every run, a failed one too. A complete set with a policy other than `atLaunch` loads the
  sky without syncing first (`bootPlan`).
- **Dev.** `resolveDataRoot` returns the repo's `public/data` for an unpackaged run, or
  `SKYMAP_DATA_DIR` if set. Both are `dev`: no sync, no prune, no daily timer, Update now ignored.
- **Pointer-last.** The mirror is only safe because R2 uploads a pointer after every file it names
  and never changes what a pointer names. An asset family that breaks that breaks the kiosk.

## Server, CA and certificates

- `main/server/startAppServer.ts`: one HTTPS server on `0.0.0.0:47823` (`data/appServerPort.ts`), GET and
  HEAD only. It serves the web build (`main/server/distDir.ts`: `resources/dist` packaged, the repo's
  `dist/` otherwise), `/data/` from the mirror, and `/ca.crt`. Paths are resolved lexically
  (`main/server/resolveAppPath.ts`) and then by realpath, so a symlink cannot leave a root. The
  mirror's bookkeeping files and `.part` downloads are 404. Responses are `no-cache` so Restart sky
  sees a replaced manifest. A single-span `Range` gets a 206: the surface tiles are packs the app
  reads one tile at a time, and it skips a pack whose server answers 200.
- `main/certificates/ensureCa.ts`: a per-install EC CA (20 years, name `Skymap local CA <hex>`,
  `pathLenConstraint 0`), read once per launch so `/ca.crt` and the leaf always agree. It has no
  name constraints (`selfsigned` drops the extension), so a tablet that trusts it trusts it for
  every site: the CA key in `<userData>/certs/` is as sensitive as a password.
  `ensureLeaf.ts`: a leaf (397 days, the Apple limit) whose subject alternative names are the
  machine's host names and LAN addresses. Both live in `<userData>/certs/`. A corrupt CA or key is
  replaced rather than blocking launch; tablets then trust the new CA once more.
- **Reissue.** `main/lan/watchLan.ts` re-reads the LAN every 30 s
  (`main/lan/data/lanCheckIntervalMs.ts`). On a change it drives three things: the certificate
  (`renewServerCertificate.ts` swaps the leaf into the live server with `setSecureContext`), the
  page's network list, and the QR's origin, so a kiosk that booted before the network recovers
  without a restart. The CA never changes, so trust on tablets survives. A leaf within 30 days of
  expiry is reissued at launch.
- The app's own windows accept the leaf through `setCertificateVerifyProc` only if the CA signed
  it; everything else goes back to Chromium's verdict. `setPermissionRequestHandler` refuses every
  browser permission.
- **Tablet setup page.** `main/server/startTabletSetupServer.ts`: plain HTTP on `0.0.0.0:47824`
  (`data/tabletSetupPort.ts`) serving only `assets/tablet-setup.html` at `/`, its `/guide/*.webp` screenshots (kept once in `packages/website/src/assets/docs/tablet-guide`, shipped as an extra resource, `server/tabletGuideDir.ts`) and the CA at `/ca.crt`,
  so a tablet meets no warning before it trusts the CA. The pairing QR opens it with the room code
  after `#`, which never goes over the wire. The page shows the steps for its OS, checks trust by a
  `no-cors` fetch of the HTTPS server's `/ca.crt` every 2 s (it only succeeds once the CA is trusted),
  then links to the remote, or goes straight there when already trusted. `fillTabletSetupPage` fills
  in the app port and the remote's path from `pairingUrl`. The page is as trustworthy as the LAN: a
  machine that spoofs it can hand out its own CA, the same risk as clicking past the HTTPS warning
  it replaces. The Windows firewall rule opens both ports. A failed listen is logged, not fatal.

## Relay wiring

`main/relay/attachDesktopRelay.ts` attaches `tools/utils/remote/attachRemoteRelay` to the same server.

- **Stored room code.** `roomCode` in the settings (`main/relay/readRoomCode.ts`). It lasts across
  launches so a tablet bookmark keeps working. `codeFor` returns it for every host.
- **Who may host.** `mayHost` needs a loopback socket (`main/relay/utils/isLoopbackRequest.ts`, the peer
  address, never a header) and `Origin` equal to `https://localhost:47823` (`main/server/data/appOrigin.ts`).
  Loopback alone would admit any local browser tab.
- **`onSky: false`.** `pairingOnSky: false` keeps the pairing QR off the sky; the control page
  draws it from `RelayHandle.onRoom`.
- **Rotation.** `main/relay/rotateRoomCode.ts` stores the new code, then calls `relay.rotate`, which
  closes the old room's remotes with 4001.
- **Network picker.** `setup.network` names an interface; `main/lan/utils/lanOriginFor.ts` builds the QR
  origin from it, else the first interface. `main/lan/utils/listLanInterfaces.ts` lists them. The
  room is in `ControlState` from launch, so the QR works during the first download.
- `server.on('upgrade')` destroys any upgrade outside `REMOTE_PATH_PREFIX`; once a listener exists
  Node stops closing them.
- The relay cannot report connected remotes, which is why setup shows no "Paired" confirmation.

## Windows, hot-plug and the quit gate

- `main/windows/utils/placeWindows.ts` is pure: the sky goes to the stored display by id, else the
  one display of the same size (ids change on re-plug), else the primary; the control window gets
  another display or none. `storedMissing` says a stored display fell back. Zero displays returns
  `null` and waits for `display-added`. Displays are numbered once, in `listDisplays`
  (`DisplayInfo.number`); the page reads the numbers and the placement from the state.
- `runLifecycle.ts` listens to `display-added`, `display-removed` and `display-metrics-changed`:
  it re-places the windows, refills the sky window, and pushes displays and placement to the page.
  A projector switched on after boot takes the sky back. If the stored display is missing, the
  control window opens. The control window is moved only when it is not on its display, so one the
  operator placed stays put.
- `main/windows/watchQuitting.ts`: the sky window and the control window ignore close (Alt+F4,
  Cmd+W) until `before-quit`. That event comes from the control page's Quit panel, the menu's Quit,
  the Dock, a macOS logout or shutdown, and SIGTERM, so none of them is refused; a window's own
  close never emits it. A Windows shutdown or logoff ends the app without it, which costs nothing:
  every file write is atomic.
- `main/menu/installAppMenu.ts` with `buildMenuTemplate`: macOS has one menu bar, and it carries the
  menu only while the control window, About, or a sky Escape turned into a window has focus, so a
  visitor's keyboard on a full-screen sky has no Cmd+Q, Cmd+H or Cmd+W. Skymap › Settings…
  (Cmd+, or Ctrl+,) opens the control window. Windows hangs it on the control window, hidden until Alt. In `--windowed`
  the menu is always there with Reload and Toggle DevTools. The test grid item is ticked by its id,
  not by rebuilding the menu.
- The sky window hides scrollbars, text selection and, after 3 s still, the cursor
  (`main/sky/hideSkyChrome.ts`, `main/sky/utils/createIdleTimer.ts`). Fades respect `prefers-reduced-motion` in
  their own pages, which read their durations from the overlay's query (`fadeIn`, `fadeOut`), so
  each time lives once, in `main/sky/data/`.

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
  `icon.ico`, `icon.png`, `volume.icns` (the mounted dmg's drive icon, `dmg.icon`), the dmg background
  at 1x and 2x, and the NSIS header and sidebar bitmaps. The icons draw the Skymap mark from
  `packages/website/src/utils/skymapIcon.ts`, the favicon's source too; slots of 32 px and under get
  its heavier small drawing (`?drawing=small`). The encoders are in `scripts/utils/`. `resources/` is
  gitignored, so a changed mark is a source change. It needs `npx playwright install chromium`.
- The dmg background's twilight band sits under Finder's icon labels, which are black in light mode
  and white in dark mode whatever the dmg says: its luminance (about 0.18) gives both about 4.6:1.
  Re-measure both after changing the band or `dmg.contents`.
- `electron-builder.yml`: mac `dmg` (arm64, the host's arch), win `nsis` x64, artifact names
  `Skymap-<version>-mac.dmg` and `Skymap-<version>-win-setup.exe`, the version from the package's
  `package.json`. The web build rides as `extraResources` at `resources/dist`, outside the asar
  so the server can stream it, with `dist/data/**` filtered out (it would add 2.7 GB).
  `publish: null`: no auto-update channel.
- `installer/installer.nsh` is the nsis include: branding colours, the firewall rule
  (`netsh advfirewall`, TCP 47823 and 47824, private and domain profiles, added on install and removed on
  uninstall), and the uninstaller's unticked "Downloaded sky data" box, which deletes
  `%APPDATA%\Skymap\data` only when ticked and never on an update. The exe and rule names come
  from electron-builder (`${PRODUCT_FILENAME}`, `${PRODUCT_NAME}`); the port is hard-coded there.
  Electron names `userData` from `package.json`'s `productName` alone (electron-builder does not
  copy the yml's in), so the two are kept equal. `packages/desktop/tests/electronBuilderConfig.test.ts`
  pins both contracts: the names, and the port against `APP_SERVER_PORT`. The
  welcome text repeats `APP_SUMMARY`; keep the two in step. The installer is per machine, which is
  what lets it add the rule.
- Release: `npm run dist -w packages/desktop` (web build in desktop mode, brand, build,
  electron-builder for both targets, into `packages/desktop/release/`). Both installers are
  unsigned, about 340 MB each. The script stamps each build: the bundle version (CFBundleVersion,
  `yyyymmdd.HHMM`) and the dmg's volume name (`Skymap 06Nov-1954`), so macOS never mistakes one 0.5.0
  build or mounted volume for another; main carries `DESKTOP_BUILT_AT`, which About shows. The Windows one is cross-built on macOS and has not yet run on a
  Windows computer (owner ruling 2026-11-06: ship it marked untried); the checks it still needs are
  in the backlog item "Windows hardware smoke".

## Dev runs

- `npm run desktop` builds the main process and control page, then runs `scripts/runDev.ts`, which opens
  the app `--windowed`. On macOS it runs a copy of Electron.app renamed Skymap (cached in
  `node_modules/.cache/skymap-desktop-dev/`), because the menu bar, Dock and firewall prompt take the bundle's name.
  It reads `public/data` (or `SKYMAP_DATA_DIR`) and serves the repo's root `dist/`, so run
  `vite build --mode desktop` at the root first.
- `--windowed` gives the sky a normal 1280 x 720 window with DevTools and the full menu.
- In a worktree without `public/data`, point `SKYMAP_DATA_DIR` at a checkout that has it.
- A dev run uses the installed app's `userData` (`Skymap`): on a machine with both, they share
  the settings, the CA and the room code, though a dev run never touches the mirror. For a clean
  slate, pass `--user-data-dir=<scratch dir>` after `electron .`.
- Manual checks that no test covers: install on Windows (firewall rule, uninstaller box, "Launch
  Skymap"), boot with networking off, WebGPU on D3D12, a tablet pairing after trusting `/ca.crt`,
  a projector switched on after boot, the dome grid landing front-down, the dmg's Finder labels in
  light and dark mode, and the black wait at show start (up to 10 s while tiles load).

## Tests

- `npm test -w packages/desktop` and `npm run typecheck -w packages/desktop` are a CI step
  (`.github/workflows/ci.yml`). The desktop package has its own `vitest.config.ts` (node
  environment, `tests/**/*.test.{ts,tsx}`) and `tsconfig.json`; `tests/` mirrors `src/`.
- The control page is tested in jsdom: a file opts in with `// @vitest-environment jsdom` (see
  `tests/control/setup/components/SetupFlow/SetupFlow.test.tsx`). The bridge is passed as a prop, so a
  test drives the page with a fake one.
- Server, sync (against a local HTTP fixture), placement, menu template, relay and rotation
  logic have tests under `tests/main/<module>/`, beside the module they test.
- The desktop package is not in the root `vitest` run (`tests/**` at the repo root only); its tests run
  with its own config. The inventory builder's test is `tests/tools/deploy/r2/buildOfflineInventory.test.ts`.
- The convention ratchets that hold the desktop to the layout above live in the root
  `tests/conventions/` and read its files from disk, so they run in the root `npm test`: folder
  shape, the process import boundary, file purity, `@types` and `utils` shape, no `.js` specifiers.

## Landmines

- **First run ends at the first launch.** The setup is written (through the setup store) as
  soon as the app starts, so quitting mid-setup skips the steps next time; "Run setup again" brings
  them back. That is the spec's rule (§10).

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
- **Architecture.** The mac build is arm64 only. An Intel Mac gets no installer until someone
  builds `x64` or a universal one (backlog).
- **Firewall prompt on macOS.** The unsigned app cannot be given a preinstalled rule, so macOS asks
  to accept incoming connections on first launch. Deny leaves the sky working and no remote.
- **Uninstaller user.** The nsis uninstaller reads the current user's `%APPDATA%`; if another
  admin elevates it, it looks in that admin's profile.
- **Unsigned.** Gatekeeper and SmartScreen both warn; the README tells the venue how to proceed.
  Signing and notarization are out of scope (spec) and in the backlog.
