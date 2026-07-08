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
  raw/                Catalog source files, one subdir per source: 2mrs/, glade/,
                      hyperleda/, sdss/, cf4/, mcpm/, milliquas/, filaments/, famous/,
                      fonts/, mcxc/, mscc/. VizieR ReadMes live next to the file they describe
                      (read for byte layouts!). Path lookups go through
                      `tools/utils/io/rawDataRegistry.ts`.
docs/BACKLOG.md           Ground-truth list of what's next — pickup-able plans,
                      specs awaiting plans, deferred items, surfaced issues
docs/superpowers/plans/   Active implementation plans (TDD task lists); shipped
                      plans move to plans/completed/ via the /feature-done audit
docs/superpowers/specs/   Design specs; shipped specs move to specs/completed/
                      alongside their plan when the feature ships
tests/                Vitest suite — mirrors src/ tree
```

## Project conventions (these override defaults)

- **Didactic comments**: this project uses learning-oriented comments. Explain _why_ and _what the alternative was_, not just _what_. Many files have multi-paragraph module headers — match that style. (Overrides the default no-comments rule.)
- **`type` aliases, never `interface`**: `export type X = { ... }` for all TS shapes.
- **No barrel exports for components**: import React components directly from their `.tsx`. No `index.ts` re-export files in component folders.
- **One symbol per file in `utils/` and `@types/`**: every file in `src/utils/` (and `tools/utils/`) exports exactly **one function**; every file in `src/@types/` exports exactly **one type**. Filename = the exported symbol's name (kebab/camel as the symbol dictates). No multi-export helper grab-bags — if a "data" file grows a generic pure helper, extract it to its own `utils/<area>/<fn>.ts` (math/format/color/random/gpu/…) with a focused test. Deep relative imports, no barrels.
- **Dev server stays running**: `npm run dev` is left running in the background for HMR visual checks. Don't kill it. To verify a UI change, ask the user to look (or describe what they should see).
- **TDD via plans**: substantial features get a plan in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` with bite-sized TDD tasks. Plans are executed via the `subagent-driven-development` workflow (fresh subagent per task + spec + quality reviews). Plans follow [`docs/superpowers/conventions/plan-style.md`](docs/superpowers/conventions/plan-style.md) — **contract code yes, implementation code no** (overrides the upstream `writing-plans` skill's "complete code in every step" default). When a plan ships, run the `/feature-done` audit: it gates on the DoD then relocates the plan + its spec to `plans/completed/` + `specs/completed/`.
- **Plans coexist**: multiple in-flight plans is normal. Check the file list before starting new work to avoid stomping on something else.
- **Backlog hygiene**: [`docs/BACKLOG.md`](docs/BACKLOG.md) lists only _unstarted_ work, grouped by subsystem area with a readiness tag; design-bearing items have a `docs/backlog/YYYY-MM-DD-<slug>.md` detail file linked from the index. **Keep the index line very short** — title + readiness tag + one terse clause + the `→ [details]` link. Anything longer (file lists, evidence, approach, options) goes in the detail md, NEVER inline in `BACKLOG.md`; the index is a scannable list, not a write-up. **Picking up an item removes it in the same change** — whether you implement it directly or write a spec/plan, delete its index line **and** its detail file in that commit/branch (the detail file seeds the spec; the spec/plan is then the source of truth). **Never strike through a done item** — delete it; the completion record is the git log + `*/completed/`. `/feature-done` sweeps the backlog when a plan ships; audit the whole file against the git log periodically to catch stragglers.
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
```

Currently 590+ tests passing across 76 files. Keep it green.

### Tmux workflow helpers

Two bash helpers live in `tools/dev/` for managing parallel Claude sessions across worktrees:

- **`tools/dev/skymap-tmux.sh`** — starts (or reattaches) a `skymap` tmux session with one window per existing `.claude/worktrees/*` plus a `main` and `shell` window. Does not auto-start `claude` — pick per window. Re-run to reattach.
- **`tools/dev/skymap-wt-clean.sh`** — interactive cleanup of worktrees whose branches have merged into `origin/main`. Skips dirty worktrees. Closing a tmux window does **not** remove its worktree; this is the hygiene pass.

The intended workflow is one tmux window per worktree, each rooted at the worktree path so the shell and any `claude` started inside it share CWD — no `EnterWorktree` call needed. Use `EnterWorktree`/`ExitWorktree` only in single-window flows where you want the harness to handle creation and cleanup.

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

Binary format is in `src/data/galaxyCatalogFormat.ts` — currently v6, 64 bytes/galaxy. Bumping the version means regenerating bins via `npm run build-all`. The format header stores `magic + version + count`, so old bins fail loudly with a clear regenerate message. (The 2026-05-17 PointCloud → GalaxyCatalog code rename did NOT bump the on-disk format; v6 added `spectroscopicZ` at byte 54 for the local-volume distance override.)

### Local-volume distance override

For galaxies inside `CUTOFF_MPC = 30` the build pipeline replaces the cz-derived position with a Cosmicflows-4 (or HyperLEDA `mod0`) measured distance. The catalogued spectroscopic z is stored separately on the .bin (v6 format, byte offset 54) so the InfoCard shows the published value, not the value implied by `|position|`. See `docs/superpowers/specs/2026-05-27-local-volume-distances.md`.

Coverage: ~2,030 of CF4's 2,159 local-volume PGCs are reachable via the direct GLADE-by-PGC path; 2MRS rows pick up CF4 distances via the existing `2MASX → PGC` patching step in `buildAllBins`. Famous-galaxy and SDSS rows without PGCs fall through to the cz path.

Re-run order when CF4 raw data changes:

1. `npm run fetch-cf4` — refreshes `data/raw/cf4/table2.dat`.
2. `npm run build-tiers` — re-bakes `2mrs.bin` and `glade-*.bin` with the new distances.
3. `npm run sync-r2-secure` — from the main worktree only (see project memory `project_worktree_data_isolation`).

Re-run order when cluster/supercluster data changes:

1. `npm run fetch-structures` — downloads `data/raw/{mcxc,mscc}/{*.dat,ReadMe}` from CDS VizieR and verifies against the committed `.sha256` sidecars. Same pattern as `npm run fetch-cf4`.
2. `npm run build-structures` — parses the raw tables + the featured seed, emits `public/data/structures.ccat` + `public/data/structures_meta.json`. Run after `npm run build-tiers`.
3. `npm run sync-r2-secure` — uploads the new artefacts to R2.

The `.ccat` + `structures_meta.json` artefacts are gitignored (build outputs, like the `.bin` files). The raw `.dat`/`ReadMe` files are also gitignored; only the provenance `README.md` + `.dat.sha256` sidecars are committed.

Re-run order when DESI raw data changes:

1. `npm run fetch-desi` — downloads the four DESI DR1 LSS tracer `.fits` files into `data/raw/desi/` and writes the committed `desi_dr1_lss.sha256` sidecar. Same pattern as `npm run fetch-cf4`.
2. `npm run build-tiers` — re-bakes `desi-deep.bin` (the CrB deep-cone patch) alongside the other catalog bins.
3. `npm run sync-r2-secure` — from the main worktree only (see project memory `project_worktree_data_isolation`).

### Deploy workflow (Cloudflare Workers Assets + R2)

Two Cloudflare resources serve skymap, and they're updated independently:

- **The static shell** (HTML, JS, CSS, WGSL shaders, `_headers`, famous-galaxy WebPs) ships to **Cloudflare Workers Assets** automatically on every push to `main`. Cloudflare's dashboard-managed GitHub integration runs `npm run build` and uploads `dist/`. There is no local CLI step for the shell deploy — `npm run deploy` is just `git push origin main` with a hint of where to watch the build progress.

- **The `.bin` catalog files** (~280 MB across all tiers + filaments) live in **Cloudflare R2** at `skymap-data.rulkens.com`, because they exceed Workers Assets' per-file size limit and because R2 has zero egress costs. They're synced manually via `npm run sync-r2` after a `build-tiers` rerun, **not** on every push.

A full data-refreshing deploy is therefore:

1. `npm run build-tiers` — regenerates all `public/data/*.bin`.
2. `npm run build-filaments` (only if filaments need rebuilding — rare).
3. `npm run sync-r2-secure` — uploads regenerated `.bin` files (and `famous_*.json` sidecars, plus the cluster `structures.ccat` + `structures_meta.json`) to R2, then purges the matching URLs from the Cloudflare CDN edge cache. Idempotent; full bucket replacement on every run. The `-secure` wrapper loads `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID` from the OS secrets store (macOS Keychain, Linux libsecret) so the credentials never live in a dotfile; the bare `npm run sync-r2` is a fallback for environments without bash where the env vars are already injected (CI, Windows-without-WSL). Without the credentials the purge step is skipped and the CDN keeps serving stale bytes until the per-object TTL expires — use the secure wrapper.
4. `npm run deploy` — pushes `main`. The Cloudflare GitHub integration takes over and rebuilds the shell.

If you only changed code and not catalog bytes, **step 4 alone is enough**. The most common loop is "edit, push, watch the Workers build", which finishes in ~30 s.

The `.bin` files are intentionally **not** in git (`public/data/*.bin` is gitignored). They are pure build artefacts: deterministic outputs of `tools/catalog/buildAllBins.ts` against the raw catalog files in `data/raw/`. Checking them in would inflate every clone by ~150 MB for no informational gain — the same bytes can always be rebuilt from source on demand. Keeping them out also avoids accidental drift between `tools/catalog/buildAllBins.ts` settings (tier targets, abs-mag thresholds) and a stale committed binary; the R2 sync ships a fresh build on demand, so what's hosted is always in sync with the current pipeline code.

The runtime `cloudLoader` requests `<source>-<tier>.bin` per source as the user switches tiers; the `dataUrl()` helper prefixes each path with `VITE_DATA_BASE_URL`, which is set in the committed `.env.production` (the rest of `.env*` is gitignored — see the .gitignore docblock for the rationale). Vite inlines that value into the production bundle at build time. Dev runs with no `.env.development` present, so `dataUrl()` falls back to the empty string and Vite serves `public/data/*` at the relative `/data/` path. A complete R2 sync must include every variant the runtime might request: `sdss-medium.bin`, `sdss-large.bin`, `glade-small.bin`, `glade-medium.bin`, `glade-large.bin`, plus the tier-agnostic `2mrs.bin`, `famous.bin`, `desi-deep.bin`, `filaments.bin`, `structures.ccat`, and `structures_meta.json`. The `tools/deploy/syncR2.ts` ALLOW filter encodes that set.

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

ReadMes for the upstream catalogs live alongside each catalog (`data/raw/2mrs/J_ApJS_199_26_ReadMe`, `data/raw/glade/VII_281_ReadMe`). Always consult them for byte offsets when extending parsers. The canonical source-of-truth for every raw-data path is `tools/utils/io/rawDataRegistry.ts` — consumers call `rawDataPath('<key>')` rather than hard-coding paths.

## Adding a new raw data source

When a new catalog or dataset gets added to the build pipeline, follow this checklist so it slots into the existing conventions instead of inventing a parallel path-handling style.

1. **Pick a per-catalog subdir** under `data/raw/<catalog>/` (lowercase, single word — e.g. `data/raw/cf4/`, `data/raw/hyperleda/`). Every loose file at `data/raw/` root is wrong — they all live in subdirs now.
2. **Register every file** in `tools/utils/io/rawDataRegistry.ts`. Keys are dotted-lowercase `<catalog>.<artifact>` (e.g. `'cf4.table2'`, `'cf4.readme'`, `'cf4.sha256'`). For dynamically-named outputs (chunks, tier variants), register the directory as `<catalog>.dir` and let consumers `join(rawDataPath(...), <dynamic>)`. Fill in `source: 'committed' | 'gitignored'`, a one-line `description`, and optional `upstream` URL + `fetcher` script.
3. **Consume via the registry.** Fetchers / parsers / build scripts call `rawDataPath('<catalog>.<artifact>')` — never `resolve('data/raw/<catalog>/<file>')`. If the consumer needs the path relative (e.g. for `wrangler --file`), use `RAW_DATA['<key>'].path`.
4. **`.gitignore` exception** only for a *non-standard* committed file. The `/data/**` block already re-includes the common committed artefacts — `data/raw/**/README.md`, `data/raw/**/*.sha256`, `data/raw/fonts/*.ttf`, and `data/seeds/*.json` — so a new catalog's README and checksum sidecar need **no** gitignore edit and track with a plain `git add` (the functional glob pattern makes the negations work, so no `git add -f`). Add a new `!` line only for a committed file that none of those globs cover, and explain it in a comment.
5. **Provenance README** at `data/raw/<catalog>/README.md` documenting the upstream URL, the columns / byte layout, the fetch date, and the checksum (if any). Already covered by the `!/data/raw/**/README.md` glob — just `git add` it.

A new fetcher script that mirrors `tools/fetch/fetchHyperLeda.ts` or `tools/fetch/fetch2massXsc.ts` is the easiest reference for "where does the new file get written, and how does the consumer find it." Both of those have already been migrated to the registry.

## Renderer quick map

- **`pointRenderer.ts` + `shaders/points/*.wesl`**: instanced billboards. Vertex stride is 52 bytes / 13 slots (xyz, magnitude, colorIndex, axisRatio + sign-bit fallback flag, baked paCos/paSin, radiusMpc, vMaxWeight, schechterRatio, angularDensityWeight, baked absMag). Galaxy-static values (PA rotation, absolute magnitude) are baked at upload, not recomputed per vertex. Identity is composed on the GPU from a per-draw `SourceUniforms.sourceCode` + `@builtin(instance_index)`, NOT baked per-vertex.
- **`pickRenderer.ts`**: r32uint pick texture. The fragment writes `(sourceCode << 27) | (localIdx + PICK_SENTINEL_OFFSET)`; see `src/data/selectionEncoding.ts` for the encoding (5 bits source, 27 bits localIdx, code 31 reserved as the all-ones sentinel). Source codes are append-only (the rule lives in `sources.ts`'s docstring) — same hygiene as enum values that get persisted to .bin, applied to POI-only codes too. Read the texture with `copyTextureToBuffer` for hover/click.
- **`textureAtlas.ts` + `quadRenderer.ts` + `shaders/quads.wgsl`**: 2048×2048 atlas of 128×128 slots for galaxy thumbnails. LRU eviction.
- **`galaxyImageQueue.ts`**: priority queue + concurrency limiter (max 4) for thumbnail fetches. Idempotent enqueue (don't re-add in-flight keys — see the long comment for the bug history).
- **`galaxyImageFetcher.ts`**: SDSS DR18 ImgCutout (CORS-safe) for SDSS galaxies; CDS hips2fits (CORS-safe DSS proxy) for 2MRS/GLADE.
- **`engine.ts`**: per-frame loop. Per-galaxy `apparentSizePx` gates thumbnail enqueue — but the inner loop hoists `Math.tan` and pre-computes `maxCamDistForVisibility` to avoid 2.5M trig calls per frame.
- **`renderScheduler.ts` + `engine.ts` frame tail**: render-on-demand. `requestRender()` from event handlers wakes the loop; the frame body re-schedules only while `autoRotate || currentTween || hasAnyAxis || queue.inFlightCount > 0 || recent-fade` is true.

## When the user asks you to…

- **"add a feature"** → check `docs/BACKLOG.md` and `docs/superpowers/plans/` for an existing plan or captured issue. If it's substantial, write a new plan via the `writing-plans` skill rather than coding inline. If the work matches a backlog item, **remove that item (index line + `docs/backlog/` detail file) in the same change** that starts it — see the Backlog-hygiene convention.
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
- **iOS WebGPU is stricter than Chrome's Tint — a bad shader freezes the _whole_ canvas**: `texture_1d` sampling (`textureSampleLevel` has no 1D overload) is one example WebKit rejects but Chrome accepts. Because all HDR passes share one command encoder, an invalid pipeline makes `encoder.finish()` produce an invalid command buffer and `queue.submit()` silently drops the _entire_ frame — the loop ticks and the camera moves, but nothing ever presents. Symptom: navigation/toggles do nothing on iOS while the React UI updates fine, no thrown errors. Diagnosis: `createShaderModuleWithDevLog` (in `shaderCompileLogger.ts`) prints the real `getCompilationInfo()` error + offending line. Store 1D LUTs as N×1 `texture_2d`.

## Memory

The agent's auto-memory at `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/` carries cross-session context (project state, user preferences, plan progress). Read `MEMORY.md` for the index. Update memories when project state shifts (plan task completed, new convention adopted, catalog re-fetched, etc.).
