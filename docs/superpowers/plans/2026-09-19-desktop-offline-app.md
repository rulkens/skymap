# Desktop offline app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Electron kiosk app in `packages/desktop/` that mirrors every runtime R2 asset to local disk once, then runs skymap fully offline.

**Architecture:** `sync-r2` publishes `data/offline-inventory.json` (ordered groups, raw-byte sha256 + size) as its last upload. The Electron main process plans + runs an ordered, resumable sync into `<userData>/data/`, then serves the root app's `vite build --mode desktop` output and that data over a privileged `app://` protocol in a supervised kiosk window.

**Tech Stack:** Electron (exact-pinned), electron-builder, npm workspaces, Node `crypto`/`fs`, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-19-desktop-offline-app-design.md`](../specs/2026-09-19-desktop-offline-app-design.md)

**Prerequisite (separate PR, not in this plan):** self-hosted Cormorant Garamond replacing the Google Fonts link at `index.html:33-37`.

## Global Constraints

- Workspace: root `package.json` gets `"workspaces": ["packages/*"]`; the web app stays the root package. Nothing under `src/` changes.
- Electron and electron-builder are exact-pinned devDependencies of `packages/desktop` only.
- Targets: mac `dmg` + win `nsis`, unsigned. No Linux, no signing, no auto-update, no CI release job.
- Data root: `<userData>/data/`, mirroring the bucket's `data/` tree key for key, plus `synced.json`.
- Inventory key: `data/offline-inventory.json`, `NO_CACHE`, purged, uploaded after `manifest.json`.
- `sha256` and `size` are of the local **raw** bytes, never the gzipped wire bytes.
- `type` aliases only; one symbol per file in `utils/` and type files; comments per `docs/superpowers/conventions/comments.md`.
- Desktop tests live in `packages/desktop/tests/` mirroring `packages/desktop/src/`, run by the package's own vitest config; the root suite (`tests/**`) is unaffected.

---

### Task 1: Workspace scaffold + two verifications

**Files:**

- Modify: `package.json` (workspaces, `desktop` script), `eslint.config.js` (a `packages/desktop/**` block, Node globals, its own tsconfig), `.gitignore` (`packages/desktop/build/`, `packages/desktop/release/`)
- Create: `packages/desktop/package.json`, `packages/desktop/tsconfig.json`, `packages/desktop/vitest.config.ts`, `packages/desktop/electron-builder.yml`, `packages/desktop/src/main/main.ts` (placeholder window)

**Package scripts (contract):** `dev` (tsc → `build/`, then `electron build/main/main.js --windowed`), `test` (vitest run), `typecheck`, `dist` (root `vite build --mode desktop`, tsc, `electron-builder --mac --win`).

- [ ] Scaffold; `npm run desktop` opens an empty window.
- [ ] **Verification A (install footprint):** measure root `npm ci` time and `node_modules` size with vs without the workspace. The Cloudflare shell build runs root `npm ci` and cannot take env vars (docs/DEPLOY.md), so if Electron's binary download lands there, find a mitigation that works without env (e.g. an Electron version whose binary downloads lazily, or an `.npmrc` setting) and record it. **Stop and report to the controller** before Task 2 if none works; the workspace decision may need revisiting.
- [ ] **Verification B (Windows cross-build):** `electron-builder --win nsis` on macOS with the placeholder app. Record works / needs Wine / fails in the package README.
- [ ] `npm run lint` and `npm run typecheck` still pass at the root.
- [ ] Commit.

No test: scaffolding.

### Task 2: Desktop build mode

**Files:**

- Create: `.env.desktop` (`VITE_DATA_BASE_URL=` empty; no `VITE_COUNTERSCALE_URL`), header comment in the style of `.env.production`
- Modify: `.gitignore:42-56` (carve-out for `.env.desktop` beside `.env.production`)

- [ ] `vite build --mode desktop` → `dist/`; grep the bundle: no `skymap-data.rulkens.com`, no `counterscale`.
- [ ] Commit.

No test: config, verified by the grep.

### Task 3: `app://` protocol

**Files:**

- Create: `packages/desktop/src/main/resolveAppPath.ts`, `packages/desktop/src/main/registerAppProtocol.ts`
- Test: `packages/desktop/tests/main/resolveAppPath.test.ts`
- Modify: `packages/desktop/src/main/main.ts`

**Contract:**

```ts
export type AppRoots = { dist: string; data: string };
/** URL path of an app:// request → absolute file path, or null (→ 404). */
export function resolveAppPath(urlPath: string, roots: AppRoots): string | null;
```

`/data/<rest>` → `roots.data/<rest>`; anything else → `roots.dist/<path>`, `/` → `index.html`. `null` when the resolved path escapes its root (decoded `..`, `%2e%2e`, absolute segments).

Landmines: `protocol.registerSchemesAsPrivileged` must run **before** `app.whenReady()`, with `standard`, `secure`, `supportFetchAPI`, `stream`; `protocol.handle` after ready. Serve with `net.fetch(pathToFileURL(path))`.

- [ ] Tests: `routes /data/ to the data root`, `routes other paths to dist and / to index.html`, `refuses ../ traversal`, `refuses percent-encoded traversal`, `refuses traversal from /data/ into dist`.
- [ ] Implement; `main.ts` loads `app://skymap/` with `data = process.env.SKYMAP_DATA_DIR`.
- [ ] Smoke: `SKYMAP_DATA_DIR=<main checkout>/public/data npm run desktop` renders the sky with galaxies, and the Earth surface tiles load on approach.
- [ ] Commit.

