# Desktop offline app — design

**Status:** agreed in brainstorming 2026-09-19; unplanned. Written against `main`
at `4857e4334`. Picks up the "offline install build" half of the
[Museum kiosk mode](../../backlog/2026-08-31-museum-kiosk-mode.md) backlog item.

## 1. Purpose

A native desktop build of skymap for a museum/kiosk machine: an Electron app
(bundled Chromium, so WebGPU behaves as in Chrome) that downloads every runtime
asset from R2 once and then runs with no network. Later launches that find a
network update the local copy incrementally.

## 2. Scope

**In:** `packages/desktop/` Electron workspace; one-time + incremental data sync
from an inventory `sync-r2` publishes; `app://` protocol serving the built app and
the synced data; kiosk window, crash-reload supervision, navigation lock; mac dmg +
win nsis, unsigned.

**Prerequisite PR (separate, lands first):** self-host Cormorant Garamond
(`public/fonts/` + `index.html:33-37`), removing the Google Fonts dependency for
the web app too.

**Out:** attract loop / `?kiosk` autostart, touch-to-explore + idle reset, galaxy
thumbnail pack (kiosk phases 1–3 — offline, SDSS/DSS fetches already fall back to
the procedural disk, `fetchGalaxyBitmap.ts`); WebGPU `device.lost` recovery;
signing, notarization, auto-update of the app binary; a CI release job; Linux.

## 3. Ground preparation

### 3.1 Ideal shape

```ts
// tools/deploy/r2/R2SyncGroup.ts — one field, set on every row of buildGroups()
readonly offline: boolean; // true: runtime asset the desktop app mirrors

// tools/deploy/r2/OfflineInventory.ts
export type OfflineInventory = {
  groups: { label: string; files: { key: string; size: number; sha256: string }[] }[];
};

// tools/deploy/syncR2.ts — after every group: build the inventory from the
// offline groups, upload data/offline-inventory.json LAST (NO_CACHE, purge)

packages/desktop/     package.json, tsconfig.json, electron-builder.yml, vitest config
  src/main/main.ts                 lifecycle: sync-or-boot, then kiosk window
  src/main/registerAppProtocol.ts  app:// → dist/ | <dataRoot>
  src/main/superviseWindow.ts      crash reload, unresponsive reload, navigation lock
  src/sync/planSync.ts             pure: inventory × synced × onDisk → plan
  src/sync/runSync.ts              executor
  src/sync-page/                   progress / error screen
package.json          "workspaces": ["packages/*"], "desktop" script
.env.desktop          VITE_DATA_BASE_URL= (empty), no VITE_COUNTERSCALE_URL
.gitignore            carve-out for .env.desktop beside .env.production
```

### 3.2 Greenfield cross-check

A fresh derivation from the requirements alone proposed a content-addressed local
store (`blobs/<sha>` + per-generation manifests + an atomic `current.json` rename)
and an immutable inventory behind a `latest.json` pointer. Priced at the
checkpoint and **ruled against (option A)**: its only extra guarantee is no mixed
set of unhashed images after a partial sync (cosmetic, self-healing on the next
sync), paid for with a key→sha indirection, a second resolver for dev's plain
`public/data`, and an opaque data folder. The immutable-inventory pointer and
one-generation rollback are dropped: one `no-cache` inventory uploaded last gives
the same visibility guarantee, and rollback needs a health check nobody asked for.

### 3.3 Joint verdicts

All growth: a field on every `R2SyncGroup` row (`R2SyncGroup.ts:15`), not an
exclusion list; a Vite mode for the desktop build, since every data fetch already
routes through `dataBaseUrl()` (`src/utils/network/dataBaseUrl.ts:8`); one
workspaces line. **Prep refactors: none.** No adjacent findings worth a backlog
entry.

### 3.4 Packaging

Font self-host: its own small PR, first. Everything else: one feature PR.

## 4. Inventory (deploy side)

`buildGroups()` rows gain `offline`. `true` for `public/data`, hi-res famous
images, planet textures, every surface-tiles group, every surface-tile-manifest
group, and the data manifest. `false` for `Extra files` (contributor caches +
`robots.txt`) and `Mesh sources` (`.blend` backups).

