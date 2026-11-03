# Desktop kiosk + dome app — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean
> protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax.

> **Runs on a new branch stacked after the prep PR.** The prep PR is
> [`2026-11-03-relay-issues-room-codes.md`](2026-11-03-relay-issues-room-codes.md), on
> `worktree-electron-kiosk-dome-app`. This plan consumes the prep PR's interfaces as existing:
> `attachRemoteRelay(server, RelayOptions): RelayHandle`, `RelayRoom`, `RelayFrame`,
> `ROOM_ROTATED_CLOSE_CODE`, `HOST_REPLACED_CLOSE_CODE`, `RemoteTransport.host()`, and
> `pairingUrl(origin, code)`. It never redefines them.

**Goal:** an Electron app in `packages/desktop/` for kiosks and planetarium domes.

- It mirrors every runtime R2 asset to local disk and then runs offline.
- It serves itself over a local HTTPS server that a phone remote can pair with over the LAN.
- A control window on the booth monitor holds setup, sync and pairing.

**Architecture:**

- **Deploy side:** `sync-r2` publishes `data/offline-inventory.json` last.
- **Sync:** the main process syncs into `<userData>/data/` without ever deleting. It writes a local
  `inventory.json` last, as the completeness marker, and prunes orphans only at a sky load.
- **Server:** one HTTPS server, signed by a CA generated per install, serves `dist/`, the data and
  `/ca.crt`, and hosts the relay with the install's stored code.
- **Windows:** a pure `placeWindows` puts the sky window (`/?dome&remote` or `/?remote`) and the
  control window on displays.

**Tech Stack:** Electron and electron-builder (exact-pinned), Node `https`/`crypto`/`fs`/`os`, `ws`
(via the relay), `selfsigned` (X.509 generation), `qrcode-generator` (already a root dependency),
Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-19-desktop-offline-app-design.md`](../specs/2026-09-19-desktop-offline-app-design.md),
with rulings Q0–Q13 in [`docs/grill-sessions/desktop-dome-remote-2026-11-03.md`](../../grill-sessions/desktop-dome-remote-2026-11-03.md).

## Global Constraints

- Root `package.json` already has `"workspaces": ["packages/*"]` (the website uses it). This plan
  only adds the `desktop` script. Nothing under `src/` changes; the prep PR did the web-app side.
- Electron, electron-builder and `selfsigned` are exact-pinned in `packages/desktop` only.
- Targets: mac `dmg` and win `nsis`, unsigned. No Linux, signing, binary auto-update or CI release
  job.
- Data root: `<userData>/data/`, mirroring the bucket's `data/` tree key for key, plus `synced.json`
  and `inventory.json`.
- The inventory is published at `data/offline-inventory.json`, `NO_CACHE`, purged, after
  `manifest.json`. `sha256` and `size` are taken from the local **raw** bytes.
- **Server:** HTTPS on `0.0.0.0:APP_SERVER_PORT` (47823), in both modes. The app's windows load
  `https://localhost:47823/`. *(Ruling: the spec says "a fixed port" without a value. 47823 is
  unassigned, and the value is a named constant.)*
- Close codes come from the prep PR: `4001` rotated, `4002` host replaced, `1008` refused.
- Setup lives in `<userData>/setup.json`, the room code in `<userData>/remote-room.json`, and the
  certificates in `<userData>/certs/`.
- Code conventions:
  - `type` aliases only.
  - One symbol per file in `utils/`, `@types/` and `data/`. Desktop types live in
    `packages/desktop/src/@types/`.
  - Comments follow `docs/superpowers/conventions/comments.md`.
- Desktop tests live in `packages/desktop/tests/`, mirroring `src/`, and run under the package's own
  vitest config.

## Review Focus

1. **A request escapes its root.** `/data/../index.html`, `%2e%2e`, a backslash, or an absolute
   segment must get a 404, never a file from another root. Pinned in Task 6.
