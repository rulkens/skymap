# Skymap — Claude onboarding

Quick orientation for an AI agent picking up work here; it points at the deeper docs.

## What this is

A WebGPU 3D galaxy renderer: three real catalogs (SDSS, 2MRS, GLADE) parsed at build time into a custom binary format, loaded in the browser, drawn as instanced point billboards with per-galaxy thumbnail quads on close approach. TS + Vite + React UI shell; raw WebGPU + WGSL renderer.

## Where to look

```
src/
  @types/  one type per file; deep relative imports, no barrels
  components/  React UI shell (InfoCard, SettingsPanel, ScaleBar, StatusBar)
  data/  static data: sources enum, colourIndex spec, binary format
  hooks/  React hooks (useEngine, useUrlSync, alias/structure indexes, …)
  services/
    camera/  OrbitCamera, OrbitControls, tweens
    engine/  engine orchestrator, autoLod, cloud loader
    gpu/  renderers, texture atlas, image queue/fetcher, WGSL shaders
    input/  SpaceMouse + raw input → camera deltas
  state/  RTK slices/selectors/sagas per domain; forbids react-redux (see store/)
  store/  RTK store wiring: createAppStore, root reducer/saga, effects
  styles/  global.css — design tokens + body/html reset only
  utils/  pure helpers (math, format, random) — heavily tested
tools/
  animation/  tourLength — beat-sheet / clip-length reporting
  catalog/  buildAllBins (pipeline entry), crossMatch dedup, subsampleByAbsMag
  curation/  shared curation helpers (dedupeByProximity, writeMetaSidecar)
  dev/  tmux + worktree helpers — see "Tmux workflow helpers" below
  famous/  famous-galaxy seed expansion + image fetchers
  famous-curator/  hand-curate Famous thumbnails (npm run curate-famous)
  filaments/  buildFilaments — DisPerSE wrapper
  flow/  CF4++ peculiar-velocity flow-field builder + verifier
  flow-workbench/  WebGPU dev tool visualising the flow field
  galaxy-renderer/  dev tool: procedural Hubble-sequence galaxy + HDR bloom
  volumes/  scalar-field volume builders (CF-4, MCPM) + diagnostics
  fonts/  buildFontAtlas — MSDF multi-font atlas generator
  perf/  GPU-timing harness (npm run perf) → tools/perf/README.md
  record/  offline tour recorder → mp4 (npm run record-tour)
  site/  makeFavicon, makeOgImage
  structures/  buildStructures — cluster/supercluster catalog builder
  deploy/  syncR2 + r2Cors.json + r2-static/ static assets
  fetch/  external-catalog fetchers with on-disk resume caches
  parsers/  SDSS CSV, 2MRS fixed-width, GLADE fixed-width, NPY, ND-skeleton
  utils/  tools-only helpers — one file per function, deep imports
  vendor-types/  ambient .d.ts shims for msdf-bmfont-xml and pngjs
data/
  raw/  catalog sources, one subdir per source (2mrs/, glade/, hyperleda/, sdss/,
        cf4/, mcpm/, milliquas/, filaments/, famous/, fonts/, mcxc/, mscc/).
        VizieR ReadMes live beside their files (byte layouts!). Paths go
        through tools/utils/io/rawDataRegistry.ts.
docs/BACKLOG.md  ground-truth list of what's next
docs/superpowers/plans/  active implementation plans; shipped → plans/completed/
docs/superpowers/specs/  design specs; shipped → specs/completed/
tests/  Vitest suite — mirrors src/ tree
```

## Project conventions (these override defaults)