After the upload loop, `syncR2.ts` builds `OfflineInventory` from the offline
groups **in table order**, every file of every group (not just the changed ones).
`key` is the bucket key; `size` and `sha256` are of the local raw bytes: wire gzip
is decoded by the client, so neither may be taken from the stored object. It is
written to a temp path (never into `public/data/`, whose tracked set the manifest
drift guard polices) and uploaded as `data/offline-inventory.json`, `NO_CACHE`,
purged, **after** `manifest.json`.

**Invariant the desktop app inherits:** a pointer file (data manifest, tile
manifest) is uploaded after every file it names, and anything a pointer names is
immutable at its key (content hash or versioned prefix). This is already the web
deploy's rule (docs/DEPLOY.md); an asset family that breaks it breaks the kiosk's
partial-sync guarantee too.

## 5. Local mirror and sync (app side)

**Layout:** `<userData>/data/` mirrors the bucket's `data/` tree key for key, plus
`synced.json` (`key → sha256` of files verified complete).

**Plan (`planSync`, pure):** inputs are the inventory, `synced.json`, and the set of
keys present on disk. Output: per group in inventory order, the files to download
(key absent from `synced`, sha differs, or file missing on disk); and the prune
list (keys on disk not in the inventory, excluding `synced.json` itself).

**Execute (`runSync`):** fetch the inventory (5 s timeout). Groups in order; ~8
concurrent downloads within a group, each streamed to `<file>.part`, sha256
checked, renamed into place; `synced.json` rewritten after each group. Prune only
after every group succeeds. A sha mismatch aborts the run (a newer deploy landed
mid-sync), and the next launch re-plans.

**Why partial is safe:** new hashed files and new tile prefixes are unreachable
until their pointer, which sits in a later group; old files survive until the
final prune. Unhashed images (`famous-hires`, `textures`) are overwritten in
place, so a crash can leave a mixed but individually valid image set until the
next completed sync.

| Situation                                  | Behaviour                                |
| ------------------------------------------ | ---------------------------------------- |
| No network, complete local set             | Boot                                     |
| No network, no local set                   | Error screen: needs internet once; retry |
| Sync fails mid-run (network, 5xx, sha)     | Boot the previous set; retry next launch |
| Sync fails, no previous set                | Error screen with retry                  |
| Insufficient disk (inventory size − local) | Error screen with needed vs free         |

## 6. Shell

- **Build:** root `vite build --mode desktop` → `dist/` with an empty data base
  URL and no analytics; `dataUrl()` resolves `/data/<hashed>` exactly as in dev.
- **Protocol:** `app` registered privileged (`standard`, `secure`,
  `supportFetchAPI`, `stream`) so the page is a secure context. `app://skymap/data/*`
  → data root; everything else → bundled `dist/`. A resolved path outside its root
  is a 404.
- **Window:** `kiosk: true`, black background; `--windowed` gives a normal window
  with DevTools for development.
- **Supervision:** `render-process-gone` (not `clean-exit`) and `child-process-gone`
  of type `GPU` → reload after 2 s; `unresponsive` for 30 s → reload.
- **Navigation lock:** `will-navigate` blocks non-`app://` targets;
  `setWindowOpenHandler` denies all. InfoCard outbound links become dead clicks.
- **Dev:** `npm run desktop` launches with `SKYMAP_DATA_DIR` pointing at the main
  checkout's `public/data` and skips sync.
- **Package:** electron-builder, mac dmg + win nsis, unsigned. Whether the win
  target cross-builds on macOS is `needs-verification` in the plan's first task;
  the fallback is building on a Windows machine, not a CI job.

## 7. Testing

- `planSync`: skip-when-synced, sha mismatch, missing-on-disk, group order kept,
  prune excludes `synced.json`, prune absent from a partial plan.
- Protocol path resolution: traversal refused, data vs dist routing.
- Inventory builder (`tools/`): offline filter, table order, raw-byte sha/size.
- Integration: `runSync` against a local HTTP fixture that fails mid-group; the
  previous set is intact and a second run resumes.
- CI: one step runs the desktop workspace's tests.
- Manual (mac + Windows): first sync, boot with networking off, crash recovery via
  `process.crash()` from DevTools in `--windowed`, WebGPU on D3D12.