2. **A LAN client tries to host.** A host upgrade from the machine's own LAN IP or another device is
   refused. `127.0.0.1`, `::1` and `::ffff:127.0.0.1` are allowed. Pinned in Task 8 (`isLoopbackRequest`).
3. **A sync while the sky is up, then "Restart sky".** Nothing is deleted during the sync. Orphans go
   only at the sky load, and only after a complete sync, because a partial sync leaves the old
   `inventory.json`. Pinned in Tasks 4 and 5.
4. **Displays change under the app.** The stored display is unplugged, two displays share the stored
   size, or there is a single screen. The sky lands on the primary, and the control window gets
   `null`. Pinned in Task 7.
5. **The stored network or update time no longer fits.** The picked interface is gone, so the pairing
   address falls back to the first LAN IPv4. The `daily` time has already passed today, so the next
   run is tomorrow at that time. Pinned in Tasks 8 and 9.

---

### Task 1: Workspace scaffold + two verifications

**Files:**

- Modify: `package.json` (the `desktop` script), `eslint.config.js` (a `packages/desktop/**` block
  with Node globals and its own tsconfig), `.gitignore` (`packages/desktop/build/`,
  `packages/desktop/release/`)
- Create: `packages/desktop/package.json`, `packages/desktop/tsconfig.json`,
  `packages/desktop/vitest.config.ts`, `packages/desktop/electron-builder.yml`,
  `packages/desktop/src/main/main.ts` (a placeholder window)

**Package scripts (contract):**

- `dev`: tsc → `build/`, then `electron build/main/main.js --windowed`;
- `test`: vitest run;
- `typecheck`;
- `dist`: root `vite build --mode desktop`, then tsc, then `electron-builder --mac --win`.

- [ ] Scaffold, then check that `npm run desktop` opens an empty window.
- [ ] **Verification A (install footprint):**
  - Measure root `npm ci` time and `node_modules` size with and without `packages/desktop`.
  - The Cloudflare shell build runs root `npm ci` and cannot take env vars (docs/DEPLOY.md). If
    Electron's binary download lands there, find a mitigation that needs no env, such as a lazily
    downloading Electron version or an `.npmrc` setting, and record it.
  - **Stop and report to the controller** before Task 2 if none works.
- [ ] **Verification B (Windows cross-build):** run `electron-builder --win nsis` on macOS with the
  placeholder. Record works, needs Wine, or fails.
- [ ] Check that `npm run lint` and `npm run typecheck` still pass at the root.
- [ ] Commit `Desktop workspace scaffold`.

### Task 2: Desktop build mode

**Files:**

- Create: `.env.desktop` (`VITE_DATA_BASE_URL=` empty, no `VITE_COUNTERSCALE_URL`), with a header in
  the style of `.env.production`
- Modify: `.gitignore` (a carve-out for `.env.desktop` beside `.env.production`)

- [ ] `vite build --mode desktop` → `dist/`. Grep the bundle: no `skymap-data.rulkens.com` and no
  `counterscale`.
- [ ] Commit `Desktop build mode`.

### Task 3: Offline inventory in `sync-r2`

**Files:**

- Create: `tools/deploy/@types/OfflineInventory.d.ts`, `tools/deploy/@types/OfflineInventoryFile.d.ts`,
  `tools/deploy/r2/buildOfflineInventory.ts`
- Modify:
  - `tools/deploy/@types/R2SyncGroup.d.ts` (adds `readonly offline: boolean`);
  - `tools/deploy/syncR2.ts` (sets `offline` on every `buildGroups()` row, then builds and uploads
    the inventory after the upload loop);
  - `docs/DEPLOY.md` (one paragraph under "R2 sync architecture", including the pointer-last
    invariant in spec §4).
- Test: `tests/tools/deploy/r2/buildOfflineInventory.test.ts`

**Contract:**

