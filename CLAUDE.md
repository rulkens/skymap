# Skymap — Claude onboarding

Quick orientation for an AI agent picking up work in this repo. Read this first; it points at the deeper docs.

## What this is

A WebGPU 3D galaxy renderer. Three real catalogs (SDSS, 2MRS, GLADE) are parsed at build time into a custom binary format, loaded in the browser, and drawn as instanced point billboards with selective per-galaxy thumbnail quads on close approach. TS + Vite + React for the UI shell, raw WebGPU + WGSL for the renderer.

## Where to look

```
src/
  @types/             Top-level type declarations (PointCloud, EngineHandle, etc.)
  components/         React UI shell (InfoCard, SettingsPanel, ScaleBar, StatusBar)
  data/               Static data definitions: sources enum, colourIndex spec, binary format
  services/
    camera/           OrbitCamera, OrbitControls (mouse pan/orbit), tweens
    engine/           Top-level engine orchestrator, autoLod, cloud loader
    gpu/              Renderers, texture atlas, image queue/fetcher, WGSL shaders
    input/            SpaceMouse + raw input → camera deltas
  utils/              Pure helpers (math, format, random) — heavily tested
tools/
  buildAllBins.ts     Pipeline: parse raw catalogs → cross-match → write .bin files
  parsers/            SDSS CSV, 2MRS fixed-width, GLADE fixed-width parsers
  crossMatch.ts       Dedup logic across surveys
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
data/raw/*.dat,*.csv  ──parsers──▶  ParsedRecord[]  ──crossMatch──▶  PointCloud  ──encode──▶  public/data/*.bin
                                                                                                    │
                                                                                                    ▼
                                          browser fetch  ◀──decodePointCloud──  ArrayBuffer  ◀──load
                                              │
                                              ▼
                                          GPU vertex/index buffers  ──pointRenderer──▶  WGSL  ──▶  canvas
```

Binary format is in `src/data/pointCloudFormat.ts` — currently v2, 48 bytes/point. Bumping the version means regenerating bins via `npm run build-all`. The format header stores `magic + version + count`, so old bins fail loudly with a clear regenerate message.

### Deploy workflow (Firebase static hosting)

1. `npm run build-tiers` — regenerates all `public/data/*.bin` (12 tier-suffixed variants for SDSS + GLADE; one shared `2mrs.bin` and `famous.bin`).
2. `npm run build-filaments` (if filaments need rebuilding).
3. `npm run deploy` — runs `npm run build && firebase deploy --only hosting`.

The `.bin` files are intentionally **not** in git (`public/data/*.bin` is gitignored). They are pure build artefacts: deterministic outputs of `tools/buildAllBins.ts` against the raw catalog files in `data/raw/`. Checking them in would inflate every clone by ~150 MB for no informational gain — the same bytes can always be rebuilt from source on demand. Keeping them out also avoids accidental drift between `tools/buildAllBins.ts` settings (tier targets, abs-mag thresholds) and a stale committed binary; each deploy ships a fresh build, so what's hosted is always in sync with the current pipeline code.

The runtime `cloudLoader` requests `<source>-<tier>.bin` per source as the user switches tiers. A complete deploy must therefore include every variant the runtime might request: `sdss-medium.bin`, `sdss-large.bin`, `glade-small.bin`, `glade-medium.bin`, `glade-large.bin`, plus the tier-agnostic `2mrs.bin` and `famous.bin`. (`firebase deploy --only hosting` uploads the full `public/` tree, so as long as `npm run build-tiers` ran first, all variants ship.)

## Catalog gotchas

- **2MRS** (Huchra 2012) has only near-IR (J/H/K) photometry — we map J→magG, H→magR, K→magI to fit the SDSS-shaped slot. Local Group galaxies have _negative_ cz; do **not** filter `cz > 0`.
- **GLADE v2.3** has no orientation columns. PGC numbers in col 1-7 are the cross-match key into HyperLEDA.
- **2MRS** has `b/a` but no PA. The 2MASS XSC (the underlying source) has `sup_phi` — cross-match by 2MASS ID.
- **SDSS** CSV column set is whatever was in the SkyServer SQL query — check the CSV header before assuming a column exists.

ReadMes for the upstream catalogs live in `data/raw/` (`J_ApJS_199_26_ReadMe`, `VII_281_ReadMe`). Always consult them for byte offsets when extending parsers.

## Renderer quick map

- **`pointRenderer.ts` + `shaders/points.wgsl`**: instanced billboards. Vertex stride is currently 28 bytes / 7 slots (xyz, magnitude, colorIndex, globalInstanceIdx u32, kPerZ).
- **`pickRenderer.ts`**: r32uint pick texture; selection encoded as per-vertex `globalInstanceIdx`. Read it with `copyTextureToBuffer` for hover/click.
- **`textureAtlas.ts` + `quadRenderer.ts` + `shaders/quads.wgsl`**: 2048×2048 atlas of 128×128 slots for galaxy thumbnails. LRU eviction.
- **`galaxyImageQueue.ts`**: priority queue + concurrency limiter (max 4) for thumbnail fetches. Idempotent enqueue (don't re-add in-flight keys — see the long comment for the bug history).
- **`galaxyImageFetcher.ts`**: SDSS DR18 ImgCutout (CORS-safe) for SDSS galaxies; CDS hips2fits (CORS-safe DSS proxy) for 2MRS/GLADE.
- **`engine.ts`**: per-frame loop. Per-galaxy `apparentSizePx` gates thumbnail enqueue — but the inner loop hoists `Math.tan` and pre-computes `maxCamDistForVisibility` to avoid 3.5M trig calls per frame.
- **`renderScheduler.ts` + `engine.ts` frame tail**: render-on-demand. `requestRender()` from event handlers wakes the loop; the frame body re-schedules only while `autoRotate || currentTween || hasAnyAxis || queue.inFlightCount > 0 || recent-fade` is true.

## When the user asks you to…

- **"add a feature"** → look in `docs/superpowers/plans/` for an existing plan. If it's substantial, write a new plan via the `writing-plans` skill rather than coding inline.
- **"fix this bug"** → check tests first; the project favours reproducing bugs as failing tests, then fixing.
- **"why is this slow?"** → profile mental model first: per-frame work scales with on-screen galaxies (~3.5M total). Inner-loop trig and `Math.sqrt` are real costs. Hoist constants, gate with squared distances, avoid per-galaxy `Math.tan`.
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