### Task 4: Kiosk window + supervision

**Files:**

- Create: `packages/desktop/src/main/superviseWindow.ts`, `packages/desktop/src/main/isAppUrl.ts`
- Test: `packages/desktop/tests/main/isAppUrl.test.ts`
- Modify: `packages/desktop/src/main/main.ts`

**Contract:** `superviseWindow(win: BrowserWindow): void`; `isAppUrl(url: string): boolean` (true only for scheme `app:` and host `skymap`).

**Behaviour:** window `kiosk: true`, black background, unless `--windowed` (normal window, DevTools allowed). `render-process-gone` with `reason !== 'clean-exit'` → reload after 2 s. `app` `child-process-gone` with `type === 'GPU'` → reload after 2 s. `unresponsive` held 30 s (cleared by `responsive`) → reload. `will-navigate` to a non-app URL → `preventDefault`. `setWindowOpenHandler` → `{ action: 'deny' }`.

- [ ] Tests: `accepts app://skymap/ paths`, `rejects https, file and app:// with another host`.
- [ ] Implement.
- [ ] Smoke (`--windowed`): `process.crash()` from DevTools → the window reloads and the sky comes back; clicking a NED link in an InfoCard does nothing.
- [ ] Commit.

### Task 5: Offline inventory in `sync-r2`

**Files:**

- Create: `tools/deploy/r2/OfflineInventory.ts`, `tools/deploy/r2/buildOfflineInventory.ts`
- Modify: `tools/deploy/r2/R2SyncGroup.ts:15-21` (`readonly offline: boolean`), `tools/deploy/syncR2.ts:47-127` (set `offline` on every row; build + upload the inventory after the loop), `docs/DEPLOY.md` (one paragraph under "R2 sync architecture")
- Test: `tests/tools/deploy/r2/buildOfflineInventory.test.ts`

**Contract:**

```ts
export type OfflineInventoryFile = { key: string; size: number; sha256: string };
export type OfflineInventory = { groups: { label: string; files: OfflineInventoryFile[] }[] };
// (OfflineInventoryFile in its own file — one type per file)
export function buildOfflineInventory(groups: readonly R2SyncGroup[]): OfflineInventory;
```

`offline: true`: `public/data`, hi-res famous images, planet textures, every surface-tiles group, every surface-tile-manifest group, data manifest. `false`: `Extra files`, `Mesh sources`. Groups kept in table order; empty groups dropped. `key` = `r2Key`. After the upload loop, `syncR2.ts` writes the JSON to an OS temp path (never under `public/data/`) and uploads it through the existing wrangler transport as `data/offline-inventory.json` with `NO_CACHE`, adding its key to the purge list.

- [ ] Tests: `keeps only offline groups, in table order`, `hashes raw bytes even for gzip-on-wire files` (fixture a `.bin`, which `shouldGzipOnWire` accepts; assert sha256 of the file as on disk), `size is the on-disk byte length`, `drops empty groups`.
- [ ] Implement; `npm run typecheck` passes (every `buildGroups()` row now needs `offline`).
- [ ] Commit.

The desktop package type-imports `OfflineInventory` from `tools/deploy/r2/` (type-only, erased at build); add `../../tools/deploy/r2/OfflineInventory*.ts` to `packages/desktop/tsconfig.json` `include`.

### Task 6: `planSync`

**Files:**

- Create: `packages/desktop/src/sync/planSync.ts`, `packages/desktop/src/sync/SyncPlan.ts`, `packages/desktop/src/sync/SyncedRecord.ts`
- Test: `packages/desktop/tests/sync/planSync.test.ts`

**Contract:**

```ts
export type SyncedRecord = Record<string, string>; // key → sha256 of a verified file
export type SyncPlan = {
  groups: { label: string; download: OfflineInventoryFile[] }[]; // inventory order
  prune: string[]; // keys on disk absent from the inventory
  downloadBytes: number;
};
export function planSync(
  inventory: OfflineInventory,
  synced: SyncedRecord,
  onDisk: ReadonlySet<string>,
): SyncPlan;
```

Keys are bucket keys (`data/...`); the executor maps them under the data root by stripping `data/`. A file downloads when its key is absent from `synced`, its sha differs, or it is missing from `onDisk`. `synced.json` and `*.part` files never appear in `prune`.

- [ ] Tests: `downloads nothing when every file is synced and present`, `downloads a file whose sha changed`, `downloads a synced file missing on disk`, `keeps inventory group order`, `prunes keys absent from the inventory`, `never prunes synced.json or .part files`, `sums downloadBytes over downloads only`.
- [ ] Implement.
- [ ] Commit.

