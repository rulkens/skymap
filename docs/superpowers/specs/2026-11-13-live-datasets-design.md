# Live datasets: a shared nightly pipeline, and Earth's clouds from yesterday

Status: draft, 2026-11-13. Three PRs, in this order: cloud format, satellites onto the shared pipeline, daily clouds.

## Goal

Earth's cloud deck shows yesterday's real clouds. A nightly job publishes them through the same pipeline that already refreshes the satellite catalog, made generic so a third date-specific dataset is one registry row. The bake tool (`tools/cloud-bake-rs`, #1115, #1133) is done; this spec covers getting its output to the app.

## Rulings (owner, 2026-11-13)

- The app only ever loads the **newest** version of a dataset, never an older date.
- A failed or rejected bake publishes nothing; the app keeps loading the previous day's map. The app never shows a broken map (no "grey ball").
- Dated copies are kept 30 days on R2 for later use (animation) and are never read by the app.
- R2 layout: a small **pointer file** per dataset plus **dated files that are never overwritten** (chosen over a fixed key overwritten nightly).
- Both cloud maps (built-in and daily) share one format: **one grey channel**.
- One shared registry and workflow for all live datasets; satellites move onto it.
- Three PRs: (1) cloud format, (2) satellites onto the shared pipeline, (3) daily clouds.

## Ground preparation

Ground check shown 2026-11-13 and signed off. The greenfield cross-check (a subagent given only the requirements) proposed the pointer layout; the owner took it over the compatible fixed-key shape. Verdicts:

| Touchpoint | Verdict | Joint |
|---|---|---|
| Cloud map format | bolt-on today: every reader samples `.a` of an RGBA map; a grey file would draw opaque | prep 1 (PR 1): clouds become one grey channel |
| Nightly workflow | bolt-on today: `satellites.yml` hard-wires one key and its headers | prep 2 (PR 2): `LIVE_DATASETS` registry + shared workflow, satellites as its first row |
| App: satellites file | changes with prep 2: read through the pointer | `fetchLiveFile` (PR 2) |
| Clouds dataset | growth: a registry row | — |
| Clouds slot fallback | growth: the fetcher tries a list of URLs | `bodyTextureUrls` (PR 3) |
| Credits, attributions | growth: rows in `creditGroups`, `ATTRIBUTIONS.md` | — |
| Kiosk mirror | growth: nothing to do; live keys are in no sync group, so the kiosk 404s and falls back | — |

Adjacent findings, not done here (backlog): the cloud shell keeps its own copy of the cloud texture instead of borrowing the globe's; `data/raw/textures/textures.sha256` lacks three of the four Blue Marble months on disk.

## 1. Cloud format: one grey channel (PR 1)

Today `writeCloudTier` (`tools/textures/writeCloudTier.ts`) writes lossless RGBA with alpha = luminance (23.5 MB at 8192), uploads are `rgba8unorm-srgb`, and five shader reads take `.a`. After:

- **Files.** `writeCloudTier` writes a grey lossy WebP (quality 80, as the bake). The built-in tiers are rebuilt from `cloud_combined_8192.tif`; the 8192 tier drops to about 6 MB. The filenames change (`earth-clouds-grey-<px>.webp`), so an open tab running old code never receives a grey file, and new code never reads an old RGBA one.
- **GPU.** Both sinks upload the clouds map as `r8unorm` (one texture format helper decides per kind, replacing the inline choice in `earthRenderer.setMap` and the hard-coded format in `cloudShellRenderer`). `generateMipChain` already renders in the texture's own format.
- **Shaders.** Coverage reads take `.r` (earth/fragment.wesl ×2, surfaceTile/fragmentEarth.wesl ×2). The shell's colour was the sRGB grey decoded to linear by the `-srgb` format; with `r8unorm` it decodes that itself (`srgbToLinear(c.r)`), and its coverage stays the raw byte, so the deck looks the same per texel; filtered/mipped texels average the sRGB byte before decoding, so mixed cloud-sky texels come out slightly darker (measured: mean image difference 0.1/255 at a whole-globe pose).
- **The kind rule.** `isAlphaTextureKind` no longer describes clouds; it is renamed or folded so the filename rule still picks WebP for clouds.
- **Deploy.** The rebuilt tiers go up with `npm run sync-r2-secure`; the old RGBA files stay on R2 until a later cleanup.

Verified by a before/after check of the cloud deck, ground shadows and night-light dimming at the same pose (the owner's eye), plus `npm run perf` before and after.

## 2. The shared pipeline (PR 2)

### Registry

`src/data/live/liveDatasets.ts` exports `LIVE_DATASETS: readonly LiveDataset[]` (type in `src/@types/`), the one home the app and the tools share:

```ts
type LiveDataset = {
  id: string;                 // 'satellites' | 'clouds'; the R2 folder
  build: string;              // npm script that writes the outputs, exits non-zero on bad data
  files: readonly LiveFile[]; // name in the dated folder, local build path, Content-Type, gzip on the wire
  timeoutMin: number;
  bodyTexture?: { bodyId: BodyId; kind: TextureKind; byTierPx: Record<number, string> }; // clouds only, PR 3
};
```

Adding a dataset is one row plus its build script. A build script validates its own output (satellites: the existing 15 000-object floor; clouds: exit code, then dimensions and channel check), so there is no second validation concept.

### Bucket layout

```
data/live/v1/<id>.json                    pointer, Cache-Control: no-cache
data/live/v1/files/<id>/<YYYY-MM-DD>/<name>   Cache-Control: public, max-age=31536000, immutable
```

The pointer is `{ "date": "YYYY-MM-DD", "builtAt": "<ISO>", "files": { "<name>": "<key>" } }`. Files are never overwritten, so a visitor can only see a stale pointer (one small revalidated request), never a mix of two days. The upload writes every file first and the pointer last; a failed build uploads nothing, so the pointer keeps naming yesterday. The build writes the same layout under `public/data/live/v1/` locally, so `npm run dev` exercises the real paths.

### Workflow

`.github/workflows/live-datasets.yml` (cron 04:23 UTC plus `workflow_dispatch`) has a `plan` job that prints the registry ids as a matrix, then one leg per id through the reusable `.github/workflows/live-dataset.yml` with `fail-fast: false`, so one dataset's failure never blocks another. Each leg keeps today's split:

- `build`: checkout, `npm ci`, the row's `build` script, no secrets; uploads the `public/data/live/v1/` tree as an artifact.
- `upload`: no checkout, no npm; holds the R2 key (the same three secrets); copies the dated files with their headers (gzip where the row says), then the pointer.

`satellites.yml` is deleted.

### Retention

One R2 lifecycle rule deletes objects under `data/live/v1/files/` after 30 days (`npx wrangler r2 bucket lifecycle add skymap-data live-files-expire-30d data/live/v1/files/ --expire-days 30`, recorded in DEPLOY.md beside the films rule). Pointers are outside that prefix. After more than 30 failed nights in a row the pointer names a deleted file; the app treats the 404 like any failure (§3).

### App: satellites

`fetchLiveFile(id, name, signal)` (in `src/services/loading/`) fetches the pointer, then the file it names, through `dataUrl`. `satellitesSlot` uses it. The fade by age stays as it is (`fetchedAtMs` in the file).

### Migration

The old key `data/satellite-catalog/v1/satellites.satg` is no longer written. Tabs still running the old code keep loading it; it ages and those tabs fade the satellites out after 14 days, as designed. The object is deleted after those 14 days (a DEPLOY.md note). `SATELLITE_CATALOG_PATH` goes.

## 3. Daily clouds (PR 3)

- **Row.** `clouds`: build script `build-live-clouds` runs `bake-clouds` for yesterday UTC, then `writeCloudTier` for 8192, 4096 and 2048, then checks each output's dimensions and that it decodes as grey. Any failure exits non-zero, and nothing is uploaded.
- **CI inputs.** `Swatinem/rust-cache` for the tool. The fixed inputs (baseline TIFF, 12 Blue Marble months, ~400 MB) come from `npm run fetch-cloud-inputs -- --confirm` behind `actions/cache` keyed on `textures.sha256`. The day's sources are fetched cold (~104 MB, ~2 min). Peak memory ~3 GB on Linux fits the standard runner; timeout 30 min.
- **App.** `bodyTextureFetcher` tries `bodyTextureUrls(req)` in order: for a slot a live row names, the daily file through the pointer first, then the built-in tier. A failure of the first (404, network, a non-image) moves on to the next; only when all fail does the slot error as today.
- **Kiosk.** The live keys are in no sync group, so the kiosk's local server 404s them and the mirrored built-in map loads. No change.
- **Credits.** `creditGroups` (Earth) gains NASA GIBS and EUMETSAT ("Contains modified EUMETSAT Meteosat data <year>"); `ATTRIBUTIONS.md` "Live cloud bake inputs" drops "nothing is shipped yet".
- **Go-live gate.** The Himawari terms (via GIBS) are unverified. The owner confirms them, or the bake replaces that region with NOAA GMGSI, before PR 3 merges. The gate is the merge, not a flag on the row.

## Failure modes

| What fails | Result |
|---|---|
| Upstream outage, coverage below floor, calibration drift, a bad output | build exits non-zero; nothing uploaded; pointer still names yesterday |
| One dataset's leg | the other legs publish |
| Pointer or file unreachable in the browser | clouds: built-in map; satellites: no layer, as on a failed load today |
| 30+ failed nights | pointer names a deleted file; same as above |
| Old tab, new files | cannot happen for clouds (renamed files); satellites fade out after 14 days |

## Testing

- PR 1: `writeCloudTier` writes one grey channel at the tier width (updated test); the format helper per kind; the visual check above.
- PR 2: the registry's matrix output; `fetchLiveFile` resolves a pointer and surfaces a missing file as an error; the workflow is exercised once by `workflow_dispatch` before the cron is trusted.
- PR 3: `bodyTextureUrls` order and fallback on a failed first URL; `build-live-clouds` rejects wrong dimensions.

## Out of scope

Animation over the dated copies; cloud tiles at higher resolution; the fixed transfer curve (backlog); the remaining date-line improvements (backlog); the cloud shell sharing the globe's texture (backlog).