```ts
export type OfflineInventoryFile = { key: string; size: number; sha256: string };
export type OfflineInventory = { groups: { label: string; files: OfflineInventoryFile[] }[] };
/** Throws, naming the label, when an offline group has no files: publishing would prune them everywhere. */
export function buildOfflineInventory(groups: readonly R2SyncGroup[]): OfflineInventory;
```

**Group membership:**

- **`offline: true`:** every `public/data: …` row, `Hi-res famous-galaxy images`,
  `Planet-surface textures`, every `Surface tiles (…)`, every `Octree chunks (…)`, every
  `Surface tile manifest (…)`, and `Data manifest`.
- **`offline: false`:** `Extra files` and `Mesh sources`.

**Behaviour:**

- `key` is `r2Key`. Groups keep table order.
- `syncR2.ts` writes the JSON to an OS temp path, never under `public/data/`, and uploads it through
  the wrangler transport as `data/offline-inventory.json` with `NO_CACHE`.
- It adds the key to the purge list and uploads it after the data manifest.
- When `buildOfflineInventory` throws, every other upload still lands, the inventory is skipped,
  and the script exits non-zero with the label.

- [ ] Tests:
  - `keeps only offline groups, in table order`;
  - `hashes raw bytes even for gzip-on-wire files` (a `.bin` fixture; assert the on-disk sha256);
  - `size is the on-disk byte length`;
  - `refuses an offline group with no files, naming its label`;
  - `ignores an empty group that is not offline`.
- [ ] Implement. `npm run typecheck` passes, because every row now sets `offline`.
- [ ] Commit `sync-r2 publishes the offline inventory`.

### Task 4: The local mirror — plan, completeness, prune

**Files:**

- Create: `packages/desktop/src/sync/planSync.ts`, `packages/desktop/src/sync/hasCompleteLocalSet.ts`,
  `packages/desktop/src/sync/pruneOrphans.ts`, `packages/desktop/src/@types/SyncPlan.ts`,
  `packages/desktop/src/@types/SyncedRecord.ts`, `packages/desktop/src/data/mirrorBookkeepingFiles.ts`
- Modify: `packages/desktop/tsconfig.json` (adds `include` entries for
  `../../tools/deploy/@types/OfflineInventory*.d.ts`, imported type-only)
- Test: `packages/desktop/tests/sync/planSync.test.ts`, `hasCompleteLocalSet.test.ts`,
  `pruneOrphans.test.ts`

**Contract:**

```ts
export type SyncedRecord = Record<string, string>; // key → sha256 of a verified file
export type SyncPlan = { groups: { label: string; download: OfflineInventoryFile[] }[]; downloadBytes: number };
export function planSync(inventory: OfflineInventory, synced: SyncedRecord, onDisk: ReadonlySet<string>): SyncPlan;
/** inventory.json present, and every key in it verified in synced.json and on disk. */
export function hasCompleteLocalSet(dataRoot: string): Promise<boolean>;
/** Deletes every key on disk outside the local inventory.json. Idempotent; a no-op without one. */
export function pruneOrphans(dataRoot: string): Promise<{ deleted: number }>;
export const MIRROR_BOOKKEEPING_FILES = ['synced.json', 'inventory.json'] as const;
```

Keys are bucket keys (`data/…`). They map under the data root with `data/` stripped. The bookkeeping
files and `*.part` files are never pruned, and never count as orphans.

- [ ] Tests:
  - `planSync`:
    - `downloads nothing when every file is synced and present`;
    - `downloads a file whose sha changed`;
    - `downloads a synced file missing on disk`;
    - `keeps inventory group order`;
    - `sums downloadBytes over downloads only`.
  - `hasCompleteLocalSet` (tmp dir):
    - `false without inventory.json`;
    - `false when a listed key is missing on disk`;
    - `true when every listed key is synced and present`.
  - `pruneOrphans` (tmp dir):
    - `deletes keys outside the local inventory`;
    - `keeps synced.json, inventory.json and .part files`;
    - `a second run deletes nothing`;
    - `does nothing without inventory.json`.