- **Didactic comments**: this project uses learning-oriented comments. Explain _why_ and _what the alternative was_, not just _what_. Many files have multi-paragraph module headers — match that style. (Overrides the default no-comments rule.)
- **`type` aliases, never `interface`**: `export type X = { ... }` for all TS shapes.
- **No barrel exports for components**: import React components directly from their `.tsx`. No `index.ts` re-export files in component folders.
- **One symbol per file in `utils/` and `@types/`**: every file in `src/utils/` (and `tools/utils/`) exports exactly **one function**; every file in `src/@types/` exports exactly **one type**. Filename = the exported symbol's name (kebab/camel as the symbol dictates). No multi-export helper grab-bags — if a "data" file grows a generic pure helper, extract it to its own `utils/<area>/<fn>.ts` (math/format/color/random/gpu/…) with a focused test. Deep relative imports, no barrels.
- **Dev server stays running**: `npm run dev` is left running in the background for HMR visual checks. Don't kill it. To verify a UI change, ask the user to look (or describe what they should see).
- **TDD via plans**: substantial features get a plan in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` with bite-sized TDD tasks. Plans are executed via the `subagent-driven-development` workflow (fresh subagent per task + spec + quality reviews). Plans follow [`docs/superpowers/conventions/plan-style.md`](docs/superpowers/conventions/plan-style.md) — **contract code yes, implementation code no** (overrides the upstream `writing-plans` skill's "complete code in every step" default). When a plan ships, run the `/feature-done` audit: it gates on the DoD then relocates the plan + its spec to `plans/completed/` + `specs/completed/`.
- **Refactor the ground before building**: any feature substantial enough for a spec/plan runs the `refactor-ground` skill **after brainstorming converges, before the spec is written**. It sketches the feature's ideal diff (data delta first), issues growth/bolt-on verdicts per touchpoint, and checkpoints the shape with the user; the spec then carries a "Ground preparation" section (filled, or "none needed — because X") and is written against the post-refactor architecture. Prep refactors are their own commits, sequenced before the feature commits; whether they land as separate PR(s) or ride one PR with the feature is an explicit ask at the checkpoint, every time — no default. `plan-style.md` gates plan authoring on that section existing.
- **Plans coexist**: multiple in-flight plans is normal. Check the file list before starting new work to avoid stomping on something else.
- **Backlog hygiene**: [`docs/BACKLOG.md`](docs/BACKLOG.md) lists only _unstarted_ work, grouped by subsystem area with a readiness tag; design-bearing items have a `docs/backlog/YYYY-MM-DD-<slug>.md` detail file linked from the index. **Keep the index line very short** — title + readiness tag + one terse clause + the `→ [details]` link. Anything longer (file lists, evidence, approach, options) goes in the detail md, NEVER inline in `BACKLOG.md`; the index is a scannable list, not a write-up. **Picking up an item removes it in the same change** — whether you implement it directly or write a spec/plan, delete its index line **and** its detail file in that commit/branch (the detail file seeds the spec; the spec/plan is then the source of truth). **Never strike through a done item** — delete it; the completion record is the git log + `*/completed/`. `/feature-done` sweeps the backlog when a plan ships; audit the whole file against the git log periodically to catch stragglers.
- **Test what can break**: judge every test by "will it ever fail on a real bug no other test or compiler check catches?" — no runtime type tests, constant/registry restatements, clamp-boundary or mirror tests. See [`docs/superpowers/conventions/testing.md`](docs/superpowers/conventions/testing.md).
- **Simplicity over ease**: judge a design by the artifact (what runs and gets changed), not the keystrokes; un-braid concerns that could vary independently. Principles + the known-entanglements backlog live in [`docs/superpowers/conventions/simplicity.md`](docs/superpowers/conventions/simplicity.md) (Rich Hickey's _Simple Made Easy_, applied to skymap). Run the `entanglement-radar` skill to review a diff/module — **and at design time over a spec/plan**: a section that exists to teach handling of an "asymmetry"/"subtlety"/"special-case" is a STOP-and-un-braid signal (classify essential vs accidental), not a note to write more carefully.

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
npm run move-files  # move/rename TS files, imports auto-rewritten (see .claude/skills/refactor)
npm run refactor    # ts-morph refactoring CLI (rename/extract/inline/delete/refs/move) → .claude/skills/refactor/SKILL.md
npm run record-tour # offline 4K tour recorder → tools/record/README.md
npm run perf        # headless GPU-timing harness → tools/perf/README.md
```

