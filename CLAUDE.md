# Skymap — Claude onboarding

Quick orientation for an AI agent picking up work in this repo. Read this first; it points at the deeper docs.

## What this is

A WebGPU 3D galaxy renderer. Three real catalogs (SDSS, 2MRS, GLADE) are parsed at build time into a custom binary format, loaded in the browser, and drawn as instanced point billboards with selective per-galaxy thumbnail quads on close approach. TS + Vite + React for the UI shell, raw WebGPU + WGSL for the renderer.

## Where to look

```
src/
  @types/             Top-level type declarations, organized into subfolders
                      (data/, engine/, rendering/, loading/, camera/, input/,
                      settings/, math/). One file per type. No barrel — all
                      imports are deep + relative.
  components/         React UI shell (InfoCard, SettingsPanel, ScaleBar, StatusBar)
  data/               Static data definitions: sources enum, colourIndex spec, binary format
  services/
    camera/           OrbitCamera, OrbitControls (mouse pan/orbit), tweens
    engine/           Top-level engine orchestrator, autoLod, cloud loader
    gpu/              Renderers, texture atlas, image queue/fetcher, WGSL shaders
    input/            SpaceMouse + raw input → camera deltas
  utils/              Pure helpers (math, format, random) — heavily tested
tools/
  catalog/            buildAllBins (pipeline entry point), crossMatch dedup,
                      subsampleByAbsMag
  famous/             famous-galaxy seed expansion + image fetcher cluster
                      (buildFamous, expandFamousFromCatalogs, fetchFamousImages,
                      famousImageProcessor)
  filaments/          buildFilaments — DisPerSE wrapper
  volumes/            scalar-field volume builders (CF-4, MCPM) + diagnostics
                      (auditCf4Anchors, verifyCf4Scfd, buildScalarVolumeFixture,
                      extractMcpmCube.py)
  fonts/              buildFontAtlas — MSDF multi-font atlas generator
  site/               makeFavicon, makeOgImage
  deploy/             syncR2 + r2Cors.json + r2-static/ static assets
  fetch/              fetch2massXsc, fetchHyperLeda, buildPgcAliases — long-running
                      external-catalog fetchers with on-disk resume caches
  parsers/            SDSS CSV, 2MRS fixed-width, GLADE fixed-width, NPY,
                      ND-skeleton parsers
  utils/              tools-only helpers (math, io, cli, async, random) —
                      one file per function, deep imports
  vendor-types/       ambient .d.ts shims for msdf-bmfont-xml and pngjs
data/
  raw/                Catalog source files + their VizieR ReadMes (read these for byte layouts!)
docs/superpowers/plans/   Active and historical implementation plans (TDD task lists)
tests/                Vitest suite — mirrors src/ tree
```

## Project conventions (these override defaults)