- [ ] Implement.
- [ ] Commit `Desktop mirror: plan, completeness and prune`.

### Task 5: `runSync` — downloads, never deletes

**Files:**

- Create: `packages/desktop/src/sync/runSync.ts`, `packages/desktop/src/@types/SyncProgress.ts`,
  `packages/desktop/src/@types/SyncOutcome.ts`, `packages/desktop/src/sync/InsufficientDiskError.ts`
- Test: `packages/desktop/tests/sync/runSync.test.ts`

**Contract:**

```ts
export type SyncProgress = { doneBytes: number; totalBytes: number; group: string };
export type SyncOutcome = 'synced' | 'offline' | 'failed';
export function runSync(opts: {
  baseUrl: string; // the value of .env.production VITE_DATA_BASE_URL
  dataRoot: string;
  onProgress: (progress: SyncProgress) => void;
  inventoryTimeoutMs?: number; // default 5000
}): Promise<SyncOutcome>;
```

**Behaviour:**

- Fetch `${baseUrl}/data/offline-inventory.json`. A timeout or network error returns `'offline'`.
- Free-space check: when `downloadBytes` exceeds free space, throw `InsufficientDiskError` (it
  carries the needed and the free byte counts).
- Run the groups in order, with at most 8 concurrent downloads per group. Each one streams to
  `<file>.part`, is checked against its sha256, then renamed into place.
- Rewrite `synced.json` after each group.
- Any failure or sha mismatch returns `'failed'`.
- Only after every group succeeds, write the fetched inventory to `inventory.json` (via temp file and
  rename) and return `'synced'`.
- **Never deletes.**

- [ ] Tests (a local `http.createServer` fixture serving a two-group inventory):
  - `first run downloads every file, writes synced.json, then inventory.json`;
  - `second run downloads nothing`;
  - `a mid-group 500 returns failed and leaves the previous inventory.json`;
  - `the next run resumes and completes`;
  - `a sha mismatch returns failed and leaves no renamed file`;
  - `never deletes a file the new inventory drops`;
  - `unreachable inventory returns offline`.
- [ ] Implement.
- [ ] Commit `Desktop sync: ordered, resumable, never deletes`.

### Task 6: Local HTTPS server and the install's CA