For `npm run perf`, read the `perf` skill (`.claude/skills/perf/SKILL.md`) first: measure **before and after** any renderer/perf change, and **in a worktree pass `--url http://localhost:<port>`** from _your_ server's `Local:` line or you silently measure another branch's server. The skill carries the flags and interpretation traps (MERGED vs PER-LAYER vs FLOOR, Apple Silicon slot-sum inflation).

The suite is large (600+ test files) and must stay green. Tests follow [`docs/superpowers/conventions/testing.md`](docs/superpowers/conventions/testing.md) — what _not_ to test matters as much as what to test.

### Tmux workflow helpers

- **`tools/dev/skymap-tmux.sh`** — starts/reattaches a `skymap` session, one window per `.claude/worktrees/*` plus `main` and `shell`; does not auto-start `claude`.
- **`tools/dev/skymap-wt-clean.sh`** — interactive cleanup of merged worktrees; skips dirty ones. Closing a tmux window does **not** remove its worktree.

One tmux window per worktree, rooted at the worktree path, so shell and `claude` share CWD. Use `EnterWorktree`/`ExitWorktree` only in single-window flows.

## Data pipeline (mental model)

```
data/raw/*  ─parsers─▶ ParsedRecord[] ─crossMatch─▶ GalaxyCatalog ─encode─▶ public/data/*.bin
  ─fetch─▶ decodeGalaxyCatalog ─▶ GPU vertex/index buffers ─pointRenderer─▶ WGSL ─▶ canvas
```

Binary format is in `src/data/galaxyCatalogFormat.ts` — currently v6, 64 bytes/galaxy. Bumping the version means regenerating bins via `npm run build-all`; the `magic + version + count` header makes old bins fail loudly. (The PointCloud → GalaxyCatalog code rename did NOT bump the on-disk format.)

### Local-volume distance override

Inside `CUTOFF_MPC = 30` the pipeline replaces the cz-derived position with a Cosmicflows-4 (or HyperLEDA `mod0`) measured distance; the catalogued spectroscopic z is stored separately on the .bin (v6, byte 54) so the InfoCard shows the published value. See `docs/superpowers/specs/2026-05-27-local-volume-distances.md`. Coverage: ~2,030 of CF4's 2,159 PGCs via GLADE-by-PGC; 2MRS rows get CF4 distances via the `2MASX → PGC` patching step in `buildAllBins`; famous/SDSS rows without PGCs fall through to the cz path.

### Data-refresh re-run orders

All refreshes share one 3-step shape: fetch, build, then `npm run sync-r2-secure` from the **main worktree only** (memory `project_worktree_data_isolation`).

| Data changed           | 1. Fetch                                            | 2. Build                                                  |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| CF4 distances          | `fetch-cf4`                                         | `build-tiers` (`2mrs.bin`, `glade-*.bin`)                 |
| Clusters/superclusters | `fetch-structures` (CDS VizieR, verifies `.sha256`) | `build-structures` (after `build-tiers`) → `structures.*` |
| DESI                   | `fetch-desi` (four DR1 LSS `.fits`)                 | `build-tiers` (`desi-deep.bin`, the CrB deep cone)        |
| Planet textures        | `fetch-textures` (~700 MB; `--dev` = 2k subset)     | `build-textures` → `public/data/images/textures/`         |

Raw files and built artefacts are gitignored; only provenance `README.md` + `.sha256` sidecars are committed. Full-res texture pull/build/sync runs post-merge from the main worktree.

### Deploy workflow (Cloudflare Workers Assets + R2)

Two Cloudflare resources serve skymap, updated independently:

- **The static shell** (HTML, JS, CSS, WGSL, `_headers`, famous WebPs) ships to **Workers Assets** automatically on every push to `main` (Cloudflare's GitHub integration builds and uploads `dist/`). No local CLI step — `npm run deploy` is just `git push origin main`.
- **The `.bin` catalog files** (~280 MB across tiers + filaments) live in **R2** at `skymap-data.rulkens.com`, synced manually via `npm run sync-r2-secure` after a `build-tiers` rerun, **not** on every push. (Large tiers exceed Workers Assets' per-file caps; R2 has no caps, zero egress fees, and decouples catalog refreshes from code deploys.)

A full data-refreshing deploy:

1. `npm run build-tiers` — regenerates all `public/data/*.bin`.
2. `npm run build-filaments` — only if filaments need rebuilding (rare).
3. `npm run sync-r2-secure` — uploads `.bin` + `famous_*.json` + `structures.*`, then purges matching CDN URLs; idempotent full-bucket replacement. The wrapper loads `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID` from the OS secrets store; bare `sync-r2` (no-bash fallback) skips the purge without credentials, leaving stale CDN bytes until TTL expiry.
4. `npm run deploy` — pushes `main`; Cloudflare rebuilds the shell (~30 s).

Code-only change: **step 4 alone is enough**. The `.bin` files stay out of git (`public/data/*.bin` gitignored): they are deterministic build artefacts, and committing them would bloat clones and drift against pipeline settings.

The runtime `cloudLoader` requests `<source>-<tier>.bin` per source; `dataUrl()` prefixes paths with `VITE_DATA_BASE_URL` from the committed `.env.production` (rest of `.env*` gitignored — see the .gitignore docblock). Dev has no `.env.development`: `dataUrl()` falls back to `''` and Vite serves `public/data/*` at `/data/`. A complete R2 sync includes every variant the runtime might request; the `tools/deploy/syncR2.ts` ALLOW filter encodes the full set.

### MCPM Cosmic Web volume

The SDSS DR17 Cosmic Slime VAC cube ships as three tiered SCFDs (`mcpm-{small,medium,large}.scfd`). The Python + pyslime extract happens once per VAC release; contributors curl the pre-extracted `.npy` tiers from R2 and run `npm run build-mcpm` locally. The runtime fetches `mcpm-<tier>.scfd` per the tier dropdown (`state.sources.tier`). See `docs/superpowers/specs/2026-05-11-mcpm-cosmic-web-volume-design.md`.

#### Cache-Control + CORS

- **Cache:** shell via `public/_headers` (JS/CSS/WGSL/WASM `max-age=31536000, immutable`; famous WebPs `max-age=86400`); R2 objects per-object on upload by `syncR2.ts` (`max-age=86400`).
- **CORS:** one R2 rule allows `GET`/`HEAD` from `skymap.rulkens.com`, `skymap.rulkens.workers.dev`, and `localhost:5173`; re-apply with `npm run r2-cors` (`tools/deploy/r2Cors.json`).

## Catalog gotchas

- **2MRS** (Huchra 2012) has only near-IR (J/H/K) photometry — we map J→magG, H→magR, K→magI to fit the SDSS-shaped slot. Local Group galaxies have _negative_ cz; do **not** filter `cz > 0`.
- **GLADE v2.3** has no orientation columns. PGC numbers in col 1-7 are the cross-match key into HyperLEDA.
- **2MRS** has `b/a` but no PA. The 2MASS XSC (the underlying source) has `sup_phi` — cross-match by 2MASS ID.
- **SDSS** CSV column set is whatever was in the SkyServer SQL query — check the CSV header before assuming a column exists.
- **2MRS `objID` in the .bin IS the PGC number** (patched in `buildAllBins` from the GLADE 2MASX→PGC crosswalk); `objID = 0` means no PGC. A synthesized `2MASX J<RA><Dec>` InfoCard name that is absent from `2mrs_table3.dat` is wrong-place coordinates dressed up as an ID.
- **Blueshifted rows without a measured distance** are placed in their TRUE direction at `|cz|/H0` via the curated `data/seeds/local_volume_distances.seed.json` (registry key `localvolume.distances`). Never let negative-z rows mirror to the antipode.

Always consult the upstream ReadMes (alongside each catalog, e.g. `data/raw/2mrs/J_ApJS_199_26_ReadMe`, `data/raw/glade/VII_281_ReadMe`) for byte offsets when extending parsers. Every raw-data path goes through `tools/utils/io/rawDataRegistry.ts` — `rawDataPath('<key>')`, never hard-coded paths.

## Adding a new raw data source

1. **Per-catalog subdir** under `data/raw/<catalog>/` (lowercase, single word). No loose files at `data/raw/` root.
2. **Register every file** in `tools/utils/io/rawDataRegistry.ts`. Keys are dotted-lowercase `<catalog>.<artifact>` (e.g. `'cf4.table2'`); dynamically-named outputs register the directory as `<catalog>.dir` and consumers `join()` the rest. Fill in `source: 'committed' | 'gitignored'`, a one-line `description`, optional `upstream` URL + `fetcher`.
3. **Consume via the registry**: `rawDataPath('<catalog>.<artifact>')`, never `resolve('data/raw/...')`. For a relative path (e.g. `wrangler --file`), use `RAW_DATA['<key>'].path`.
4. **`.gitignore` exception** only for a _non-standard_ committed file. The `/data/**` block already re-includes `data/raw/**/README.md`, `data/raw/**/*.sha256`, `data/raw/fonts/*.ttf`, and `data/seeds/*.json`, so a new catalog's README + checksum sidecar track with a plain `git add`. Add a `!` line (with a comment) only for a file none of those cover.
5. **Provenance README** at `data/raw/<catalog>/README.md`: upstream URL, columns / byte layout, fetch date, checksum.

Reference fetchers: `tools/fetch/fetchHyperLeda.ts`, `tools/fetch/fetch2massXsc.ts` (both registry-migrated).

## Renderer quick map

- **`pointRenderer.ts` + `shaders/points/*.wesl`**: instanced billboards. Vertex stride is 52 bytes / 13 slots (xyz, magnitude, colorIndex, axisRatio + sign-bit fallback flag, baked paCos/paSin, radiusMpc, vMaxWeight, schechterRatio, angularDensityWeight, baked absMag). Galaxy-static values (PA rotation, absolute magnitude) are baked at upload, not recomputed per vertex. Identity is composed on the GPU from a per-draw `SourceUniforms.sourceCode` + `@builtin(instance_index)`, NOT baked per-vertex.
- **`pickRenderer.ts`**: r32uint pick texture. The fragment writes `(sourceCode << 27) | (localIdx + PICK_SENTINEL_OFFSET)`; see `src/data/selectionEncoding.ts` for the encoding (5 bits source, 27 bits localIdx, code 31 reserved as the all-ones sentinel). Source codes are append-only (the rule lives in `sources.ts`'s docstring) — same hygiene as enum values that get persisted to .bin, applied to POI-only codes too. Read the texture with `copyTextureToBuffer` for hover/click.
- **`textureAtlas.ts` + `texturedDiskRenderer.ts` + `shaders/texturedDisks/*.wesl`**: 2048×2048 atlas of 128×128 slots for galaxy thumbnails. LRU eviction.
- **`engine/subsystems/galaxyAtlasSubsystem.ts`**: the shared atlas + fetch infrastructure — LRU clock, priority-queued concurrency-limited bitmap fetcher, and the `bitmapReady`/`bitmapFailed` memoisation pair. Enqueue is idempotent (don't re-add in-flight keys — see the module header for the bug history). Thumbnail URLs are built by `src/utils/math/{sdss,dss}ThumbnailUrl.ts`: SDSS DR18 ImgCutout (CORS-safe) for SDSS galaxies; CDS hips2fits (CORS-safe DSS proxy) for 2MRS/GLADE.
- **`engine.ts`**: per-frame loop. Per-galaxy `apparentSizePx` gates thumbnail enqueue — but the inner loop hoists `Math.tan` and pre-computes `maxCamDistForVisibility` to avoid 2.5M trig calls per frame.
- **`renderScheduler.ts` + `engine.ts` frame tail**: render-on-demand. `requestRender()` from event handlers wakes the loop; the frame body re-schedules only while `autoRotate || currentTween || hasAnyAxis || queue.inFlightCount > 0 || recent-fade` is true.

## When the user asks you to…

- **"add a feature"** → check `docs/BACKLOG.md` and `docs/superpowers/plans/` for an existing plan or captured issue. If it's substantial, run the `refactor-ground` skill once the shape of the ask is clear (before the spec is written — see the Refactor-the-ground convention), then write a new plan via the `writing-plans` skill rather than coding inline. If the work matches a backlog item, **remove that item (index line + `docs/backlog/` detail file) in the same change** that starts it — see the Backlog-hygiene convention.
- **"fix this bug"** → check tests first; the project favours reproducing bugs as failing tests, then fixing.
- **"why is this slow?"** → **measure first**: `npm run perf` (see `tools/perf/README.md`) gives per-pass GPU medians, per-layer attribution with the pass-overhead floor separated out, and a `--sweep` fragment-vs-vertex-bound classifier — get a number before theorizing. CPU-side mental model: per-frame work scales with on-screen galaxies (~2.5M total); inner-loop trig and `Math.sqrt` are real costs. Hoist constants, gate with squared distances, avoid per-galaxy `Math.tan`.
- **"refactor X"** → keep the services/ layout. Cross-cutting helpers go in `utils/`; rendering subsystems in `services/gpu/`. Tests mirror the src tree. Any file move/rename goes through `npm run move-files` (next entry), not `git mv` + hand-edited imports.
- **"move/rename/relocate a file"** (incl. folder reorgs) → `npm run move-files -- <from> <to>`, or `-- --manifest <moves.json>` for a batch. ts-morph rewrites every relative import project-wide and drags the `tests/` mirror along; run `--dry` first. Hand-editing import paths after a move is always the wrong plan. Not covered: `.wesl` `package::` imports + string-literal paths — grep for the old path afterwards. `npm run refactor -- move <from> <to>` is the canonical spelling. Details in `.claude/skills/refactor/SKILL.md`.
- **"why does the renderer use index Y?"** → check `pointRenderer.ts` SLOTS_PER_POINT and the matching attribute layout in the shader. They must agree byte-for-byte.

## Things that have bitten us before

- **WebGPU `queue.writeBuffer` race**: interleaving `writeBuffer` with `submit` in the same frame doesn't preserve order — bake per-instance data into the vertex buffer instead of a uniform you mutate per draw.
- **Selection halo on wrong galaxy**: same root cause — selection index must come from a per-vertex attribute, not a uniform updated mid-frame.
- **CORS on DSS thumbnails**: ESO's DSS endpoint blocks browsers. Use CDS hips2fits (`https://alasky.cds.unistra.fr/hips-image-services/hips2fits`).
- **Retry storms on failed thumbnails**: the engine has BOTH a `bitmapReady` and `bitmapFailed` Set — the per-frame gate must check both. The image queue's `enqueue` is idempotent for in-flight keys.
- **`<details>` element collapsing on hover**: keep the InfoCard's outer wrapper element identical across renders so React doesn't remount and reset the `open` state.
- **iOS WebGPU is stricter than Chrome's Tint — a bad shader freezes the _whole_ canvas**: `texture_1d` sampling (`textureSampleLevel` has no 1D overload) is one example WebKit rejects but Chrome accepts. Because all HDR passes share one command encoder, an invalid pipeline makes `encoder.finish()` produce an invalid command buffer and `queue.submit()` silently drops the _entire_ frame — the loop ticks and the camera moves, but nothing ever presents. Symptom: navigation/toggles do nothing on iOS while the React UI updates fine, no thrown errors. Diagnosis: `createShaderModuleWithDevLog` (in `shaderCompileLogger.ts`) prints the real `getCompilationInfo()` error + offending line. Store 1D LUTs as N×1 `texture_2d`.

## Memory

The agent's auto-memory at `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/` carries cross-session context. Read `MEMORY.md` for the index; update memories whenever project state shifts (plan task completed, convention adopted, catalog re-fetched).