### Task 7: `runSync`

**Files:**

- Create: `packages/desktop/src/sync/runSync.ts`, `packages/desktop/src/sync/SyncProgress.ts`
- Test: `packages/desktop/tests/sync/runSync.test.ts`

**Contract:**

```ts
export type SyncProgress = { doneBytes: number; totalBytes: number; group: string };
export type SyncOutcome = 'synced' | 'offline' | 'failed';
export function runSync(opts: {
  baseUrl: string; // R2 public URL (the value of .env.production VITE_DATA_BASE_URL)
  dataRoot: string;
  onProgress: (p: SyncProgress) => void;
  inventoryTimeoutMs?: number; // default 5000
}): Promise<SyncOutcome>;
```

**Behaviour:** fetch `${baseUrl}/data/offline-inventory.json` (timeout → `'offline'`). Read `synced.json` (absent → `{}`) and walk `dataRoot` for `onDisk`. Free-space check: `downloadBytes` > free → throw `InsufficientDiskError` (own file, carries needed + free). Groups in order, ≤ 8 concurrent downloads per group, each streamed to `<file>.part`, sha256 verified, renamed into place; rewrite `synced.json` after each group. Any failure or sha mismatch → stop and return `'failed'` with no prune. Prune only after every group succeeded → `'synced'`.

- [ ] Tests (local `http.createServer` fixture serving an inventory of two groups): `first run downloads every file and writes synced.json`, `second run downloads nothing`, `a mid-group 500 leaves earlier groups and the previous files intact and returns failed`, `the next run resumes and completes`, `a sha mismatch returns failed and leaves no renamed file`, `prune runs only after full success`, `unreachable inventory returns offline`.
- [ ] Implement.
- [ ] Commit.

### Task 8: Lifecycle + sync page

**Files:**

- Create: `packages/desktop/src/sync-page/index.html`, `packages/desktop/src/sync-page/preload.cts`, `packages/desktop/src/main/hasLocalSet.ts`
- Modify: `packages/desktop/src/main/main.ts`

**Behaviour:** without `SKYMAP_DATA_DIR`: open the kiosk window on the sync page, run `runSync` into `<userData>/data/`, forward progress over IPC. Then:

| Outcome                            | Next                                       |
| ---------------------------------- | ------------------------------------------ |
| `synced`                           | load `app://skymap/`                       |
| `offline` / `failed`, local set    | load `app://skymap/`                       |
| `offline` / `failed`, no local set | error: "needs internet once", Retry button |
| `InsufficientDiskError`            | error: needed vs free, Retry button        |

`hasLocalSet(dataRoot)` = `manifest.json` exists and every key in `synced.json` is on disk. The preload must be CommonJS (`.cts` → `.cjs`) because it runs sandboxed; expose `onProgress`, `onError`, `retry` via `contextBridge` only.

- [ ] Smoke on macOS with a fresh `userData`: progress screen → sky; relaunch with networking off → sky; delete the data folder and relaunch offline → error screen; Retry after reconnecting → sync.
- [ ] Commit.

No new test: the branches are wiring over `runSync` outcomes already under test.

### Task 9: CI, docs, package

**Files:**

- Modify: `.github/workflows/ci.yml` (step: `npm run typecheck --workspace packages/desktop && npm test --workspace packages/desktop`), `CLAUDE.md` (one line under Commands: `npm run desktop`)
- Create: `packages/desktop/README.md` (dev, `dist`, data root location, the pointer-last invariant from spec §4, Verification B result)

- [ ] `npm run dist --workspace packages/desktop` produces a dmg (and a win installer per Verification B).
- [ ] Manual on Windows: install, first sync, boot offline, WebGPU renders (D3D12).
- [ ] Commit.

## Definition of Done

**Deliverables:** `packages/desktop/` with `resolveAppPath`, `registerAppProtocol`, `superviseWindow`, `isAppUrl`, `planSync`, `runSync`, `hasLocalSet`, sync page; `.env.desktop`; `R2SyncGroup.offline`; `buildOfflineInventory` + `OfflineInventory`; `data/offline-inventory.json` published by `sync-r2`; README + DEPLOY.md paragraph; CI step.

**Observable behaviours (manual smoke, mac + Windows):**

- [ ] First launch: progress screen, then the sky.
- [ ] Relaunch with networking off: boots straight into the sky; galaxies, stars, meshes, Earth + Mars surface tiles all render.
- [ ] Kiosk: fullscreen, no chrome; InfoCard outbound links inert.
- [ ] `process.crash()` in `--windowed`: window reloads.
- [ ] Offline first launch with no data: "needs internet once" screen with Retry.
- [ ] After a new `sync-r2`, an online launch downloads only the changed files and prunes the superseded ones.

**Deferred (don't chase):** attract loop / `?kiosk`, idle reset, thumbnail pack, `device.lost` recovery, signing/notarization, app auto-update, Linux, CI release job.

**Post-merge action:** run `npm run sync-r2-secure` once so the inventory exists on R2; until then the app can only run in dev mode.