review: yes (certificate trust and path containment: CI can't see either going wrong on a real LAN)

**Files:**

- Create:
  - `packages/desktop/src/main/resolveAppPath.ts`, `packages/desktop/src/main/startAppServer.ts`;
  - `packages/desktop/src/main/ensureLanCertificate.ts`, `packages/desktop/src/utils/isSignedByCa.ts`;
  - `packages/desktop/src/@types/AppRoots.ts`, `packages/desktop/src/@types/LanNames.ts`,
    `packages/desktop/src/@types/LanCertificate.ts`;
  - `packages/desktop/src/data/appServerPort.ts`.
- Modify: `packages/desktop/src/main/main.ts`
- Test: `packages/desktop/tests/main/resolveAppPath.test.ts`, `ensureLanCertificate.test.ts`,
  `packages/desktop/tests/utils/isSignedByCa.test.ts`

**Contract:**

```ts
export type AppRoots = { dist: string; data: string; caPem: string };
/** URL path → file path, or 'ca' for /ca.crt, or null (→ 404). */
export function resolveAppPath(urlPath: string, roots: AppRoots): string | 'ca' | null;
export type LanNames = { hostnames: string[]; ips: string[] }; // localhost + <host>.local; non-internal IPv4s
export type LanCertificate = { key: string; cert: string; ca: string }; // PEM
/** CA made once per install; leaf reissued only when the names differ from the stored leaf's. */
export function ensureLanCertificate(certDir: string, names: LanNames): Promise<LanCertificate>;
export function isSignedByCa(certPem: string, caPem: string): boolean;
export function startAppServer(roots: AppRoots, tls: LanCertificate): Promise<{ server: https.Server; close: () => Promise<void> }>;
export const APP_SERVER_PORT = 47823;
```

**Routing and trust:**

- `/data/<rest>` goes to `roots.data`, and anything else to `roots.dist` (`/` is `index.html`).
- `/ca.crt` is served as `application/x-x509-ca-cert`.
- Anything that resolves outside its root is `null`.
- `main.ts` installs `session.defaultSession.setCertificateVerifyProc`. It accepts a request when
  `isSignedByCa(request.certificate.data, ca)`, and otherwise falls back to Chromium's verdict (`-3`).
- `startAppServer` listens on `0.0.0.0:APP_SERVER_PORT`. Task 8 attaches the relay to the returned
  server.

- [ ] Tests:
  - `resolveAppPath`:
    - `routes /data/ to the data root`;
    - `routes other paths to dist and / to index.html`;
    - `serves /ca.crt`;
    - `refuses ../ traversal`;
    - `refuses percent-encoded traversal`;
    - `refuses backslash traversal`;
    - `refuses traversal from /data/ into dist`.
  - `ensureLanCertificate` (tmp dir):
    - `creates a CA once and reuses it`;
    - `the leaf names localhost, the .local name and every ip`;
    - `reissues the leaf, not the CA, when the ips change`.
  - `isSignedByCa`:
    - `true for a leaf the install's CA issued`;
    - `false for a leaf another CA issued`.
- [ ] Implement, then smoke: `SKYMAP_DATA_DIR=<main checkout>/public/data npm run desktop` renders
  the sky from `https://localhost:47823/` with no certificate warning. A phone on the same Wi-Fi
  opens `/ca.crt`.
- [ ] Commit `Desktop app serves itself over HTTPS with a per-install CA`.

### Task 7: Windows — placement, supervision, test grid

**Files:**

- Create:
  - `packages/desktop/src/main/placeWindows.ts`, `packages/desktop/src/main/openSkyWindow.ts`;
  - `packages/desktop/src/main/superviseWindow.ts`, `packages/desktop/src/utils/isAppUrl.ts`;
  - `packages/desktop/src/main/showTestGrid.ts`;
  - `packages/desktop/src/@types/DisplayInfo.ts`, `packages/desktop/src/@types/WindowPlacement.ts`;
  - `packages/desktop/src/@types/InstallSetup.ts`, `packages/desktop/src/@types/DataUpdates.ts`
    (spec §8 shapes, created here because placement reads them; Task 9 consumes them);
  - `packages/desktop/assets/dome-grid.png`, `packages/desktop/assets/test-grid.html`.
- Modify: `packages/desktop/src/main/main.ts`
- Test: `packages/desktop/tests/main/placeWindows.test.ts`, `packages/desktop/tests/utils/isAppUrl.test.ts`

**Contract:**

```ts
export type DisplayInfo = { id: number; width: number; height: number; primary: boolean };
export type WindowPlacement = { sky: DisplayInfo; control: DisplayInfo | null };
export function placeWindows(stored: InstallSetup['display'], displays: readonly DisplayInfo[]): WindowPlacement;
export function isAppUrl(url: string): boolean; // https://localhost:APP_SERVER_PORT only
export function superviseWindow(win: BrowserWindow): void;
export function showTestGrid(sky: BrowserWindow, mode: InstallSetup['mode'], on: boolean): void;
```

**Behaviour:**

- **Sky display:** the stored id, else the unique display with the stored size, else the primary.
  Control gets a display the sky does not use, or `null`.
- **Re-placement:** `main.ts` re-runs `placeWindows` on `screen` `display-added` and
  `display-removed`.
- **Sky window:** frameless, black and full screen. It loads `/?dome&remote` in dome mode and
  `/?remote` in kiosk mode. `--windowed` gives a normal window with DevTools.
- **Single screen:** with `control === null`, the global shortcut `CommandOrControl+Alt+K` toggles
  the control window over the sky.
- **Supervision:**
  - `render-process-gone` with a reason other than `clean-exit`: reload after 2 s;
  - `child-process-gone` of type `GPU`: reload after 2 s;
  - `unresponsive` for 30 s (cleared by `responsive`): reload.
- **Navigation lock:** `will-navigate` to a URL that isn't an app URL is prevented, and
  `setWindowOpenHandler` denies everything.
- **Test grid:** `showTestGrid` adds a transparent `WebContentsView` sized to the sky window's
  content bounds. It loads `test-grid.html`, which shows `dome-grid.png` at `object-fit: contain` in
  dome mode and "Skymap · display \<n\>" in kiosk mode.
- **The grid image:** an equidistant 180° grid with a horizon ring, 30° and 60° rings and a zenith
  cross. FRONT is at the bottom of the disc, with LEFT, RIGHT and BACK at the other edges. It is
  generated once by a throwaway script; commit only the PNG.

- [ ] Tests:
  - `placeWindows`:
    - `sky takes the stored display by id`;
    - `sky takes the display of the stored size when the id changed`;
    - `two displays of the stored size fall back to the primary`;
    - `a missing stored display falls back to the primary`;
    - `control takes a display the sky does not use`;
    - `control is null on a single screen`.
  - `isAppUrl`:
    - `accepts https://localhost:47823 paths`;
    - `rejects other ports, http, file and remote hosts`.
- [ ] Implement, then smoke with `--windowed`:
  - `process.crash()` reloads the sky;
  - an InfoCard NED link does nothing;
  - the dome grid lands front-down on a second display.
- [ ] Commit `Desktop windows: placement, supervision and the test grid`.

### Task 8: Desktop relay — stored code, loopback host, network pick

review: yes (pairing security: who may host, which code is admitted)

**Files:**

- Create:
  - `packages/desktop/src/main/attachDesktopRelay.ts`, `packages/desktop/src/main/readRoomCode.ts`,
    `packages/desktop/src/main/rotateRoomCode.ts`;
  - `packages/desktop/src/utils/isLoopbackRequest.ts`, `packages/desktop/src/utils/lanOriginFor.ts`;
  - `packages/desktop/src/utils/listLanInterfaces.ts`, `packages/desktop/src/@types/LanInterface.ts`.
- Modify: `packages/desktop/src/main/main.ts`, `packages/desktop/tsconfig.json` (adds `include`
  entries for the relay under `../../tools/utils/remote/` and its types)
- Test: `packages/desktop/tests/utils/isLoopbackRequest.test.ts`, `lanOriginFor.test.ts`,
  `packages/desktop/tests/main/readRoomCode.test.ts`, `attachDesktopRelay.test.ts`

**Contract:**

```ts
export type LanInterface = { name: string; address: string }; // non-internal IPv4
export function listLanInterfaces(): LanInterface[];
/** https://<picked or first interface address>:port; https://localhost:port when there is none. */
export function lanOriginFor(network: string | null, interfaces: readonly LanInterface[], port: number): string;
export function isLoopbackRequest(request: IncomingMessage): boolean;
/** <userData>/remote-room.json; created with newLocalRoomCode() on first read. */
export function readRoomCode(userData: string): Promise<RoomCode>;
export function rotateRoomCode(userData: string, relay: RelayHandle): Promise<RoomCode>;
export function attachDesktopRelay(server: https.Server, opts: { code: RoomCode; network: () => string | null }): RelayHandle;
```

**Wiring:** `attachDesktopRelay` calls `attachRemoteRelay` with:

- `codeFor`: always the stored code (a module-level current value that `rotateRoomCode` updates);
- `mayHost`: `isLoopbackRequest`;
- `pairingOnSky`: `false`;
- `lanOrigin`: `lanOriginFor(network(), listLanInterfaces(), APP_SERVER_PORT)`.

`rotateRoomCode` writes a new code, then calls `relay.rotate(old, next)`.

- [ ] Tests:
  - `isLoopbackRequest`:
    - `accepts 127.0.0.1, ::1 and ::ffff:127.0.0.1`;
    - `rejects a LAN address, including this machine's own`.
  - `lanOriginFor`:
    - `uses the picked interface`;
    - `falls back to the first interface when the picked one is gone`;
    - `falls back to localhost with no interfaces`.
  - `readRoomCode`:
    - `creates and stores a code on first read`;
    - `returns the same code on the next read`.
  - `attachDesktopRelay` (a live server on port 0):
    - `a loopback host receives the stored code with onSky false`;
    - `a join to another code is refused with 1008`;
    - `rotateRoomCode kicks remotes with 4001 and the host hears the new code`.
- [ ] Implement, then smoke: open the sky with `npm run desktop`. A phone scans the control window's
  QR, trusts `/ca.crt` and drives the sky. Rotating the code kicks the phone.
- [ ] Commit `Desktop relay: stored code, loopback host, picked network`.

### Task 9: Control window, setup and lifecycle

**Files:**

- Create:
  - `packages/desktop/src/control/index.html`, `packages/desktop/src/control/control.ts`,
    `packages/desktop/src/control/preload.cts`;
  - `packages/desktop/src/main/readSetup.ts`, `packages/desktop/src/main/saveSetup.ts`,
    `packages/desktop/src/main/runLifecycle.ts`;
  - `packages/desktop/src/utils/parseInstallSetup.ts`, `packages/desktop/src/utils/nextDailyRun.ts`;
  - `packages/desktop/src/@types/ControlBridge.ts`;
  - `packages/desktop/src/data/defaultInstallSetup.ts`, `packages/desktop/src/data/controlShortcut.ts`.
- Modify: `packages/desktop/src/main/main.ts`
- Test: `packages/desktop/tests/utils/parseInstallSetup.test.ts`, `nextDailyRun.test.ts`

**Contract:** `ControlBridge` exactly as spec §8, over `InstallSetup` and `DataUpdates` from Task 7.
Plus:

```ts
/** Unknown or invalid fields fall back to DEFAULT_INSTALL_SETUP field by field; 'HH:MM' validated. */
export function parseInstallSetup(raw: unknown): InstallSetup;
export function nextDailyRun(at: string, now: Date): Date; // local time; today if still ahead, else tomorrow
export const DEFAULT_INSTALL_SETUP: InstallSetup; // kiosk, display null, network null, autostart false, atLaunch
export const CONTROL_SHORTCUT = 'CommandOrControl+Alt+K';
```

**Lifecycle (`runLifecycle`):**

- **Startup:** take `app.requestSingleInstanceLock()` and quit if another instance holds it.
  *(Ruling: autostart plus a manual launch would otherwise fight over the port.)* Then start the
  server and relay, and open the control window.
- **`atLaunch`:** run `runSync`, then load the sky.
- **Other policies:** load the sky straight away when `hasCompleteLocalSet`.
- **Every sky load:** run `pruneOrphans`, then `loadURL`.
- **`daily`:** a timer at `nextDailyRun` runs `runSync`. On `'synced'` it restarts the sky (prune,
  then reload) and re-arms.
- **Update now:** runs `runSync` and ends at "New data ready · Restart sky".
- **Dev:** with `SKYMAP_DATA_DIR`, sync and prune are skipped.
- **Outcome table** (spec §5):

  | Outcome                                       | Next                                               |
  | --------------------------------------------- | -------------------------------------------------- |
  | `synced`, or `offline`/`failed` with a set    | load the sky                                       |
  | `offline`/`failed`, no complete local set     | control window: "needs internet once", Retry       |
  | `InsufficientDiskError`                       | control window: needed vs free, Retry              |
  | stored display missing                        | sky on the primary; control window comes up        |

- **Setup changes:** `saveSetup` applies them live. It calls `app.setLoginItemSettings` for
  autostart, re-places windows for `display`, re-arms the timer for `dataUpdates`, reloads the sky
  URL for `mode`, and re-sends the room through `onRoom` for `network`.
- **Pairing feed:** `onPairing` is fed by `RelayHandle.onRoom`. The page draws the QR from
  `pairingUrl(origin, code)` with `qrModules` (`src/utils/remote/qrModules.ts`).
- **Pairing panel copy:** includes "Give this network a DHCP reservation so tablet bookmarks keep
  working".
- **Quit:** only from the control window.
- **Preload:** CommonJS (`.cts` → `.cjs`, because it runs sandboxed). It exposes `ControlBridge`
  through `contextBridge` only.

- [ ] Tests:
  - `parseInstallSetup`:
    - `returns defaults for garbage`;
    - `keeps valid fields and defaults the rest`;
    - `rejects a daily time that is not HH:MM`.
  - `nextDailyRun`:
    - `today when the time is still ahead`;
    - `tomorrow when it has passed`;
    - `tomorrow when it is exactly now`.
- [ ] Implement.
- [ ] Smoke on macOS with a fresh `userData`:
  - first launch: progress in the control window, then the sky;
  - relaunch offline: the sky;
  - delete the data and relaunch offline: "needs internet once";
  - Update now, then Restart sky: the orphans are gone;
  - a two-display setup: the control window lands on the free display; unplug and re-plug the sky
    display;
  - toggle autostart.
- [ ] Commit `Desktop control window, setup and lifecycle`.

### Task 10: CI, docs, package

**Files:**

- Modify: `.github/workflows/ci.yml` (a step after `npm test`:
  `npm run typecheck --workspace packages/desktop && npm test --workspace packages/desktop`),
  `CLAUDE.md` (one Commands line: `npm run desktop`)
- Create: `packages/desktop/README.md`. It covers: dev, `dist`, the data root, the pointer-last
  invariant (spec §4), the Verification B result, the port, the shortcut, the `/ca.crt` tablet trust
  steps for iOS and Android, and the DHCP-reservation advice.

- [ ] `npm run dist --workspace packages/desktop` produces a dmg, and a Windows installer per
  Verification B.
- [ ] Manual on Windows:
  - install, first sync, boot offline, WebGPU renders (D3D12);
  - a tablet pairs over HTTPS after trusting `/ca.crt`;
  - a projector switched on after boot takes the sky;
  - the dome grid lands front-down.
- [ ] Commit `Desktop app: CI step, README and packaging`.

## Definition of Done

**Deliverables:**

- the `packages/desktop/` modules above;
- `.env.desktop`;
- `R2SyncGroup.offline` and `buildOfflineInventory` with the empty-group refusal;
- `data/offline-inventory.json` published by `sync-r2`;
- the README, the DEPLOY.md paragraph and the CI step.

**Observable behaviours (manual smoke, mac and Windows):** every smoke step in Tasks 6–10, plus:

- [ ] After a new `sync-r2`, an online launch downloads only the changed files, and the next sky load
  prunes the superseded ones.
- [ ] The sky window never shows a pairing card in the desktop app. The QR shows only in the control
  window.

**Deferred (don't chase):**

- kiosk mode (attract loop, idle reset, thumbnail pack);
- the remote's UI (show deck);
- dome tilt and orientation;
- fixed render size and Spout/NDI;
- `device.lost` recovery;
- signing, notarization and binary auto-update;
- Linux and a CI release job;
- a certificate the venue supplies;
- a cloud relay.

**Post-merge action:** run `npm run sync-r2-secure` once so the inventory exists on R2. Until then
the app runs only in dev mode.