- **Didactic comments**: this project uses learning-oriented comments. Explain _why_ and _what the alternative was_, not just _what_. Many files have multi-paragraph module headers — match that style. (Overrides the default no-comments rule.)
- **`type` aliases, never `interface`**: `export type X = { ... }` for all TS shapes.
- **No barrel exports for components**: import React components directly from their `.tsx`. No `index.ts` re-export files in component folders.
- **Dev server stays running**: `npm run dev` is left running in the background for HMR visual checks. Don't kill it. To verify a UI change, ask the user to look (or describe what they should see).
- **TDD via plans**: substantial features get a plan in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` with bite-sized TDD tasks. Plans are executed via the `subagent-driven-development` workflow (fresh subagent per task + spec + quality reviews).
- **Plans coexist**: multiple in-flight plans is normal. Check the file list before starting new work to avoid stomping on something else.

## Commands

```bash
npm run dev         # vite dev server (leave running)
npm run build       # tsc --noEmit + vite build
npm run typecheck   # both src and tools tsconfigs
npm test            # vitest run (single pass)
npm run test:watch  # vitest watch mode
npm run build-all   # regenerate public/data/*.bin from raw catalogs
npm run build-tiers # alias for build-all — emits per-tier .bin variants
npm run format      # prettier
```

Currently 590+ tests passing across 76 files. Keep it green.

## Data pipeline (mental model)

```
data/raw/*.dat,*.csv  ──parsers──▶  ParsedRecord[]  ──crossMatch──▶  GalaxyCatalog  ──encode──▶  public/data/*.bin
                                                                                                       │
                                                                                                       ▼
                                            browser fetch  ◀──decodeGalaxyCatalog──  ArrayBuffer  ◀──load
                                              │
                                              ▼
                                          GPU vertex/index buffers  ──pointRenderer──▶  WGSL  ──▶  canvas
```

Binary format is in `src/data/galaxyCatalogFormat.ts` — currently v4, 64 bytes/galaxy. Bumping the version means regenerating bins via `npm run build-all`. The format header stores `magic + version + count`, so old bins fail loudly with a clear regenerate message. (The 2026-05-17 PointCloud → GalaxyCatalog code rename did NOT bump the on-disk format.)

### Deploy workflow (Cloudflare Workers Assets + R2)

Two Cloudflare resources serve skymap, and they're updated independently:

- **The static shell** (HTML, JS, CSS, WGSL shaders, `_headers`, famous-galaxy WebPs) ships to **Cloudflare Workers Assets** automatically on every push to `main`. Cloudflare's dashboard-managed GitHub integration runs `npm run build` and uploads `dist/`. There is no local CLI step for the shell deploy — `npm run deploy` is just `git push origin main` with a hint of where to watch the build progress.

- **The `.bin` catalog files** (~280 MB across all tiers + filaments) live in **Cloudflare R2** at `skymap-data.rulkens.com`, because they exceed Workers Assets' per-file size limit and because R2 has zero egress costs. They're synced manually via `npm run sync-r2` after a `build-tiers` rerun, **not** on every push.

A full data-refreshing deploy is therefore:

1. `npm run build-tiers` — regenerates all `public/data/*.bin`.
2. `npm run build-filaments` (only if filaments need rebuilding — rare).
3. `npm run sync-r2` — uploads regenerated `.bin` files (and `famous_*.json` sidecars) to R2. Idempotent; full bucket replacement on every run.
4. `npm run deploy` — pushes `main`. The Cloudflare GitHub integration takes over and rebuilds the shell.

If you only changed code and not catalog bytes, **step 4 alone is enough**. The most common loop is "edit, push, watch the Workers build", which finishes in ~30 s.

The `.bin` files are intentionally **not** in git (`public/data/*.bin` is gitignored). They are pure build artefacts: deterministic outputs of `tools/catalog/buildAllBins.ts` against the raw catalog files in `data/raw/`. Checking them in would inflate every clone by ~150 MB for no informational gain — the same bytes can always be rebuilt from source on demand. Keeping them out also avoids accidental drift between `tools/catalog/buildAllBins.ts` settings (tier targets, abs-mag thresholds) and a stale committed binary; the R2 sync ships a fresh build on demand, so what's hosted is always in sync with the current pipeline code.

The runtime `cloudLoader` requests `<source>-<tier>.bin` per source as the user switches tiers; the `dataUrl()` helper prefixes each path with `VITE_DATA_BASE_URL`, which is set in the committed `.env.production` (the rest of `.env*` is gitignored — see the .gitignore docblock for the rationale). Vite inlines that value into the production bundle at build time. Dev runs with no `.env.development` present, so `dataUrl()` falls back to the empty string and Vite serves `public/data/*` at the relative `/data/` path. A complete R2 sync must include every variant the runtime might request: `sdss-medium.bin`, `sdss-large.bin`, `glade-small.bin`, `glade-medium.bin`, `glade-large.bin`, plus the tier-agnostic `2mrs.bin`, `famous.bin`, and `filaments.bin`. The `tools/deploy/syncR2.ts` ALLOW filter encodes that set.

### MCPM Cosmic Web volume

The SDSS DR17 Cosmic Slime VAC `SDSS_z_44-476mpc` cube ships as three
tiered SCFDs (`mcpm-{small,medium,large}.scfd`) alongside CF-4. The
extract step requires Python + pyslime and only happens once per VAC
release; contributors curl the pre-extracted `.npy` tiers from R2 and
run `npm run build-mcpm` to emit the SCFDs locally. The runtime fetches
`mcpm-<tier>.scfd` per the user's current tier dropdown — same path
the galaxy catalogs use through `state.sources.tier`. See
`docs/superpowers/specs/2026-05-11-mcpm-cosmic-web-volume-design.md`
for the full pipeline + format details.

#### Cache-Control

- **Static shell:** `public/_headers` (Workers Assets reads it automatically). JS/CSS/WGSL/WASM get `max-age=31536000, immutable`; `images/famous/*.webp` get `max-age=86400`.
- **R2 objects:** set per-object on upload by `tools/deploy/syncR2.ts` (`max-age=86400`).

#### CORS

R2 has a single CORS rule allowing `GET`/`HEAD` from `https://skymap.rulkens.com`, `https://skymap.rulkens.workers.dev`, and `http://localhost:5173`. Re-apply with `npm run r2-cors` (config in `tools/deploy/r2Cors.json`).

#### Why R2 instead of bundling .bin into the Workers deploy

Workers Assets has per-file and per-deploy size caps that the larger tiers (`glade-large.bin` ~130 MB) blow through. R2 has neither, has zero egress fees, and treats large binary blobs as a first-class use case. The split also makes catalog refreshes independent of code deploys — a re-sync to R2 doesn't require a rebuild.

## Catalog gotchas

- **2MRS** (Huchra 2012) has only near-IR (J/H/K) photometry — we map J→magG, H→magR, K→magI to fit the SDSS-shaped slot. Local Group galaxies have _negative_ cz; do **not** filter `cz > 0`.
- **GLADE v2.3** has no orientation columns. PGC numbers in col 1-7 are the cross-match key into HyperLEDA.
- **2MRS** has `b/a` but no PA. The 2MASS XSC (the underlying source) has `sup_phi` — cross-match by 2MASS ID.
- **SDSS** CSV column set is whatever was in the SkyServer SQL query — check the CSV header before assuming a column exists.

ReadMes for the upstream catalogs live in `data/raw/` (`J_ApJS_199_26_ReadMe`, `VII_281_ReadMe`). Always consult them for byte offsets when extending parsers.

## Renderer quick map

- **`pointRenderer.ts` + `shaders/points.wesl`**: instanced billboards. Vertex stride is 48 bytes / 12 slots (xyz, magnitude, colorIndex, kPerZ, axisRatio + sign-bit fallback flag, positionAngleDeg, diameterKpc, vMaxWeight, schechterRatio, angularDensityWeight). Identity is composed on the GPU from a per-draw `SourceUniforms.sourceCode` + `@builtin(instance_index)`, NOT baked per-vertex.
- **`pickRenderer.ts`**: r32uint pick texture. The fragment writes `(sourceCode << 27) | (localIdx + PICK_SENTINEL_OFFSET)`; see `src/data/selectionEncoding.ts` for the encoding (5 bits source, 27 bits localIdx, code 31 reserved as the all-ones sentinel). Source codes are append-only (the rule lives in `sources.ts`'s docstring) — same hygiene as enum values that get persisted to .bin, applied to POI-only codes too. Read the texture with `copyTextureToBuffer` for hover/click.
- **`textureAtlas.ts` + `quadRenderer.ts` + `shaders/quads.wgsl`**: 2048×2048 atlas of 128×128 slots for galaxy thumbnails. LRU eviction.
- **`galaxyImageQueue.ts`**: priority queue + concurrency limiter (max 4) for thumbnail fetches. Idempotent enqueue (don't re-add in-flight keys — see the long comment for the bug history).
- **`galaxyImageFetcher.ts`**: SDSS DR18 ImgCutout (CORS-safe) for SDSS galaxies; CDS hips2fits (CORS-safe DSS proxy) for 2MRS/GLADE.
- **`engine.ts`**: per-frame loop. Per-galaxy `apparentSizePx` gates thumbnail enqueue — but the inner loop hoists `Math.tan` and pre-computes `maxCamDistForVisibility` to avoid 2.5M trig calls per frame.
- **`renderScheduler.ts` + `engine.ts` frame tail**: render-on-demand. `requestRender()` from event handlers wakes the loop; the frame body re-schedules only while `autoRotate || currentTween || hasAnyAxis || queue.inFlightCount > 0 || recent-fade` is true.

## When the user asks you to…

- **"add a feature"** → look in `docs/superpowers/plans/` for an existing plan. If it's substantial, write a new plan via the `writing-plans` skill rather than coding inline.
- **"fix this bug"** → check tests first; the project favours reproducing bugs as failing tests, then fixing.
- **"why is this slow?"** → profile mental model first: per-frame work scales with on-screen galaxies (~2.5M total). Inner-loop trig and `Math.sqrt` are real costs. Hoist constants, gate with squared distances, avoid per-galaxy `Math.tan`.
- **"refactor X"** → keep the services/ layout. Cross-cutting helpers go in `utils/`; rendering subsystems in `services/gpu/`. Tests mirror the src tree.
- **"why does the renderer use index Y?"** → check `pointRenderer.ts` SLOTS_PER_POINT and the matching attribute layout in the shader. They must agree byte-for-byte.

## Things that have bitten us before

- **WebGPU `queue.writeBuffer` race**: interleaving `writeBuffer` with `submit` in the same frame doesn't preserve order — bake per-instance data into the vertex buffer instead of a uniform you mutate per draw.
- **Selection halo on wrong galaxy**: same root cause — selection index must come from a per-vertex attribute, not a uniform updated mid-frame.
- **CORS on DSS thumbnails**: ESO's DSS endpoint blocks browsers. Use CDS hips2fits (`https://alasky.cds.unistra.fr/hips-image-services/hips2fits`).
- **Retry storms on failed thumbnails**: the engine has BOTH a `bitmapReady` and `bitmapFailed` Set — the per-frame gate must check both. The image queue's `enqueue` is idempotent for in-flight keys.
- **`<details>` element collapsing on hover**: keep the InfoCard's outer wrapper element identical across renders so React doesn't remount and reset the `open` state.

## Memory

The agent's auto-memory at `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/` carries cross-session context (project state, user preferences, plan progress). Read `MEMORY.md` for the index. Update memories when project state shifts (plan task completed, new convention adopted, catalog re-fetched, etc.).
