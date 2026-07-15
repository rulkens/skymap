# Gaia Star Bin — Plan 03: Runtime (registry, loader, renderer)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> to execute this plan (fresh subagent per task + spec review + quality review). Each
> task is TDD: failing test first, minimal green, commit. Dispatch implementers with
> `run_in_background: true`; the **main thread** runs `npm test` / `npm run typecheck`
> and makes the commits (background subagents cannot run npm).
>
> **Plan style (OVERRIDES upstream `writing-plans`):**
> [`docs/superpowers/conventions/plan-style.md`](../conventions/plan-style.md) —
> **contract code yes, implementation code NO.** Type signatures, byte/uniform
> layouts, and test names ARE contract (reproduced here); function bodies are not —
> cite `path:line` and let the implementer write the body from the test.
>
> **Testing discipline:** [`docs/superpowers/conventions/testing.md`](../conventions/testing.md).
> Round-trip + hand-computed + independent-property assertions only. No GPU-pipeline
> unit tests (WebGPU is unavailable in vitest — the CPU walker/cut helpers carry the
> coverage; the renderer/shader is typecheck-gated + visually verified). No test
> needs the real ~2 GB Gaia fetch or a real `.bin` — every code task is exercised with
> a small synthetic `StarCatalog` built in-test via `encodeStarCatalog` (plan 02's
> tests show the pattern).

**Spec:** [`docs/superpowers/specs/2026-07-13-gaia-star-bin-design.md`](../specs/2026-07-13-gaia-star-bin-design.md)
— this plan owns **§6 (Registry integration)**, **§7 (Renderer)**, and the in-scope
**§8 plan-time items** (BP−RP colour ramp, slab/pass placement, Sun exclusion). §1–5
are shipped by plans 01/02; do **not** re-plan them. The on-disk **SKST** format, its
decoder, and the build pipeline exist and are LOCKED — this plan only *consumes* them.

## Goal

Wire the tiered, cell-quantized `stars-{small,medium,large}.bin` (SKST) into the
running app: a `starCatalog` `SOURCE_REGISTRY` row, a tier-aware fetch/slot that
inflates + uploads the catalog, and a dedicated vertex-pulling star renderer that
draws the octree flux mip as `draw(3)` billboards in the near-field HDR accumulation,
crossfading into the procedural Milky-Way cloud. Concretely:

```
public/data/stars-<tier>.bin  ──fetch──▶  decodeStarCatalog  ──▶  StarCatalog
                                                                       │  (slot commit)
                                                                       ▼
                                     starCatalogRenderer.upload(source, catalog)
                                                                       │
   per frame:  walkStarOctreeCut(catalog, camPosPc, budget) ──▶ StarNodeDraw[]
               starNodeOriginRelCamMpc (f64 pc→Mpc seam)     ──▶ per-node origins
                                                                       ▼
                     starCatalogLayer (NEAR0 / hdr / additive) ──▶ draw(3, recordCount)
```

**Non-goals (do NOT touch here):** the SKST byte format / `encodeStarCatalog` /
`decodeStarCatalog` / octree build (plan 02), the fetch pipeline (`fetch-gaia`,
plan 01), the real ~2 GB Gaia fetch + real `build-stars` run (user-gated, still
pending — see Real-data gating below), galaxy-bin v7, the a+b neighbourhood bin,
foreground-body picking (the Gaia bin is **not pickable**, spec §6), and the deferred
crossfade density calibration
([`docs/backlog/2026-07-13-star-bin-crossfade-density-calibration.md`](../../backlog/2026-07-13-star-bin-crossfade-density-calibration.md) —
referenced, never done here).

## Architecture

Three seams, mirroring the existing **galaxy-catalog source-type family** + the
tiered-asset precedent (Amendment 2026-07-15 — was the singleton-overlay convention):

- **Registry + settings — the galaxy-catalog family, mirrored.** The `starCatalog`
  variant is a `SourceEntry` arm (`StarCatalogSourceEntry`, Task 2) modelled on
  `GalaxyCatalogSourceEntry`: tier-aware asset stem + look/crossfade defaults carried
  in-row. A `StarCatalogId` union (`Extract<AnyEntry, { type: 'starCatalog' }>['id']`)
  + its runtime iterable `STAR_CATALOG_IDS` mirror `GalaxyCatalogId` /
  `GALAXY_CATALOG_IDS` (`src/@types/data/galaxyCatalog/GalaxyCatalogId.d.ts`,
  `src/data/galaxyCatalog/galaxyCatalogIds.ts`) exactly, so a new star catalog widens
  both automatically. State is the **fourth** source-type cluster:
  `settings.starCatalogs: { enabled; items: Record<StarCatalogId, StarCatalogItemSettings> }`,
  sharing the `items[id].enabled` accessor with `galaxyCatalogs` / `structures` /
  `volumes` (the three docblocks that say "all three source-type clusters share one
  shape" update to "four"). Demand reads `settings.starCatalogs.enabled &&
  settings.starCatalogs.items[id].enabled`; load status is the per-source asset slot's
  own `ready` state. Not in `GALAXY_CATALOG_SOURCES`, never in the visibility bitmask,
  no pick code. (`Source.GaiaStars` is the sole `starCatalog` row today; famous stars
  become a second one in a future plan — Decision A.)

- **Loader — one fetcher + one slot per `starCatalog` source, keyed by `source`.** A
  `starCatalogFetcher` builds `<binBaseName>-<tier>.bin` (or `<binBaseName>.bin` when
  `tiered: false`, the famous-galaxy branch) from `SOURCE_REGISTRY[req.source]` (a
  `starCatalog`-row-validated lookup) via `dataUrl` + `decodeStarCatalog` — so ONE
  fetcher serves every star catalog, parameterized by `req.source`. Its slot factory
  `createStarCatalogSlot(source, …)` commits to the renderer as `upload(source, catalog)`.
  Wiring mirrors the galaxy `pointRow` family (`assetWiring.ts:100-119`): one row per
  `starCatalog` source, `key: source`, `req: (tier) => ({ source, tier })`, `demand:
  (ctx) => ctx.settings.starCatalogs.enabled && ctx.settings.starCatalogs.items[id]?.enabled
  === true`. Tier reload is FREE: `reevaluateDemand` re-runs the whole table on a tier
  flip and re-fetches with the new `req(source, tier)`. The existing tier-narrowing
  `tierFilenameForSource` stays galaxyCatalog-only; the star fetcher builds its own name
  from the row's `binBaseName`, like `mcpmFetcher`'s local `FILENAME` record.

- **Renderer — per-source buffers keyed by source code (the `catalogStore` precedent).**
  A dedicated family folder `src/services/gpu/renderers/starCatalog/`. `upload(source,
  catalog)` keeps one records storage buffer + CPU-side nodes per source code (mirroring
  `galaxyCatalog/catalogStore.ts`'s per-`GalaxyCatalogId` map), uploaded once on commit;
  the shader vertex-pulls a record by `firstRecord + instance_index`, unpacks the u32
  halves (mirroring `unpackStarRecord`, `starCatalogFormat.ts:203-219`), and expands it
  into a `draw(3)` circumscribing-triangle billboard (the #428 trick — reuse the *idea*,
  not the code; see `galaxyCatalog/pointRenderer.ts` module header + `starPointRenderer.ts`
  for the thin-pipeline precedent). Per frame the layer iterates **every loaded catalog**,
  walks each octree nearest-first within that source's drawn-point budget, and hands the
  renderer a small per-source list of nodes to draw with their **camera-relative cell
  origins** — computed CPU-side in f64 (the precision story), so no global f32 position
  ever exists.

### Ground preparation

**Done — PR #436 (renderers folder reorg, merged `9676fbfc`).** This plan is written
against the post-reorg tree: 11 family folders under `src/services/gpu/renderers/` +
shared primitives in `src/services/gpu/lib/` (`blendStates.ts`, `cameraUniforms.ts`,
`dummyFade.ts`, `unitQuad.ts`). The new `starCatalog/` family folder slots in beside
`galaxyCatalog/`, `milkyWay/`, `bodies/` with no further prep refactor needed.

### Amendment (2026-07-15)

Two user decisions mid-execution (Tasks 1–4 landed) supersede this plan's
singleton-overlay design for the star catalog. The GPU renderer / walker /
origin-seam / WESL shaders are unchanged in substance; the **registry + settings +
loader** seams are reshaped to mirror the galaxy-catalog source-type family, and one
source rename lands.

**Decision A — famous stars become a second star catalog (FUTURE plan).** Famous stars
will graduate from the scene-bodies overlay into their own star catalog (same SKST bin
shape + a labels sidecar, exactly like famous galaxies) in a follow-up plan — **NOT
here**. This plan carries the inert `labelEnabled` axis so that future catalog slots in
without a settings reshape (`gaia` carries it inertly; famous stars will read it).

**Decision B — star settings + data entries MIRROR the galaxy-catalog family, not the
singleton-overlay convention.** More star catalogs are coming, so the star cluster
becomes the **fourth** source-type cluster (`galaxyCatalogs` / `structures` / `volumes`
/ `starCatalogs`), each sharing the per-item `items[id].enabled` shape. This supersedes
spec §6's "singleton-overlay state" line and the singleton design of the original
Tasks 4 and 6.

**Source rename (user naming correction).** `Source.StarCatalog` → `Source.GaiaStars`
(code stays 24). Codes/ids name *catalogs*; `GaiaStars` — not bare `Gaia` — because
Gaia-the-mission also ships galaxy/quasar content, so a future Gaia-derived galaxy
source must not collide with this code's name. The TYPE `StarCatalogSourceEntry` keeps
its name — types name *kinds* (mirrors `GalaxyCatalogSourceEntry` ↔ `Source.SDSS` /
`Source.Glade`). Neighbouring row ids are camelCase (`famousStar`, `famousGalaxy`,
`desiDeep`), so `id: 'gaiaStars'`, `label: 'Gaia Stars'`.

**Landed state (do NOT re-plan; recorded here):**

- **Task 1** — `173f5064` — `Star` → `FamousStar` rename.
- **Task 2** — `c89ce4fd` — `StarCatalogSourceEntry` type + `SourceEntry` union arm.
- **Task 3** — `4955180e` — `Source.StarCatalog = 24` + `STAR_CATALOG_ENTRY` row
  (renamed to `GaiaStars` / `GAIA_STARS_ENTRY` / `id: 'gaiaStars'` by the new Task 5).
- **Task 4** — `e59ccecf` — landed as the singleton `settings.starCatalog: { enabled }`
  cluster (reshaped into `settings.starCatalogs` by the new Task 5).
- The **fetcher** (original Task 5, single-catalog) is implemented in the working tree,
  **uncommitted**, and is reworked in place by the new Task 6.

**Renumbering.** Tasks 1–4 unchanged (checked, landed). New **Task 5** = the mirror
reshape (rename + `StarCatalogId` / `STAR_CATALOG_IDS` + `StarCatalogItemSettings` +
`settings.starCatalogs` cluster). Original Tasks 5–12 shift to **6–13**; their substance
is unchanged except for the per-source dimension now threaded through the fetcher `req`,
the slot/wiring, the renderer `upload`/`draw`, and the layer.

### Plan-time decisions (spec §8 delegated these to the plan — DECIDED here)

1. **BP−RP → colour = a dedicated stellar ramp in WESL, NOT the galaxy `colourIndex`
   ramp.** The galaxy `colorIndex.wesl` ramp maps a *galaxy* band difference onto a
   0..2 scale — a different physical quantity (spec §8). Stellar BP−RP gets its own
   ramp: a small anchor table (BP−RP → linear RGB) interpolated in the fragment shader,
   anchored to the existing authored spectral-class palette
   (`src/data/bodies/palette.ts:41-52`) so a Gaia bulk star and a scene FamousStar read
   as the same species — O/B blue-white `[0.6,0.7,1.0]`, A/F white `[1.0,1.0,0.98]`,
   G yellow-white `[1.0,0.97,0.85]`, K orange `[1.0,0.85,0.65]`, M red `[1.0,0.6,0.4]`.
   The ramp is a WESL function keyed on the record's dequantized BP−RP (from the 6-bit
   `colorIdx` via the frozen `STAR_COLORIDX_MIN/MAX` window). *Rationale:* an
   approximate blackbody ramp anchored to the palette keeps the two star populations
   colour-consistent and keeps stellar colour a shader-side function, matching the
   existing precedent (`palette.ts:47` — "the colour ramp lives only in WGSL").

2. **Slab / pass placement = NEAR0, `target: 'hdr'`, `blend: 'additive'`, riding the
   EXISTING `(hdr, NEAR0)` render step.** COSMO's fixed 10 kpc near plane
   (`slabs.ts:56`, `COSMO_NEAR_MPC = 0.01`) would clip the ≤ few-kpc Gaia bubble — the
   exact reason `starPointsLayer` already projects the parsec-scale scene stars through
   NEAR0 (`starPointsLayer.ts:19-24`). The star catalog joins that group (star-points +
   orbit-trails), so **no frame-program change** — `passes/index.ts:177-185` already
   drives it. The layer builds a camera-relative f64 frame like `starPointsLayer`:
   `narrowMat4(rebaseViewProj(view.slab.vp, view.camPos))` for the vp
   (`starPointsLayer.ts:146`) and per-node `originRelCamMpc = nodeOriginPc·PC_TO_MPC −
   camPosMpc` in f64. *Rationale + flagged interaction:* NEAR0's far plane tracks
   `cam.distance` via `foregroundFrustum`; the bubble reach (few kpc) may need that far
   floor extended — the zoom-to-earth NEAR0 far-plane work in flight (spec §8). The
   layer does **not** depend on it: Task 13's bring-up confirms no far-end clipping and
   extends the (named) far floor if needed. Consistent with, and not blocked by, the
   FamousStar-overlay own-slab split
   ([`docs/backlog/2026-07-13-star-field-own-slab.md`](../../backlog/2026-07-13-star-field-own-slab.md)) —
   that item splits the FamousStar path, not the Gaia bin joining NEAR0.

3. **Sun exclusion = confirm-by-test the renderer is robust to a zero camera-relative
   record; ownership stays FamousStar.** The build cannot emit a Sun record (no Gaia
   Sun row; `FAMOUS_STAR_GAIA_IDS['sun'] === null`, plan 02 Task 7; GCNS distances > 0;
   Hipparcos non-positive-parallax dropped) — so the bin never carries a zero-distance
   star, and the Sun stays the scene-bodies FamousStar. Plan 03's confirm-by-test lives
   at the renderer boundary (build-side selection is plan 02's): the CPU cut/origin
   helpers, given a synthetic record coincident with the camera (worst case
   `originRelCamMpc = [0,0,0]`), produce finite output (no divide-by-zero / NaN) — a
   robustness guard, not a build assertion. Documented in the layer docblock.

## Tech stack

TS + React + Vitest for the CPU seams; raw WebGPU + WESL (`?static` linker) for the
renderer. No new deps. Reuses `src/services/gpu/lib/` primitives (`cameraUniforms`,
`blendStates.ADDITIVE_BLEND`), `rebaseViewProj` + `narrowMat4`, and the `fadeBand`
crossfade primitive (`src/utils/math/fadeBand.ts`).

## Global constraints (house rules — these override defaults)

- **`type` aliases, never `interface`.** One `type` per file in `src/@types/`; one
  exported function per file in `src/utils/`. Deep relative imports, no barrels.
  `src/data/` + renderer modules may carry several related exports (precedent:
  `pointRenderer.ts`, `mcpm.ts`).
- **`Vec3`/`Vec2` aliases**, never raw number tuples.
- **Append-only `Source` codes.** `Source.GaiaStars = 24` (renamed from
  `Source.StarCatalog`, Task 5 — VALUE stays 24) is appended after `Earth = 23`; never
  renumber. The FamousStar rename keeps numeric value `21`.
- **Any file move/rename uses `npm run move-files -- <from> <to>`** (ts-morph rewrites
  imports; never `git mv` + hand-edited imports). Follow with a grep-for-stragglers
  pass — `.wesl` `package::` paths + string literals are NOT covered by move-files.
- **Source-type-cluster convention** (Amendment 2026-07-15 — mirror the galaxy-catalog
  family, NOT the singleton-overlay convention): state in `settings.starCatalogs`
  (`enabled` master gate + `items[id]` per source), demand reads `enabled &&
  items[id].enabled`, no data-layer store, no bitmask membership.
- **Rendering rule (house):** opacity 0 / disabled ⇒ NO render work — gate at the
  layer's `enabled()`, not inside `draw`.
- **WebGPU `writeBuffer`/`submit` ordering trap** (CLAUDE.md "things that have bitten
  us"): per-node origin data must NOT be a per-draw mutated uniform — upload the whole
  frame's node params ONCE per frame (single storage/uniform write before the draws),
  or bake per-instance. The records storage buffer is uploaded once on commit.
- **WESL/WGSL house rules for shader tasks:** `?static` imports with literal
  `package::` paths; **no backticks inside WESL comments** (parse errors — single
  quotes); be meticulous, slow down on shaders. Shader tasks carry explicit
  visual-verification steps (dev server is already running — verification = ask the
  human to look).
- **Didactic timeless comments** — explain *why* / *what the alternative was*; no
  dates/PR refs/history. Match the multi-paragraph module-header style of the
  renderer files.
- **Subagent implementers run bash sequentially**, cannot use `sed`/`awk`/`grep` (use
  Read/Grep tools) and cannot run npm — the main thread verifies + commits.
- **Suite stays green** at every task; the final un-gated task (Task 12) gates on
  `npm run typecheck` (both tsconfigs) + `npm test`.

## Locked interfaces consumed from plans 01/02 (do NOT redeclare)

All in `src/data/starCatalog/` + `src/@types/data/starCatalog/`:

```ts
// starCatalogFormat.ts
export function decodeStarCatalog(buf: ArrayBuffer): Promise<StarCatalog>;   // inflate + parse
export function encodeStarCatalog(cat: StarCatalog): Promise<ArrayBuffer>;   // tests build synthetic bins
export function emptyStarCatalog(): StarCatalog;
export function unpackStarRecord(rec: Uint8Array, at: number): { offset: Vec3; absMagIdx: number; colorIdx: number };
export function lutIndexToAbsMag(i: number): number;   // 7-bit → mag (bin centre)
export function colorIdxToBpRp(i: number): number;     // 6-bit → BP−RP (bin centre)
export const RECORD_BYTES = 6; export const STAR_COLORIDX_MIN; export const STAR_COLORIDX_MAX; // + STAR_ABSMAG_*

// @types/data/starCatalog/StarCatalog.d.ts
type StarCatalog = {
  readonly starCount: number; readonly nodeCount: number; readonly mortonBitsPerAxis: number;
  readonly cellEdgePc: number;                 // leaf-cell edge, parsecs (float32)
  readonly gridOrigin: Vec3;                    // grid corner, parsecs, heliocentric (f64-valued)
  readonly nodes: readonly StarCatalogNode[];
  readonly records: Uint8Array;                 // packed 6-byte records, GPU-upload-ready
};
// @types/data/starCatalog/StarCatalogNode.d.ts
type StarCatalogNode = {
  readonly mortonIndex: number; readonly level: number;   // 0 = leaf; >0 = aggregate (box ×2^level)
  readonly childMask: number; readonly firstRecord: number; readonly recordCount: number; // leaf: N stars; aggregate: 1
};
// src/utils/math/mortonDecode3.ts
export function mortonDecode3(code: number): Vec3;         // uint32 → [x,y,z] grid coords
```

**Octree layout contract** (the walker relies on it — `tools/stars/buildStarOctree.ts`
docblock, "On-disk layout invariants"): nodes = all leaves first in ascending Morton
order, then aggregates by ascending `level` then Morton; the final node is the root.
Records = all leaf stars first (grouped by leaf node, Morton order), then one aggregate
record per aggregate node; leaf `k`'s `firstRecord` is the running star count, the
`j`-th aggregate's is `starCount + j`. A parent's Morton is `child >> 3`; a child's
octant is `child & 7`. A node's box origin in leaf-cell units is
`mortonDecode3(mortonIndex) · 2^level`, edge `cellEdgePc · 2^level`.

---

## Task 1 — Companion rename: `Star` → `FamousStar`

**Files (moves via `npm run move-files`):**
`src/data/sources/star.ts` → `src/data/sources/famous-star.ts`;
`src/@types/data/body/StarSourceEntry.d.ts` → `src/@types/data/body/FamousStarSourceEntry.d.ts`.
**Then edit:** `src/data/source.ts`, `src/data/sources.ts`, `src/@types/data/SourceEntry.d.ts`,
`src/utils/math/galaxyType.ts:93`, and the renamed files.

**The rename (spec §6 "Companion rename", grill Q8b):** names the dedup story —
famous stars are the curated overlay, the Gaia bin is the survey. This is a
key/const/id/type-alias rename; the numeric value stays `21` (body codes aren't
persisted) and the body renderer / content-layer (`starPointsLayer`,
`starSpheresLayer`, the `state.data.bodies.stars` path) is untouched.

- `Source.Star` → `Source.FamousStar` (value stays `21`; update the docblock at
  `source.ts:137-144`).
- `STAR_ENTRY` → `FAMOUS_STAR_ENTRY`; `id: 'star'` → `'famousStar'`, `label: 'Star'`
  → `'Famous Star'`.
- `StarSourceEntry` → `FamousStarSourceEntry`; discriminant `type: 'star'` →
  `type: 'famousStar'` (field names track type names — finish the concept, don't leave
  a half-rename). Blast radius is 3 files (`SourceEntry.d.ts` union member, the entry,
  the type) — nothing narrows on the `'star'` discriminant (`foregroundLabelsLayer.ts:312`'s
  `label.kind === 'star'` is a `LabelKind`, unrelated).

**Steps:**

- [x] `npm run move-files -- src/data/sources/star.ts src/data/sources/famous-star.ts`
      and `npm run move-files -- src/@types/data/body/StarSourceEntry.d.ts src/@types/data/body/FamousStarSourceEntry.d.ts`
      (run `--dry` first). ts-morph rewrites the imports; you rename the *symbols* by hand.
- [x] Rename the symbols + discriminant + id/label per above across the six edit sites.
- [x] Grep-for-stragglers (Grep tool, not bash grep): `STAR_ENTRY`, `StarSourceEntry`,
      `Source.Star\b`, `'star'` under `src/data` + `src/@types/data` — confirm no stale
      references and no `.wesl`/string-literal hit (move-files misses those).
- [x] `npm run typecheck` → green (no vitest change; this is a pure rename). Commit (`173f5064`).

## Task 2 — `StarCatalogSourceEntry` type + `SourceEntry` union arm

**Files:** `src/@types/data/starCatalog/StarCatalogSourceEntry.d.ts` (new, one type),
`src/@types/data/SourceEntry.d.ts` (modify — add the union member + update the
kinds-count docblock).

**Type (spec §6 sketch, verbatim shape — modelled on `VolumeSourceEntry`):**

```ts
export type StarCatalogSourceEntry = SourceEntryBase & {
  readonly type: 'starCatalog';
  /** Stable numeric tag; registry key only — not persisted, not packed. */
  readonly code: number;
  /** Filename stem under public/data/; loader appends `-<tier>.bin`. */
  readonly binBaseName: string;             // 'stars'
  /** Ships per-tier `.bin` variants (always true for this source). */
  readonly tiered: boolean;
  /** Per-frame drawn-point budget: typical + hard cap (§ renderer, Task 7). */
  readonly drawBudget: { readonly typical: number; readonly hardCap: number };
  /** Camera-distance crossfade band to the procedural MW cloud, parsecs. */
  readonly crossfadePc: { readonly inner: number; readonly outer: number };
};
```

- [x] Add `StarCatalogSourceEntry.d.ts` with a didactic docblock (singleton tier-aware
      survey; look/crossfade defaults in-row like `VolumeSourceEntry`; not persisted,
      not pickable).
- [x] Add the arm to the `SourceEntry` union and bump the "kinds" prose in its docblock.
- [x] `npm run typecheck` → green (type-only; no runtime test — a runtime type test is
      the anti-pattern testing.md forbids). Commit (`c89ce4fd`).

## Task 3 — `Source.StarCatalog = 24` + `STAR_CATALOG_ENTRY` row + registry stitch

> **LANDED as-is (`4955180e`).** Recorded below verbatim as it shipped. The
> `Source.StarCatalog` → `Source.GaiaStars` / `STAR_CATALOG_ENTRY` →
> `GAIA_STARS_ENTRY` / `id: 'starCatalog'` → `'gaiaStars'` rename is the new
> **Task 5** (Amendment 2026-07-15) — do NOT re-edit this task.

**Files:** `src/data/source.ts` (append `StarCatalog: 24`), `src/data/sources/star-catalog.ts`
(new), `src/data/sources.ts` (import + stitch into `SOURCE_REGISTRY`),
`tests/data/sources.test.ts` (modify — extend an existing structural-invariant test).

**Row contract (values are the plan's — pinned; the drawBudget/crossfade endpoints are
Task 12's to *tune*, frozen from these starting values):**

```ts
export const STAR_CATALOG_ENTRY = {
  type: 'starCatalog',
  code: Source.StarCatalog,
  id: 'starCatalog',
  label: 'Stars',
  allSky: true,                 // near-field bubble, not a sky patch (matches non-catalog rows)
  visible: true,                // real-data middle of the descent, on by default
  bearsLabel: false,
  bearsMarker: false,
  binBaseName: 'stars',
  tiered: true,
  drawBudget: { typical: 1_000_000, hardCap: 2_000_000 },   // grill Q9 starting values
  crossfadePc: { inner: 2_000, outer: 5_000 },              // spec §7 ~2→5 kpc band
} as const satisfies StarCatalogSourceEntry;
```

- [x] Append `StarCatalog: 24` to `source.ts` with a docblock in the `Star`/`Planet`/`Earth`
      style (registry-key-only; not persisted, not pickable; append-only).
- [x] Add `star-catalog.ts` (row above) + stitch `[Source.StarCatalog]: STAR_CATALOG_ENTRY`
      into `SOURCE_REGISTRY` (`sources.ts:103-128`).
- [x] Test (extend the existing sources structural-invariant test) `starCatalog is NOT a
      galaxy-catalog source` — `GALAXY_CATALOG_SOURCES` does not include
      `Source.StarCatalog` (it must never join the visibility bitmask). This is a
      load-bearing behavioural invariant (bitmask membership), not a registry
      restatement.
- [x] `npm test -- sources` + `npm run typecheck` → green. Commit (`4955180e`).

## Task 4 — `settings.starCatalog` slice + default

> **LANDED as the SINGLETON design (`e59ccecf`); REShaped by the new Task 5.**
> This shipped the singleton `settings.starCatalog: { enabled }` cluster below.
> The Amendment (2026-07-15) supersedes it: Task 5 reshapes it into the
> `settings.starCatalogs: { enabled; items }` source-type cluster. Recorded here
> verbatim as it shipped; do NOT re-edit this task — the rework is Task 5.

**Files:** `src/@types/settings/EngineSettingsState.d.ts` (add the `starCatalog`
cluster), `src/data/defaults.ts` (add `DEFAULT_STAR_CATALOG`), `src/state/settings/initialState.ts`
(seed it), `src/state/settings/settingsSlice.ts` (add the toggle action),
`tests/state/settings/settingsSlice.test.ts` (modify).

**Shape (singleton-overlay convention rule 1 — flat cluster like `milkyWay`):**

```ts
// EngineSettingsState.starCatalog
starCatalog: { enabled: boolean };
// data/defaults.ts
export const DEFAULT_STAR_CATALOG = { enabled: true } as const;  // seed from SOURCE_REGISTRY[Source.StarCatalog].visible
```

Add a `setStarCatalogEnabled(state, action: PayloadAction<boolean>)` reducer, matching
the existing singleton-overlay toggle reducers (RTK arg names `state`/`action`, never
`s`/`a` — house rule). Seed `initialState` from `DEFAULT_STAR_CATALOG` (or
`SOURCE_REGISTRY[Source.StarCatalog].visible`, mirroring `filaments` at
`initialState.ts:105-107`).

- [x] Add the `starCatalog` cluster to `EngineSettingsState` with a didactic docblock
      (singleton overlay, state lives here, status = slot readiness — no data store).
- [x] Add `DEFAULT_STAR_CATALOG`, seed `initialState`, add the reducer + its export.
- [x] Test `setStarCatalogEnabled toggles the flag` — dispatch `false` from the seeded
      `true`, assert `state.starCatalog.enabled === false` (a behavioural reducer test,
      not a default-object restatement).
- [x] `npm test -- settingsSlice` + `npm run typecheck` → green. Commit (`e59ccecf`).

## Task 5 — Mirror reshape: `Source.GaiaStars` rename + `starCatalogs` source-type cluster

**The Amendment (2026-07-15) reshape.** Rename `StarCatalog` → `GaiaStars` and lift the
landed singleton `settings.starCatalog` into the fourth source-type cluster
`settings.starCatalogs`, mirroring the galaxy-catalog family exactly. This is the
substantive superset of the original Tasks 4/6's singleton assumptions — do it once,
here, so Tasks 6–13 build on the mirrored shape.

**Files:**

- Move (controller-run `npm run move-files`): `src/data/sources/star-catalog.ts` →
  `src/data/sources/gaia-stars.ts` (kebab-case like `famous-star.ts`; ts-morph rewrites
  imports — grep `.wesl`/string-literals after, though none are expected).
- Rename edits: `src/data/source.ts` (`StarCatalog: 24` → `GaiaStars: 24`, value
  unchanged), `src/data/sources.ts` (import + `[Source.GaiaStars]: GAIA_STARS_ENTRY`,
  `sources.ts:129`), the moved row (`GAIA_STARS_ENTRY`, `code: Source.GaiaStars`,
  `id: 'gaiaStars'`, `label: 'Gaia Stars'`), `src/utils/math/galaxyType.ts:96`
  (`case Source.StarCatalog` → `case Source.GaiaStars`), `tests/data/sources.test.ts`
  (the bitmask-exclusion test follows the rename).
- New id domain: `src/@types/data/starCatalog/StarCatalogId.d.ts` (one type),
  `src/data/starCatalog/starCatalogIds.ts` (`STAR_CATALOG_IDS` runtime iterable).
- New per-item settings type: `src/@types/settings/StarCatalogItemSettings.d.ts`.
- Settings reshape: `src/@types/settings/EngineSettingsState.d.ts` (replace the
  `starCatalog` cluster with `starCatalogs`; bump the three "share one shape" docblocks
  from "three" → "four" — galaxy at `:70`, volumes at `:161`, structures at `:283`),
  `src/data/defaults.ts` (drop `DEFAULT_STAR_CATALOG`, `:136` — the cluster seeds inline
  from the registry like `galaxyCatalogs`/`structures`, no whole-cluster constant),
  `src/state/settings/initialState.ts` (`:113` seed `starCatalogs` inline),
  `src/state/settings/settingsSlice.ts` (`:126` rework `setStarCatalogEnabled` + add the
  per-item reducers), `tests/state/settings/settingsSlice.test.ts` (rework the toggle test).

**Id domain (exact mirror of `GalaxyCatalogId.d.ts` / `galaxyCatalogIds.ts`):**

```ts
// @types/data/starCatalog/StarCatalogId.d.ts
type AnyEntry = (typeof SOURCE_REGISTRY)[keyof typeof SOURCE_REGISTRY];
export type StarCatalogId = Extract<AnyEntry, { readonly type: 'starCatalog' }>['id'];  // 'gaiaStars' today

// data/starCatalog/starCatalogIds.ts  (mirror galaxyCatalogIds.ts:15)
export const STAR_CATALOG_IDS = SOURCE_ENTRIES.filter((e) => e.type === 'starCatalog').map((e) => e.id);
```

**Per-item settings (exact mirror of `GalaxyCatalogItemSettings.d.ts`, incl. the
seeded-but-unread `labelEnabled` docblock argument — famous stars will read it; gaia
carries it inertly):**

```ts
// @types/settings/StarCatalogItemSettings.d.ts
import type { DataItemSettings } from './DataItemSettings';
export type StarCatalogItemSettings = DataItemSettings & {
  /** Whether this star catalog's text labels are shown (famous-star names, a future catalog). */
  labelEnabled: boolean;
};
```

**Settings cluster (replaces the landed singleton `starCatalog: { enabled }`):**

```ts
// EngineSettingsState.starCatalogs — the FOURTH source-type cluster
starCatalogs: {
  enabled: boolean;                                          // master "hide all star catalogs" gate
  items: Record<StarCatalogId, StarCatalogItemSettings>;     // one row per star catalog
};
```

Reducers mirror the galaxy cluster (`settingsSlice.ts:75-86`): the master
`setStarCatalogEnabled` reworked to `settings.starCatalogs.enabled`, plus
`setStarCatalogVisible({ id, enabled })` → `settings.starCatalogs.items[id].enabled` and
`setStarCatalogLabelEnabled({ id, enabled })` → `.items[id].labelEnabled` (RTK arg names
`settings`/`action`, never `s`/`a`). Defaults seed `items` from the registry rows like
`galaxyCatalogs` (`initialState.ts:79-84`): `enabled: true` master +
`Object.fromEntries(SOURCE_ENTRIES.filter((e) => e.type === 'starCatalog').map((e) => [e.id,
{ enabled: e.visible, labelEnabled: true }]))`.

- [ ] Run the controller-issued `npm run move-files` for the row (`--dry` first); rename
      the symbols (`GAIA_STARS_ENTRY`, `code`, `id`, `label`) + the `Source.GaiaStars`
      key + the `galaxyType.ts` case + the `sources.ts` stitch by hand. Grep-for-stragglers
      (`StarCatalog`, `'starCatalog'` the *id*, `STAR_CATALOG_ENTRY`) under `src/data` +
      `src/@types/data` — the TYPE `StarCatalogSourceEntry` + the `type: 'starCatalog'`
      discriminant stay (kind-naming), so filter those out.
- [ ] Add `StarCatalogId.d.ts` + `starCatalogIds.ts` + `StarCatalogItemSettings.d.ts`
      (didactic docblocks mirroring their galaxy twins).
- [ ] Reshape `EngineSettingsState.starCatalog` → `starCatalogs` (+ the three "→ four"
      docblock bumps); drop `DEFAULT_STAR_CATALOG`; seed `initialState.starCatalogs`
      inline from the registry; rework `setStarCatalogEnabled` + add the two per-item
      reducers with their exports.
- [ ] Test `setStarCatalogVisible toggles a catalog's enabled` — dispatch
      `{ id: 'gaiaStars', enabled: false }` from the seeded `true`, assert
      `state.starCatalogs.items.gaiaStars.enabled === false` (behavioural per-item reducer
      test, mirroring the galaxy `setGalaxyCatalogVisible` test — not a default restatement).
      Keep a `setStarCatalogEnabled toggles the master gate` reducer test.
- [ ] Update `tests/data/sources.test.ts`'s bitmask-exclusion invariant to the renamed
      `Source.GaiaStars` (still asserting it is NOT in `GALAXY_CATALOG_SOURCES`).
- [ ] `npm test -- settingsSlice sources` + `npm run typecheck` (both tsconfigs) → green.
      Commit.

## Task 6 — `starCatalogFetcher` (parameterized by source)

**Files:** `src/services/loading/fetchers/starCatalogFetcher.ts` (rework — the
uncommitted single-catalog implementation), `src/@types/loading/StarCatalogReq.d.ts`
(rework — `{ source: SourceType; tier: Tier }`),
`tests/services/loading/fetchers/starCatalogFetcher.test.ts` (new/rework).

**Signature (mirror `mcpmFetcher`, `src/services/loading/fetchers/mcpmFetcher.ts`, but
one fetcher for EVERY `starCatalog` source, keyed by `req.source`):**

```ts
export type StarCatalogReq = { readonly source: SourceType; readonly tier: Tier };
export const starCatalogFetcher: Fetcher<StarCatalog, StarCatalogReq>;
// entry = SOURCE_REGISTRY[req.source]; validate entry.type === 'starCatalog' (throw otherwise).
// name = entry.tiered ? `${entry.binBaseName}-${req.tier}.bin` : `${entry.binBaseName}.bin`
//        (the `${base}.bin` untiered branch mirrors the galaxy-side famous.bin path).
// fetchWithProgress(dataUrl(name)), then await decodeStarCatalog(buf).
```

`binBaseName` comes from `SOURCE_REGISTRY[req.source]` (a `starCatalog`-row-validated
lookup) — NOT `tierFilenameForSource` (that narrows to galaxyCatalog,
`tierTargets.ts:85-93`). One fetcher serves every star catalog; the `req.source`
dimension is what lets a future famous-star catalog reuse it unchanged.
`decodeStarCatalog` is async (sealed codec) — the fetcher awaits it.

- [ ] Rework `StarCatalogReq` to `{ source, tier }` + `starCatalogFetcher` to the
      source-parameterized filename (didactic docblock: one fetcher per star catalog;
      tiered vs untiered branch; async decode because the codec inflates).
- [ ] Test `fetches <binBaseName>-<tier>.bin and decodes it` — stub `fetchWithProgress`
      (or the global `fetch`) to return `await encodeStarCatalog(<synthetic catalog>)`;
      assert the resolved `StarCatalog` round-trips (star/node counts + a spot-checked
      node), and that the requested URL contains `stars-medium.bin` for
      `{ source: Source.GaiaStars, tier: 'medium' }`. Synthetic in-memory bin — no
      network, no real data.
- [ ] `npm test -- starCatalogFetcher` + `npm run typecheck` → green. Commit.

## Task 7 — `starCatalogSlot` + per-source `ASSET_WIRING` rows (tier-reload)

**Files:** `src/services/loading/slots/starCatalogSlot.ts` (new),
`src/services/engine/wiring/assetWiring.ts` (add a per-source row family),
`tests/services/engine/wiring/assetWiring.test.ts` (modify — the demand test that
already imports `ASSET_WIRING`).

**Slot contract (mirror `mcpmSlot`, `src/services/loading/slots/mcpmSlot.ts`, but
parameterized by `source` so ONE factory serves every star catalog):**

```ts
export function createStarCatalogSlot(
  source: SourceType, state: EngineState, cb: SlotCallbacks,
): AssetSlot<StarCatalog, StarCatalogReq>;
// commit: uploads to state.gpu.starCatalogRenderer (Task 10's handle):
//   renderer.upload(source, catalog)   // per-source records buffer; nodes kept CPU-side for the walker
// null-guards the renderer (pre-bootstrap), like mcpmSlot guards volumeFieldRenderer.
```

**Wiring rows (mirror the galaxy `pointRow` family, `assetWiring.ts:100-119` — a
`starCatalogRow(source)` helper mapped over the `starCatalog` registry sources):**

```ts
function starCatalogRow(source: SourceType): AssetWiringRow {
  const id = SOURCE_REGISTRY[source].id as StarCatalogId;
  return {
    key: source,
    factory: (deps) => createStarCatalogSlot(source, deps.state, deps.cb),
    req: (tier) => ({ source, tier }),
    demand: (ctx) =>
      ctx.settings.starCatalogs.enabled && ctx.settings.starCatalogs.items[id]?.enabled === true,
  };
}
// ...ASSET_WIRING rows: STAR_CATALOG_IDS-derived `starCatalog` sources.map(starCatalogRow)
```

The galaxy point rows are `built: 'external'` (their slots are minted in `initGpu`
alongside the renderer); the star slots are normal factory-built rows like `mcpm`
(`assetWiring.ts:157-161`) — `createStarCatalogSlot` null-guards the renderer handle read
from `state.gpu` at commit time, so no `initGpu` co-minting is needed. Tier reload is
inherent: `reevaluateDemand` re-runs the table on any state change including a tier flip,
re-issuing `req(newTier)`. No bespoke `DemandCtx` surface.

- [ ] Add `starCatalogSlot` (per-source commit uploads to the renderer handle;
      subscribe-log the loaded star/node counts, like mcpmSlot's ready log).
- [ ] Add the `starCatalogRow` helper + map it over the `starCatalog` registry sources
      into `ASSET_WIRING`.
- [ ] Test `gaiaStars demand follows settings.starCatalogs` — the row's `demand` returns
      true only when BOTH `ctx.settings.starCatalogs.enabled` and
      `.items.gaiaStars.enabled` are true, false when either is false (behavioural
      predicate check over the row, matching the existing per-row demand tests — not a
      table restatement).
- [ ] `npm test -- assetWiring` + `npm run typecheck` → green. Commit.

## Task 8 — Octree draw-cut walker (pure, un-gated)

**Files:** `src/services/gpu/renderers/starCatalog/walkStarOctreeCut.ts` (new),
`tests/services/gpu/renderers/starCatalog/walkStarOctreeCut.test.ts` (new).

**Signature + contract:**

```ts
export type StarNodeDraw = {
  readonly nodeIndex: number;    // index into catalog.nodes
  readonly firstRecord: number;  // records-buffer base for the draw
  readonly recordCount: number;  // instance count (leaf: N stars; aggregate: 1)
};
export function walkStarOctreeCut(
  catalog: StarCatalog,
  camPosPc: Vec3,                              // camera in the catalog's parsec grid frame
  budget: { typical: number; hardCap: number },
): readonly StarNodeDraw[];
```

**Behaviour:** descend from the root node (the last node — layout contract) toward the
camera; draw a leaf's stars when the node is refined near the camera, draw an interior
node's single aggregate record when it is far enough (sub-pixel) or the budget is nearly
spent. The cut is a **covering partition**: every leaf star is represented exactly once
— either by its own leaf draw or by exactly one ancestor aggregate, never both, never
neither. Total instances (`Σ recordCount`) ≤ `hardCap`; refinement targets ≤ `typical`.
Build the `(morton, level) → nodeIndex` lookup from `catalog.nodes` once (children of
level-`L` node `M` are level-`L-1` nodes `M<<3 .. (M<<3)+7` present per `childMask`).
The refine/coarsen threshold (a screen-error or camera-distance-per-box-edge heuristic)
is the implementer's to shape and is one of the budget knobs Task 13 tunes.

- [ ] Add `walkStarOctreeCut.ts` with a didactic docblock (why nearest-first + budget;
      why aggregates for far/sub-pixel nodes; the covering-partition invariant).
- [ ] Test `covers every leaf star exactly once` — build a synthetic catalog (a handful
      of leaf cells across ≥2 octree levels via `buildStarOctree`), run the cut, and
      assert `Σ recordCount` over the returned draws equals the true leaf-star count
      reachable, with no leaf star double-counted (walk the chosen nodes' subtrees). An
      independent covering-partition property — fails on a double-draw or a gap.
- [ ] Test `respects the hard cap` — a budget with `hardCap` below the leaf-star count
      forces aggregate substitution so `Σ recordCount ≤ hardCap`.
- [ ] Test `refines near the camera, coarsens far` — a camera placed inside one leaf
      cell draws that cell as a leaf while a distant cluster of cells collapses to an
      aggregate (hand-constructed two-cluster fixture; assert the near `nodeIndex` is a
      `level === 0` node and the far draw is `level > 0`).
- [ ] `npm test -- walkStarOctreeCut` → green. Commit.

## Task 9 — Camera-relative node origin (the pc→Mpc f64 seam, pure, un-gated)

**Files:** `src/services/gpu/renderers/starCatalog/starNodeOriginRelCamMpc.ts` (new),
`tests/services/gpu/renderers/starCatalog/starNodeOriginRelCamMpc.test.ts` (new).
Reuse the existing pc↔Mpc constant if one exists (grep `src/utils/math`); else add a
single-symbol `pcToMpc` util.

**Signature + contract (spec §7 precision story):**

```ts
export function starNodeOriginRelCamMpc(
  catalog: StarCatalog,
  node: StarCatalogNode,
  camPosMpc: Vec3,                             // camera in the scene Mpc frame (heliocentric)
): { originRelCamMpc: Vec3; cellScaleMpc: number };
// nodeOriginPc = catalog.gridOrigin + mortonDecode3(node.mortonIndex)·(catalog.cellEdgePc · 2^node.level)
// originRelCamMpc = nodeOriginPc·PC_TO_MPC − camPosMpc     (subtraction in f64, BEFORE any f32 narrow)
// cellScaleMpc    = catalog.cellEdgePc · 2^node.level · PC_TO_MPC
// shader then reconstructs: worldRelCam = originRelCamMpc + (offset/1024)·cellScaleMpc
```

This is the seam that keeps the ~78 pc cell quantization from fighting f32 range at kpc
distances: the large `nodeOriginPc·PC_TO_MPC` and `camPosMpc` are near-equal f64 numbers
whose difference is a small camera-relative vector — narrowed to f32 only by the renderer
at upload (like `starPointsLayer.ts:120-139`). Handles both leaves (`level 0`) and
aggregates (`level > 0`) via the `2^level` box scale (the same reconstruction
`buildStarOctree.ts` inverts — see its "Coordinate frame" docblock).

- [ ] Add `starNodeOriginRelCamMpc.ts` with a didactic docblock (why f64 subtract before
      narrow; the shared reconstruction formula; leaf vs aggregate via `2^level`).
- [ ] Test `computes a leaf origin relative to the camera` — hand-authored node
      (`mortonIndex`, `level 0`, known `gridOrigin`/`cellEdgePc`); assert
      `originRelCamMpc` + `cellScaleMpc` against **hand-computed** values.
- [ ] Test `scales an aggregate box by 2^level` — same node at `level 2` gives a
      4× `cellScaleMpc` and the correct box origin (hand-computed).
- [ ] Test `is finite for a coincident (zero-distance) node` — a node whose world origin
      equals `camPosMpc` yields `originRelCamMpc === [0,0,0]` and a finite `cellScaleMpc`
      (the Sun-exclusion robustness guard — Decision 3; no divide-by-zero).
- [ ] `npm test -- starNodeOriginRelCamMpc` → green. Commit.

## Task 10 — `starCatalogRenderer` + WESL shaders (GPU shell, typecheck-gated + visual)

**Files:** `src/services/gpu/renderers/starCatalog/starCatalogRenderer.ts` (new),
`src/@types/rendering/StarCatalogRenderer.d.ts` (new),
`src/services/gpu/shaders/starCatalog/vertex.wesl` + `fragment.wesl` (+ an `io.wesl`
uniform decl if the pattern needs it), `src/services/gpu/renderers/starCatalog/starTint.ts`
IF a CPU twin of the anchor table is wanted (else the anchors live only in WESL). Add
the `starCatalogRenderer` handle to `src/@types/engine/state/EngineGpuHandles.d.ts` +
construct it in `initGpu` (grep for where `milkyWayCloudRenderer` is constructed).

**Renderer contract (per-source buffers keyed by source code — the `catalogStore`
precedent, `galaxyCatalog/catalogStore.ts`):**

```ts
export type StarCatalogRenderer = Renderer & {
  /** Upload one catalog's records → storage buffer (once), keyed by source code; nodes kept CPU-side. */
  upload(source: SourceType, catalog: StarCatalog): void;
  /** Every loaded catalog, so the layer can walk each octree per frame (mirrors catalogStore.entries()). */
  loadedCatalogs(): Iterable<{ source: SourceType; catalog: StarCatalog }>;
  /** Draw one source's per-frame cut. `nodeDraws` from walkStarOctreeCut; origins from Task 9. */
  draw(pass: GPURenderPassEncoder, args: StarCatalogDrawArgs): void;
  destroy(): void;
};
export type StarCatalogDrawArgs = {
  readonly source: SourceType;        // which loaded catalog's records buffer to bind
  readonly vp: Float32Array;          // rebased camera-relative vp (narrowMat4(rebaseViewProj(...)))
  readonly viewportPx: Vec2;
  readonly nodeDraws: readonly StarNodeDraw[];
  readonly originRelCamMpc: readonly Vec3[];   // one per nodeDraw (parallel array)
  readonly cellScaleMpc: readonly number[];    // one per nodeDraw
  readonly opacity: number;                     // crossfade alpha (Task 11)
};
```

**Pipeline profile:** additive (`ADDITIVE_BLEND`), depthless (the `hdr` target has no
depth attachment — like `starPointRenderer.ts:114-150`); `draw(3, recordCount)` per
node. The **records storage buffer** is uploaded once per source on `upload` (a
per-source-code map like `catalogStore`'s per-`GalaxyCatalogId` map). The **per-node
params** (origin + cellScale + firstRecord) upload ONCE per frame into a single
storage/uniform buffer before the draws — NOT a per-draw mutated uniform (the
writeBuffer/submit race, CLAUDE.md). The implementer picks how each per-node draw reads
its params (a dynamic-offset uniform, a `firstInstance`-encoded draw id into the params
buffer, or per-instance bake) — pin only: *written once per frame, no mid-frame uniform
mutation*.

**Vertex shader:** vertex-pull record `firstRecord + instance_index` from the records
storage buffer; unpack the two u32 halves exactly as `unpackStarRecord`
(`starCatalogFormat.ts:180-219`) — `offset` (3×10-bit), `absMagIdx` (7-bit), `colorIdx`
(6-bit); reconstruct `worldRelCam = originRelCamMpc + (offset/1024)·cellScaleMpc`;
expand into the 3-vertex circumscribing triangle via `@builtin(vertex_index)` (the #428
billboard idea — see `pointRenderer.ts` header; do NOT import its code). Size from
`absMagIdx` → `lutIndexToAbsMag` brightness.

**Fragment shader:** the Gaussian soft-dot profile (`exp(-r2*4.0)`, `r2>1` discard —
match `bodies/starPoints/fragment.wesl`), tinted by the **stellar BP−RP ramp** (Decision
1): `colorIdx` → BP−RP (`colorIdxToBpRp` / `STAR_COLORIDX_*` window) → interpolate the
palette anchor table (`palette.ts:41-52`). Premultiplied output into the additive HDR
target. `opacity` multiplies alpha.

- [ ] Add `StarCatalogRenderer` type + the renderer factory (pipeline, per-source records
      storage buffers on `upload` + `loadedCatalogs()` iterator, per-frame node-params
      buffer, `draw`, `destroy` — mirror the per-source storage discipline of
      `catalogStore.ts` + the pipeline lifecycle of `starPointRenderer.ts`).
- [ ] Add the WESL `vertex.wesl` + `fragment.wesl` (`?static`, literal `package::`
      imports, NO backticks in comments). Verify the unpack matches `unpackStarRecord`
      bit-for-bit (the offsetZ split across the 24-bit halves is the trap).
- [ ] Wire the `starCatalogRenderer` handle into `EngineGpuHandles` + `initGpu`
      construction + `destroy` teardown.
- [ ] **No vitest** (WebGPU is unavailable in the runner; the CPU cut/origin logic is
      tested in Tasks 8–9). Acceptance = `npm run typecheck` (both tsconfigs) green +
      the shader compiles with no `createShaderModuleWithDevLog` error in the running
      dev server. **Visual bring-up is Task 13** (needs real bins). Commit.

## Task 11 — `starCatalogLayer` + crossfade + slot→renderer wiring

**Files:** `src/services/engine/frame/passes/starCatalogLayer.ts` (new),
`src/services/engine/frame/passes/index.ts` (register in `CONTENT_LAYERS`, in the
`(hdr, NEAR0)` group beside `starPointsLayer`),
`tests/services/engine/frame/passes/starCatalogLayer.test.ts` (new — over `enabled`).

**Layer contract (`ContentLayer`, mirror `starPointsLayer` + `milkyWayLayer` — iterates
EVERY loaded star catalog):**

```ts
export const starCatalogLayer: ContentLayer = {
  name: 'star-catalog', slab: NEAR0, target: 'hdr', blend: 'additive',
  enabled(state, ctx) { /* handle present && starCatalogs.enabled && ANY items[id].enabled && crossfade > 0 */ },
  draw(pass, view, ctx, state) { /* for each loadedCatalogs(): walk cut, build origins, rebase vp, renderer.draw */ },
};
```

- **`enabled`** (house rule: gate here, not in draw): `state.gpu.starCatalogRenderer !==
  null` AND `state.settings.starCatalogs.enabled` AND at least one loaded catalog whose
  `settings.starCatalogs.items[id].enabled` is true AND
  `crossfadeOpacity(ctx.drawCamPos) > 0`. No `FOREGROUND_MAX_DISTANCE_MPC` cut — the
  bubble extends well past the ≤25 pc scene stars; the crossfade band IS the far gate.
- **Crossfade (Decision 2 + spec §7):** a recede-direction `fadeBand` keyed on camera
  distance from the heliocentric origin, endpoints from EACH source's registry row
  `crossfadePc` (parsecs): `fadeBand({ fullAt: inner, goneAt: outer }, camDistPc)` — full
  inside ~2 kpc, gone past ~5 kpc, where the MW cloud takes over (the MW
  `milkyWayApproach` band already fades the impostor the complementary way).
  `camDistPc = hypot(camPos)·MPC_TO_PC`. The endpoints stay row-carried named constants,
  live-tunable in Task 13, then frozen. V1 accepts a visible seam (density calibration
  deferred to the backlog item). *If a fourth descent transition wants this, promote it
  to a `SCALE_FADE_BANDS` row (`scaleFadeBands.ts`) — but a row-carried, per-source band
  is correct here since the endpoints live on the source entry.*
- **`draw`:** for each `{ source, catalog }` in `renderer.loadedCatalogs()` whose per-item
  toggle is on, `walkStarOctreeCut(catalog, camPosPc, SOURCE_REGISTRY[source].drawBudget)`
  → build the parallel `originRelCamMpc`/`cellScaleMpc` arrays via
  `starNodeOriginRelCamMpc`, rebase the vp (`narrowMat4(rebaseViewProj(view.slab.vp,
  view.camPos))`, `starPointsLayer.ts:146`), and call `renderer.draw({ source, …opacity })`
  with that source's crossfade `opacity`. `camPosPc` for the walker =
  `view.camPos · MPC_TO_PC` (the catalog grid is parsec-based). A no-op draw until a
  non-empty catalog loads (real data gated).
- **No `drawPick`** — the Gaia bin is not pickable (spec §6; keeps the parked
  foreground-body-picking item untouched).

- [ ] Add `starCatalogLayer` with a didactic docblock (why NEAR0 + the f64 rebase seam;
      the per-source loop; the crossfade direction; not pickable; the Sun-exclusion note
      from Decision 3).
- [ ] Register it in `CONTENT_LAYERS` in the `(hdr, NEAR0)` group (after
      `starPointsLayer`/`orbitTrailsLayer` — within-group order is a listing choice,
      additive), and add the matching `export`.
- [ ] Ensure the slot commit (Task 7) uploads to `state.gpu.starCatalogRenderer` so the
      layer reads live catalogs via `loadedCatalogs()`.
- [ ] Test `enabled follows the toggles and the crossfade band` — with the renderer handle
      stubbed non-null, one loaded catalog, `settings.starCatalogs.enabled = true`, and
      `items.gaiaStars.enabled = true`: `enabled` is true when `ctx.drawCamPos` is inside
      the crossfade band and false when the camera is past `crossfadePc.outer` (a
      behavioural gate test; drives `enabled` via a stub state, no GPU). Also false when
      the master gate OR the per-item toggle is off.
- [ ] `npm test -- starCatalogLayer` + `npm run typecheck` → green. Commit.

## Task 12 — README blurb + entanglement-radar + final gate (un-gated; ends the mergeable unit)

**Files:** `README.md` (modify — user-facing functionality blurb only). Docs + review;
no new code.

**Scope guard (the plans-01/02/03 docs split):** plan 01 = ATTRIBUTIONS + README
raw-data download rows; plan 02 = README build-step docs + the `add-data-source` skill
pipeline surface; **plan 03 = the user-facing functionality blurb** (what the star field
looks like on screen) + the skill's runtime surface. Do NOT duplicate the data-source /
pipeline / build rows plans 01/02 already added.

- [ ] Add a short functionality blurb to `README.md` (the star-field feature: a
      real-Gaia stellar bubble as the descent's real-data middle, crossfading into the
      Milky-Way cloud), matching the README's existing voice. No download/build rows.
- [ ] Update `.claude/skills/add-data-source/SKILL.md`'s runtime surface (the second-pass
      note plan 02 left): the `starCatalog` source-type family (the `StarCatalogId` /
      `STAR_CATALOG_IDS` id domain + `settings.starCatalogs` cluster mirroring
      `galaxyCatalogs`), the source-parameterized `starCatalogFetcher` + per-source
      `starCatalogRow`/`starCatalogSlot`, and the dedicated per-source `starCatalog/`
      renderer family — so a future star-like source (famous stars — Decision A) finds the
      runtime edit surface. Grep-verify `starCatalog` appears in the skill file.
- [ ] **entanglement-radar pass** (house convention): run the `entanglement-radar` skill
      over this plan's cumulative diff (Tasks 1–11). Record findings; fold any cheap
      un-braiding in (or capture it as a follow-up if it's out of scope). Pay attention
      to: the rename leaving no half-renamed `Star`/`GaiaStars`/`starCatalog` ambiguity
      (id `'gaiaStars'` vs type `'starCatalog'` — the kind/catalog split is intentional),
      the crossfade band living in exactly one home (the row), the star cluster genuinely
      mirroring the galaxy cluster (no divergent per-item accessor), and the walker/origin
      split staying un-braided (cut ≠ dequant).
- [ ] **Final gate:** `npm run typecheck` (both src + tools tsconfigs) + full `npm test`
      → green. Commit. **Tasks 1–12 are a complete, mergeable unit** — the runtime is
      wired, compiles, tests green, and draws nothing only because no real bin has loaded.

## Task 13 — Real-data bring-up + tuning (GATED on the real fetch + build; LAST)

**Gated:** requires the user-approved ~2 GB `fetch-gaia` (plan 01) + real `build-stars`
(plan 02, ~16 GB RAM) + R2 sync + local `/link-data`. Do NOT start until real
`stars-{small,medium,large}.bin` exist. This task is tuning + visual verification — **no
new vitest** (the logic is covered by Tasks 8–11; this is eyes-on calibration).

- [ ] **Visual bring-up:** with real bins linked and the dev server running, confirm the
      star bubble renders in the near-field HDR accumulation — naked-eye stars from
      Earth, the ~3 kpc bubble on pull-out, aggregates (not gaps) far out. Ask the human
      to look.
- [ ] **NEAR0 far-plane check (Decision 2 flagged interaction):** confirm the bubble is
      not clipped at the far end; if it is, extend the NEAR0 far floor (a named constant,
      coordinated with the zoom-to-earth far-plane work) — not a new slab.
- [ ] **Budget tuning (grill Q9):** make `drawBudget.{typical,hardCap}` live-tunable
      (DebugPanel-slider style) during bring-up; tune by eye; freeze the tuned values
      back into `GAIA_STARS_ENTRY` (Task 5's renamed row). Set the small-tier mobile cap
      (a lower `hardCap` for `tier === 'small'`).
- [ ] **Crossfade tuning (spec §7):** live-tune `crossfadePc.{inner,outer}` against the
      MW-cloud handoff; freeze into the row. V1 accepts a visible seam — density
      calibration stays deferred (backlog item).
- [ ] **Colour-ramp check (Decision 1):** confirm Gaia bulk stars and scene FamousStars
      read as the same species (blue-white O/B ↔ red M dwarfs); nudge the anchor table if
      a class reads wrong.
- [ ] Commit the frozen constants.

---

## Self-review checklist (before marking the plan done)

- **Spec coverage.** §6 registry → Tasks 1–5 (rename, variant, code+row, settings + the
  Amendment mirror reshape); §6 loader → Tasks 6–7 (source-parameterized fetcher,
  per-source slot+wiring, tier-reload); §7 renderer → Tasks 8–11 (walker, origin seam,
  per-source GPU renderer+shaders, layer+crossfade); §8 plan-time items → Decisions 1–3
  (colour ramp = Task 10, slab = Task 11, Sun = Task 9) + budget/crossfade tuning =
  Task 13; docs blurb + skill = Task 12. Not-pickable (§6) honoured (no `drawPick`).
- **Amendment coverage.** Decision A (famous stars = a future second star catalog) →
  the inert `labelEnabled` axis on `StarCatalogItemSettings` (Task 5). Decision B (mirror
  the galaxy-catalog family) → `StarCatalogId`/`STAR_CATALOG_IDS` + `settings.starCatalogs`
  fourth cluster (Task 5), source-parameterized loader (Tasks 6–7), per-source renderer
  (Tasks 10–11). Rename `Source.StarCatalog` → `Source.GaiaStars` (Task 5, value 24).
- **Placeholder scan.** No `TODO`/`TBD`/`FIXME`; every constant is either pinned
  (`code 24`, `id 'gaiaStars'`, `binBaseName 'stars'`, budget/crossfade starting values)
  or explicitly routed to Task 13's freeze.
- **Type consistency.** `StarCatalogSourceEntry` fields (`drawBudget`, `crossfadePc`)
  match the renamed row (Task 5, was Task 3) and the renderer/layer consumers
  (Tasks 10–11); `StarCatalogId` is declared once (Task 5) and keys `settings.starCatalogs.items`
  + the wiring rows + the renderer's per-source map; `StarCatalogReq` gains `source`
  (Task 6) and flows unchanged through the slot (Task 7); `StarNodeDraw` is declared once
  (Task 8) and imported by Tasks 10–11; `StarCatalogDrawArgs` carries the per-source
  `source` field; the locked plan-02 symbols (`decodeStarCatalog`, `unpackStarRecord`,
  `lutIndexToAbsMag`, `colorIdxToBpRp`, `StarCatalog`, `StarCatalogNode`, `mortonDecode3`)
  are consumed verbatim, never redeclared. The TYPE `StarCatalogSourceEntry` + the
  discriminant `type: 'starCatalog'` keep their kind-names; only the code/id/row-const
  rename to `GaiaStars`/`gaiaStars`/`GAIA_STARS_ENTRY`.
- **No forbidden tests.** No runtime type test (Task 2 is typecheck-only), no registry
  restatement (Task 5 asserts the bitmask-exclusion invariant + behavioural reducers, not
  row/`STAR_CATALOG_IDS` contents), no GPU-pipeline unit test (Task 10 is typecheck +
  visual); the covering-partition, hand-computed origin, and coincident-node tests are
  independent properties.
- **Mergeable boundary.** Tasks 1–12 form a complete, green, mergeable unit; Task 13
  (real-data tuning) is last and gated, structured so nothing in 1–12 depends on it.
- **Contract, not implementation.** No function bodies pasted; existing code cited by
  `path:line`; only type signatures, the uniform/record layout references, and test
  names carry code.
