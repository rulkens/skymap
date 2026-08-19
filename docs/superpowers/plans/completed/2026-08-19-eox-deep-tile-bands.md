# EOX deep tile bands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add EOX s2cloudless z8–z13 imagery over Copenhagen as a second, regional, deeper band in Earth's existing surface virtual-texture pyramid, so descending over that one city resolves 9.55 m/px Sentinel-2 detail instead of stopping at BMNG's z7 ~611 m/texel floor.

**Architecture:** The manifest, `EarthImagerySource`, `buildEarthTiles` and the planner all reshape from "one scalar level range" to "a band list," with BMNG becoming the first (and, until this feature, only) band — five leading prep commits with no behavior change. The feature itself is then two new build-time modules (an EOX WMTS harvester, an `EarthImagerySource` compositing 2×2 EOX tiles) plus one bake invocation wiring a second band in; the runtime page-table/atlas/shader machinery is untouched.

**Tech Stack:** TypeScript (Node `tsx` for build tools), `sharp`/libvips for tile compositing, Vitest, WGSL (untouched this feature).

**Spec:** [docs/superpowers/specs/2026-08-19-eox-deep-tile-bands-design.md](../specs/2026-08-19-eox-deep-tile-bands-design.md) — authoritative for every type shape, file path, URL, licence rule and decision. This plan does not re-derive or alter its contracts; read it first.

## Global Constraints

- `type` aliases, never `interface`, for every new TS shape.
- One exported symbol per file in `src/utils/` and `src/@types/` (and `tools/utils/`) — filename matches the export.
- Any file move or rename goes through `npm run move-files` (or `npm run refactor -- move`), never `git mv` + hand-edited imports.
- Comment budget: module header ≤ 10 lines; comment lines ≤ half the code lines in the file; comments explain *why*, never *what*.
- `npm run typecheck` (both `src` and `tools` tsconfigs) must stay clean after every task.
- `npm test` (the full Vitest suite) must stay green after every task.
- The worktree's `public/data/` is a symlink to the main checkout's — bake output in this plan lands in **main's** `public/data/images/earth-tiles/`, which is intended, not a bug to route around.
- Only the s2cloudless **2016** layer (CC BY 4.0) may ever be fetched from EOX — 2018+ is CC BY-NC-SA (rejected outright, ShareAlike would contaminate the JOSS-bound repo), 2017 is broken upstream. No code in this plan may parameterize the layer year away from `2016`/`default` in a way that could point Task 9's harvest at a different layer.

---

## Strategy

Tasks 1–5 are the ground-preparation refactor from the spec's §2: they reshape the manifest, source contract, bake tool and planner from a scalar `{min, max}` to a band list, with BMNG as the sole band throughout — **no observable behavior change**. Each is its own commit, landing before any EOX code exists, so a reviewer can verify "nothing moved" independently of "EOX works." Tasks 6–8 are the feature: a new harvester, a new `EarthImagerySource`, and the bake/version wiring that turns the (by-then-generic) two-source pyramid into three tasks' worth of new code sitting on an architecture that already expects it. Task 9 is the one execution step with side effects outside git — a real network harvest and a real bake — explicitly gated on the user's go-ahead before any request leaves the machine, then handed to the user's own eyes for the visual judgement call §6 and §7 reserve for a human.

## Definition of Done

- **Deliverable inventory:** `tools/fetch/fetchEoxTiles.ts`, `tools/textures/eoxTileSource.ts`, `src/@types/scene/LonLatBounds.d.ts` (moved+renamed), `src/@types/scene/EarthTileProvenance.d.ts`, `src/utils/scene/earthTileBandRefineAllowed.ts` + `earthTileBandRequestAllowed.ts`, `data/raw/eox/README.md`, an `'eox.dir'` `rawDataRegistry.ts` entry, an EOX subsection in `ATTRIBUTIONS.md`, and a shipped `earth-tiles/v2` manifest with two `levels.surface` band entries (BMNG world + EOX Copenhagen).
- **Named observable behaviours for the manual smoke pass (Task 9, dev server):** flying to Copenhagen resolves EOX detail at z8–z13 with no seam artifact worse than the accepted BMNG/Sentinel look jump (spec §6); `EARTH_TILE_LOD_BIAS` reads sane at z12–z13 (no obvious over/under-refinement); flying anywhere outside the Copenhagen patch behaves exactly as before (BMNG-only regions untouched).
- **The deferral boundary:** no texture-kind axis (`normal` tiling stays out of scope, per `docs/backlog/2026-07-30-earth-tile-kind-singularity.md`); no runtime attribution/credits UI; no colour-matching or cross-fade at the BMNG/EOX seam; no wider EOX harvest or self-hosted mirror (spec §9); R2 sync is a post-merge, main-checkout-only step (Task 9's checklist item), not part of this plan's task list.

---

## Task 1 (prep): `LonLatBox` → `LonLatBounds`, relocated

**Files:**

- Move: `tools/textures/LonLatBox.d.ts` → `src/@types/scene/LonLatBounds.d.ts`
- Modify (imports auto-rewritten by the move, symbol rewritten by the rename): `tools/textures/EarthImagerySource.d.ts`, `tools/textures/bmngQuadrantSource.ts`, `tools/textures/buildEarthTiles.ts`, `tests/tools/textures/bmngQuadrantSource.test.ts`

**Interfaces:**

- Produces: `LonLatBounds` (same four-field shape `LonLatBox` already has — `west`/`south`/`east`/`north`, degrees, `west < east`/`south < north` invariant, no antimeridian-crossing entry), now importable from `src/@types/scene/LonLatBounds.d.ts` by both build tools and (from Task 3 on) the runtime manifest schema.

Purely mechanical — the type's shape does not change, only its name and location.

- [x] Run `npm run move-files -- --dry tools/textures/LonLatBox.d.ts src/@types/scene/LonLatBounds.d.ts` and confirm the reported blast radius matches the four files listed above (plus the file itself).
- [x] Run it for real (drop `--dry`): `npm run move-files -- tools/textures/LonLatBox.d.ts src/@types/scene/LonLatBounds.d.ts`.
- [x] Run `npm run refactor -- rename src/@types/scene/LonLatBounds.d.ts#LonLatBox LonLatBounds` to rename the exported symbol everywhere it's referenced. Pass `--dry` first to confirm the four-file blast radius, then for real.
- [x] `npm run typecheck` — clean.
- [x] `npm test -- bmngQuadrantSource` — green (this test file imports the type only, no behavioral change).
- [x] Commit:

```
git commit -m "$(cat <<'EOF'
refactor(scene): move LonLatBox to src/@types as LonLatBounds

Prep for EOX deep tile bands (docs/superpowers/specs/2026-08-19-eox-deep-tile-bands-design.md
§2, §3): the manifest schema and the build-time source protocol read
the same box shape, so it belongs in src/@types, not tools/textures.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 (prep): `EarthImagerySource.coverage` becomes required

**Files:**

- Modify: `tools/textures/EarthImagerySource.d.ts`, `tools/textures/bmngQuadrantSource.ts`, `tools/textures/equirectFileSource.ts`

**Interfaces:**

- Produces (spec §3, verbatim):

```ts
export type EarthImagerySource = {
  readonly id: string;
  readonly attribution: string;
  readonly maxLevel: number;
  readonly coverage: ReadonlyArray<LonLatBounds>;
  readBox(box: LonLatBounds, widthPx: number, heightPx: number): Promise<Uint8Array | null>;
};
```

- Consumes: `LonLatBounds` from `src/@types/scene/LonLatBounds.d.ts` (Task 1).

Both existing sources cover the whole globe today (BMNG's eight quadrants tile it, the equirect file is a whole-globe raster), so both declare `coverage: [{ west: -180, south: -90, east: 180, north: 90 }]` — a one-line addition to each return object, not new behavior. No new tests: the compiler enforces the required field at every `EarthImagerySource`-returning call site, and a wrong literal has no runtime consequence yet (nothing reads `coverage` until Task 4).

- [x] Add `coverage: ReadonlyArray<LonLatBounds>` to `EarthImagerySource.d.ts`, replacing the optional-or-absent convention the spec's §3 rationale describes.
- [x] Add the world-bounds literal to `bmngQuadrantSource.ts`'s returned object (`tools/textures/bmngQuadrantSource.ts:204-241`) and `equirectFileSource.ts`'s returned object (`tools/textures/equirectFileSource.ts:46-77`).
- [x] `npm run typecheck` — clean; this is the whole verification (a missing `coverage` field on either source is a compile error).
- [x] Commit:

```
git commit -m "$(cat <<'EOF'
refactor(textures): require EarthImagerySource.coverage

BMNG's two sources declare the world explicitly instead of relying on
an absent-means-global convention, so a bake writes manifest entries
mechanically from the source's own claim (spec §3).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 (prep): `EarthTileManifest` reshape — band-list `levels`, per-band provenance

**Files:**

- Create: `src/@types/scene/EarthTileProvenance.d.ts`
- Modify: `src/@types/scene/EarthTileManifest.d.ts`, `src/utils/scene/fetchEarthTileManifest.ts` (if its validation needs updating — see below), `src/services/engine/subsystems/earthTileSubsystem.ts` (`derivePlannerParams`, `earthTileSubsystem.ts:110-131`)
- Test: `tests/utils/scene/fetchEarthTileManifest.test.ts` (modify), `tests/services/engine/subsystems/earthTileSubsystem.test.ts` (modify — fixture shape only)

**Interfaces:**

- Produces (spec §3, verbatim):

```ts
// src/@types/scene/EarthTileProvenance.d.ts
export type EarthTileProvenance = {
  readonly sourceId: string;
  readonly attribution: string;
  readonly vintage: string;
};

// src/@types/scene/EarthTileManifest.d.ts
export type EarthTileManifest = {
  readonly prefix: string;
  readonly tilePx: number;
  readonly levels: Partial<
    Record<
      EarthTileKind,
      ReadonlyArray<{
        readonly bounds: LonLatBounds;
        readonly min: number;
        readonly max: number;
        readonly builtFrom: EarthTileProvenance;
      }>
    >
  >;
  // top-level `builtFrom` DELETED
};
```

- Consumes: `LonLatBounds` (Task 1), `EarthTileKind` (unchanged).

This task's `derivePlannerParams` change is scoped narrowly: it must read the new band-list `levels` shape without throwing, but it may still reduce internally to the scalar `minTileLevel`/`maxTileLevel` it returns today — the full band-aware `EarthTilePlannerParams.bands` reshape is Task 5. With exactly one world-spanning band, `{min: entry.min, max: entry.max}` off that single entry is an *exact* reduction (spec §2's verification claim), so this task's internal change is a one-line "read `levels.surface[0]` instead of `levels.surface`" — not a behavior change, just a shape adaptation.

- [x] Add `EarthTileProvenance.d.ts` — one type, three required `string` fields.
- [x] Rewrite `EarthTileManifest.d.ts`'s `levels` field to the band-list shape above; delete the top-level `builtFrom` field entirely (module header comment needs updating too — it currently documents `levels`/`builtFrom` as parallel `Partial<Record>`s, which is no longer true).
- [x] **Test: `fetchEarthTileManifest` collapses a v1-shaped manifest to `null`.** Add a case to `tests/utils/scene/fetchEarthTileManifest.test.ts` alongside the existing "no prefix" / "empty prefix" cases (`fetchEarthTileManifest.test.ts:36-52`): a manifest with a valid non-empty `prefix` but v1-shaped `levels` (`{ surface: { min: 4, max: 6 } }` — a bare object, not an array) must resolve to `null`, not throw and not be returned as-is. Name it `'returns null for a v1-shaped (pre-band-list) manifest'`.
- [x] Check whether `fetchEarthTileManifest.ts`'s current validation (`fetchEarthTileManifest.ts:17-30`, which only checks `prefix`) already satisfies this test as a side effect of TypeScript's structural typing being bypassed by `as EarthTileManifest` at the JSON-parse boundary — it will not, since nothing currently inspects `levels` shape at runtime. Add a runtime check: `Array.isArray(parsed.levels?.surface ?? [])` is not enough on its own (an absent `surface` key is legitimately valid — see Task 4/8's staged rollout); the check needs to positively reject the case where `levels.surface` *exists* but is not an array. Fold that into the existing `if` alongside the prefix check, still collapsing to `null`.
- [x] Update `derivePlannerParams` (`earthTileSubsystem.ts:110-131`) to read `fetched.levels?.[TILED_KIND]?.[0]` in place of `fetched.levels?.[TILED_KIND]` (one world band, so index 0 is exact for now — Task 5 replaces this whole function's body).
- [x] Update `earthTileSubsystem.test.ts`'s `surfaceManifest()` fixture helper (`earthTileSubsystem.test.ts:56-62`) to the new array-of-bands shape: `levels: { surface: [{ bounds: WORLD_BOUNDS, min: MIN_TILE_LEVEL, max: MIN_TILE_LEVEL + 1, builtFrom: { sourceId: 'test', attribution: 'test', vintage: 'test' } }] }`, dropping the deleted top-level `builtFrom`. Existing assertions in that file (`earthTileSubsystem.test.ts:84-113` and onward) should pass unmodified once the fixture shape matches — they assert on `plannerParams()`'s *output*, which Task 3 does not change.
- [x] `npm run typecheck` — clean.
- [x] `npm test -- fetchEarthTileManifest earthTileSubsystem` — green.
- [x] Commit:

```
git commit -m "$(cat <<'EOF'
refactor(scene): reshape EarthTileManifest.levels to a band list

BMNG becomes the sole entry in levels.surface; top-level builtFrom
folds into a per-band EarthTileProvenance (spec §3). derivePlannerParams
reads the one-entry array; the full band-aware reshape is a later task.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 (prep): `buildEarthTiles` — band-list `bakeAll`

**Files:**

- Modify: `tools/textures/buildEarthTiles.ts`
- Test: `tests/tools/textures/buildEarthTiles.test.ts` (modify — add a `bakeAll` describe block; existing `bakeCoarserLevel` tests untouched, since that function's signature and behavior don't change)

**Interfaces:**

- Produces (spec §3/§4, verbatim signature):

```ts
export async function bakeAll(
  bands: ReadonlyArray<{ readonly source: EarthImagerySource; readonly minLevel: number }>,
  outDir: string,
): Promise<void>;
```

- Consumes: `EarthImagerySource` (with required `coverage`, Task 2), `EarthTileManifest`'s band-list `levels` (Task 3), `bakeDeepestLevel`/`bakeCoarserLevel` (unchanged, `buildEarthTiles.ts:121-224`).
- Produces (module-level, still exported): `TILE_PREFIX` — **stays `earth-tiles/v1` in this task.** The bump to `v2` is Task 8's, so this prep bake stays byte-comparable to the pre-prep bake.

`bakeAll` replaces `buildEarthTiles` (`buildEarthTiles.ts:227-273`) as the tool's public entry point: same deepest-then-coarser bake per band (unchanged helper functions), but looping over `bands` and writing **one** `index.txt` (all bands' tiles, still sorted) and **one** `manifest.json` (`levels.surface` with one entry per band, in band order, each entry's `bounds`/`min`/`max`/`builtFrom` built mechanically from `band.source.coverage[...]`/`band.minLevel`/`band.source.maxLevel`/`band.source.id`/`band.source.attribution` — no hand-typed bbox literal in the tool). A source with multiple `coverage` boxes (not exercised by BMNG's single world box, but per spec §2's antimeridian-splitting rationale) contributes one manifest entry per coverage box, all sharing that band's `min`/`max`/`builtFrom`.

`main()`'s `devSource()`/`deepSource()` call sites (`buildEarthTiles.ts:296-311`) become `bakeAll([{ source: await (dev ? devSource() : deepSource()), minLevel: BAKE_MIN_LEVEL }], outDir)` — still one band, BMNG only, in this task.

- [x] **Test: `bakeAll` with two stub sources writes two entries in band order.** Following the existing file's idiom (temp dirs via `tmpDir()`, synthetic single-colour tiles via `sharp({create: ...})` — see `writeChild`/`expectPixelNear` at `buildEarthTiles.test.ts:24-68` for the pattern, though `bakeAll` needs its own minimal stub `EarthImagerySource`s rather than pre-written child tiles since it drives `readBox` itself). Two stub sources, each covering a small disjoint 1-tile-wide box at a shallow level (keep the fixture's level range tiny — e.g. `minLevel = maxLevel` per band, one tile each — so the test doesn't bake a real pyramid depth). Assert: `manifest.json`'s `levels.surface` has exactly two entries, in the same order the `bands` array was given, each entry's `bounds`/`builtFrom.sourceId` matching its stub source; `index.txt` lists tiles from both sources.
- [x] Implement `bakeAll`, keeping `bakeDeepestLevel`/`bakeCoarserLevel` untouched — only the level-range/manifest bookkeeping moves from one source to a loop over bands.
- [x] Update `main()` to call `bakeAll` with the single BMNG band, `TILE_PREFIX` still `v1`.
- [x] `npm run typecheck` — clean.
- [x] `npm test -- buildEarthTiles` — green.
- [x] **Verification that prep changed nothing observable:** run `npm run build-earth-tiles -- --dev` before this task's changes (capture a copy of `public/data/images/earth-tiles/` — it's in main's checkout via the worktree symlink, so `cp -r` it aside first) and after; diff the two. Tile bytes and `index.txt` must be byte-identical; only `manifest.json`'s shape differs (band-list `levels.surface` with one BMNG entry vs. the old scalar shape) while its *content* (min/max/source id/attribution) is equivalent. Note the diff result in the commit body.
- [x] Commit:

```
git commit -m "$(cat <<'EOF'
refactor(textures): reshape buildEarthTiles to band-list bakeAll

Loops over bands instead of one source; one index.txt/manifest.json
per invocation, one levels.surface entry per (band x coverage box),
built mechanically from source.coverage/id/attribution (spec §3/§4).
TILE_PREFIX stays v1 — the bump lands with the EOX band (Task 8).
Verified: tile bytes and index.txt byte-identical to the pre-refactor
--dev bake.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 (prep): planner band predicates

**Files:**

- Create: `src/utils/scene/earthTileBandRefineAllowed.ts`, `src/utils/scene/earthTileBandRequestAllowed.ts`
- Modify: `src/@types/scene/EarthTilePlannerParams.d.ts`, `src/utils/scene/planEarthTiles.ts` (`:166-185`), `src/services/engine/subsystems/earthTileSubsystem.ts` (`derivePlannerParams`, `:110-131`, and its call site's `refreshParams`)
- Test: `tests/utils/scene/earthTileBandRefineAllowed.test.ts` (new), `tests/utils/scene/earthTileBandRequestAllowed.test.ts` (new), `tests/utils/scene/planEarthTiles.test.ts` (modify only if a fixture needs updating — see below), `tests/services/engine/subsystems/earthTileSubsystem.test.ts` (modify — `plannerParams()`'s return shape gains `bands`, loses `minTileLevel`/`maxTileLevel`)

**Interfaces:**

- Produces (spec §3, verbatim — **two files**, not the spec's one-file sketch, per the one-symbol-per-file convention which the spec itself flags as the implementer's call):

```ts
// src/@types/scene/EarthTilePlannerParams.d.ts
export type EarthTileBand = {
  readonly uBounds: readonly [number, number]; // bounds.west/east, converted once
  readonly vBounds: readonly [number, number]; // bounds.south/north, converted once
  readonly min: number;
  readonly max: number;
};

export type EarthTilePlannerParams = {
  readonly kind: EarthTileKind;
  readonly tilePx: number;
  readonly baseLevel: number;
  readonly bands: readonly EarthTileBand[]; // replaces minTileLevel/maxTileLevel
  readonly windowSide: number;
  readonly lodBias: number;
};

// src/utils/scene/earthTileBandRefineAllowed.ts
export function earthTileBandRefineAllowed(
  bands: readonly EarthTileBand[],
  z: number,
  uv: { readonly u0: number; readonly u1: number; readonly v0: number; readonly v1: number },
): boolean; // "does any overlapping band permit deeper than z?"

// src/utils/scene/earthTileBandRequestAllowed.ts
export function earthTileBandRequestAllowed(
  bands: readonly EarthTileBand[],
  z: number,
  uv: { readonly u0: number; readonly u1: number; readonly v0: number; readonly v1: number },
): boolean; // "does any overlapping band contain z?"
```

- Consumes: the tile-walk's own `(u0, u1, vNorth, vSouth)` per node, already computed at `planEarthTiles.ts:105-109`.

`derivePlannerParams` converts `LonLatBounds` → `uBounds`/`vBounds` once per band, outside the per-frame walk. The conversion (not in the spec's snippet, so stated here as the contract the implementer must hit): `uBounds = [(bounds.west + 180) / 360, (bounds.east + 180) / 360]`; `vBounds = [(bounds.south + 90) / 180, (bounds.north + 90) / 180]` — this matches the mesh's south-first `v` convention (`v = 0` at the south pole) that `earthTilePath`'s `1 - v` flip and `tileBox`'s inverse already encode elsewhere in this codebase (see `buildEarthTiles.ts:83-96`'s `tileBox` for the inverse direction of the same mapping).

`planEarthTiles.ts:170` (`if (required > z && z < maxTileLevel)`) and `:184` (`if (z < minTileLevel) continue`) become:

```ts
if (earthTileBandRefineAllowed(bands, z, { u0, u1, v0: vSouth, v1: vNorth }) && z < <overall max>) { ... }
```

and

```ts
if (!earthTileBandRequestAllowed(bands, z, { u0, u1, v0: vSouth, v1: vNorth })) continue;
```

— note `planEarthTiles`'s local `vNorth`/`vSouth` naming (mesh-`v`-increases-north) maps to the predicate's `v0`/`v1` as `v0 = min = vSouth`, `v1 = max = vNorth`; get this backwards and every band-overlap test silently inverts. `maxTileLevel`'s role in the refine clamp (the overall `z < maxTileLevel` half of the `&&`) becomes "the deepest `max` across all bands," derived once in `derivePlannerParams` alongside `bands`, since the walk still needs *some* global depth ceiling to stop descending past every band's deepest level.

- [x] **Test `earthTileBandRefineAllowed`, single band overlap.** One band whose `uBounds`/`vBounds` fully contain a query `uv` at `z < band.max`: returns `true`. The same band, query `uv` at `z >= band.max`: returns `false`.
- [x] **Test `earthTileBandRefineAllowed`/`earthTileBandRequestAllowed`, two disjoint bands (Copenhagen case).** A world band (`min: 3, max: 7`) plus a small regional band (`min: 8, max: 13`) at a disjoint `uv`. Query `uv` inside the regional band's box at `z = 10`: `earthTileBandRefineAllowed` is `true` (regional band permits deeper); query the same `z = 10` at a `uv` *outside* the regional box (world band only): `earthTileBandRefineAllowed` is `false` (world band's `max` is 7). This is the load-bearing case — it's what makes "deep band only allows refinement inside its bbox" true.
- [x] **Test antimeridian pair.** Two band entries both with `min`/`max` describing one logical region split at 180° (one `uBounds` ending at `u=1`, one starting at `u=0`), and a query `uv` straddling the seam. Assert both `earthTileBandRefineAllowed`/`earthTileBandRequestAllowed` see it as covered by *one* of the two entries (whichever side the query's `u` range actually overlaps) — this proves the "one `LonLatBounds` per band entry, region crossing 180° is two entries" architecture (spec §2) actually works at the predicate level, not just at the manifest-shape level.
- [x] **Test degenerate single-world-band reproduces prior scalar behavior.** Reuse `planEarthTiles.test.ts`'s existing fixtures unmodified (do not add new assertions to that file for this — the fact that its existing test suite still passes *is* the proof, per the spec's own framing). If `nadirAt()`'s fixture (`planEarthTiles.test.ts:49-76`) still passes `minTileLevel`/`maxTileLevel` directly, update it (and the `planEarthTiles` call signature) to pass a single `bands: [{ uBounds: [0, 1], vBounds: [0, 1], min: MIN_TILE_LEVEL, max: 13 }]` in their place, changing nothing about what values it asserts.
- [x] Implement both predicate files. Overlap test: `uv.u1 > band.uBounds[0] && uv.u0 < band.uBounds[1] && uv.v1 > band.vBounds[0] && uv.v0 < band.vBounds[1]` (standard AABB overlap, open intervals so an edge-touching tile still counts as adjacent-not-overlapping the way `planEarthTiles`'s own window-overlap test at `planEarthTiles.ts:211-219` treats edges — verify against that existing convention rather than inventing a new one).
- [x] Update `EarthTilePlannerParams.d.ts` to the `bands: readonly EarthTileBand[]` shape; delete `minTileLevel`/`maxTileLevel`.
- [x] Update `planEarthTiles.ts`'s two call sites per the sketch above; update its own function-signature JSDoc/type accordingly (it currently documents `minTileLevel`/`maxTileLevel` at `planEarthTiles.ts:42-46`).
- [x] Rewrite `derivePlannerParams` (`earthTileSubsystem.ts:110-131`) to build `bands` from `fetched.levels?.[TILED_KIND]` (now a real array, every entry converted via the u/v formula above), still gated on `tilePx === EARTH_TILE_PX` and `levels` being present/non-empty; the `baseLevel + 1` floor logic (today's `Math.max(levels.min, baseLevel + 1)`) becomes a per-band `min` floor: each band's effective `min` is `Math.max(band.min, baseLevel + 1)`, so a band whose stated `min` is at or shallower than the base is clamped up per-band rather than globally.
- [x] Update `earthTileSubsystem.test.ts`'s manifest fixtures and any assertions reading `params.minTileLevel`/`maxTileLevel` to read `params.bands[0].min`/`.max` instead.
- [x] `npm run typecheck` — clean.
- [x] `npm test -- earthTileBandRefineAllowed earthTileBandRequestAllowed planEarthTiles earthTileSubsystem` — green.
- [x] Commit:

```
git commit -m "$(cat <<'EOF'
refactor(scene): band-list predicates replace planEarthTiles' scalar clamps

earthTileBandRefineAllowed/earthTileBandRequestAllowed (one file each,
per the one-symbol-per-file convention) test overlap against a band
list instead of comparing z against minTileLevel/maxTileLevel.
derivePlannerParams converts LonLatBounds -> u/v once per band, outside
the per-frame walk. A single world-spanning band reproduces today's
scalar clamp exactly (existing planEarthTiles tests pass unmodified).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 (feature): `tools/fetch/fetchEoxTiles.ts`

**Files:**

- Create: `tools/fetch/fetchEoxTiles.ts`, `data/raw/eox/README.md`
- Modify: `tools/utils/io/rawDataRegistry.ts`, `package.json` (add a `fetch-eox` script alongside the existing `fetch-*` entries at `package.json:68-76`)
- Test: `tests/tools/fetch/fetchEoxTiles.test.ts` (new)

**Interfaces:**

- Produces (pure, testable pieces — the spec doesn't pin exact names, so these are this plan's contract):

```ts
/** Every (row, col) tile index a bbox at level z touches, in the WGS84 TMS
 *  grid (row-before-col in the URL path; 2^(z+1) columns x 2^z rows). */
export function eoxTileIndicesForBbox(
  bbox: { readonly west: number; readonly south: number; readonly east: number; readonly north: number },
  z: number,
): ReadonlyArray<{ readonly row: number; readonly col: number }>;

/** Classifies one fetch response by its Content-Type, without touching the
 *  network — the pure half of the "abort on non-image" guard (spec §4). */
export function eoxResponseIsImage(contentType: string | null): boolean;
```

- Consumes: `RangeTransport`-adjacent retry shape from `fetchDesi.ts` — not its exact type (EOX fetches whole tiles, no `Range:`), but its `isRetryable`/`fetchChunkWithRetry` backoff *pattern* (`fetchDesi.ts:167-197`): exponential backoff `baseDelayMs · 2^attempt`, retry on status-less (network) or 429/503/5xx, rethrow immediately on anything else.
- Produces: `RAW_DATA['eox.dir']` entry (`kind: 'directory'`, `source: 'gitignored'`, `fetcher: 'tools/fetch/fetchEoxTiles.ts'`), consumed by Task 7's `eoxTileSource({ coverageDir: rawDataPath('eox.dir') })`.

URL shape (spec §4, verbatim — **`TileRow` before `TileCol`**, this ordering is load-bearing and easy to get backwards since most XYZ tile schemes go col-then-row):

```
https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless/default/WGS84/{z}/{row}/{col}.jpg
```

WGS84 TMS grid: z0 is 2 columns × 1 row, doubling per level — `columns(z) = 2 ** (z + 1)`, `rows(z) = 2 ** z`. This is the *same* ladder as skymap's own `earthTileColumns` (`src/utils/scene/earthTileColumns.ts`, `(512 << z) / tilePx` at `tilePx = 256`, since EOX serves 256 px tiles) — verify this identity holds for `z = 13` before writing the enumeration loop (`earthTileColumns(13, 256)` should equal `eoxTileIndicesForBbox`'s column count), since it's what lets Task 7 composite EOX tiles straight into skymap's grid with no re-numbering.

- [x] **Test `eoxTileIndicesForBbox`: enumerates the correct row/col range for a small bbox at z13.** Hand-compute the expected row/col range for the Copenhagen bbox (`{ west: 12.4, south: 55.5, east: 12.9, north: 55.8 }`) against the WGS84 z13 grid (`columns = 2^14 = 16384`, `rows = 2^13 = 8192`) and assert the returned set matches — this is the "~276 tiles" figure the spec cites (spec §4), so the count is a good sanity assertion too (`toHaveLength` in the same ballpark, not an exact restatement of an arbitrary literal — assert the hand-computed row/col bounds, and let the count fall out of that).
- [x] **Test `eoxTileIndicesForBbox`: row-before-col grid, not col-before-row.** A bbox whose row range and column range are distinguishable (different widths) — assert the function doesn't silently transpose them (a mirror bug here would enumerate the *right number* of tiles at the *wrong* coordinates, invisible until the harvest produces a scrambled patch).
- [x] **Test `eoxResponseIsImage`.** `'image/jpeg'` → `true`; `'text/html; charset=utf-8'` → `false`; `null` → `false`. This is the pure half of spec §4's "non-image response aborts loudly" rule — the fetcher's network loop calls it and throws when it returns `false`, but the loop itself isn't unit-tested (no network in tests, per `testing.md`).
- [x] **Test the backoff/retry shape**, modeled on `tests/tools/fetch/fetchDesi.test.ts`'s pattern (mock `delay` per that file's `vi.mock('../../../tools/utils/async/delay', ...)` idiom at `fetchDesi.test.ts:11-14`, assert `delay` was called with the exponential sequence on a retryable failure, and that a non-retryable status rethrows without calling `delay`).
- [x] **Test resume-by-file-existence**: given a tile path that already exists on disk, the harvester's per-tile fetch step is skipped (assert the injected transport/fetch function was never called for that index) — no chunk-state sidecar, unlike `fetchDesi`'s.
- [x] Implement `eoxTileIndicesForBbox`, `eoxResponseIsImage`, and the CLI (`bbox` args + `--level` defaulting to `13`, per spec §4) driving them with a throttled (~2 req/s) worker loop over `eoxTileIndicesForBbox`'s output, writing each tile to `data/raw/eox/<z>/<row>/<col>.jpg`. A non-image response throws and stops the run (spec §4's inversion of `fetchEarthTileBitmap.ts:36-38`'s silent-miss convention — the *fetcher* must not treat a throttled HTML redirect as a miss).
- [x] Add the `'eox.dir'` registry entry (model on `hyperleda.designations-dir` at `tools/utils/io/rawDataRegistry.ts:96-101` for the `kind: 'directory'`/`fetcher` shape): `path: 'data/raw/eox'`, `kind: 'directory'`, `source: 'gitignored'`, `description` naming the s2cloudless 2016 harvest, `fetcher: 'tools/fetch/fetchEoxTiles.ts'`.
- [x] Write `data/raw/eox/README.md` per `docs/DATA.md`'s "Adding a new raw data source" step 5: upstream URL, tile-index convention (row-before-col, WGS84 TMS, z13 only — coarser levels derived at bake time), fetch date, licence (CC BY 4.0, s2cloudless 2016 layer only, per this plan's Global Constraints).
- [x] Add `"fetch-eox": "tsx tools/fetch/fetchEoxTiles.ts"` to `package.json`, in the `fetch-*` block.
- [x] `npm run typecheck` — clean.
- [x] `npm test -- fetchEoxTiles` — green.
- [x] Commit:

```
git commit -m "$(cat <<'EOF'
feat(fetch): add fetchEoxTiles for the EOX s2cloudless 2016 harvest

z13-only WMTS harvester (row-before-col URL order, ~2 req/s throttle,
exponential backoff modeled on fetchDesi.ts, resume-by-file-existence,
throws on a non-image response instead of writing HTML as .jpg).
Registered as eox.dir in rawDataRegistry.ts. No network run yet — that
is the user-gated Task 9.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 (feature): `tools/textures/eoxTileSource.ts`

**Files:**

- Create: `tools/textures/eoxTileSource.ts`
- Test: `tests/tools/textures/eoxTileSource.test.ts` (new)

**Interfaces:**

- Produces (spec §4, verbatim):

```ts
export async function eoxTileSource(opts: {
  readonly coverageDir: string; // rawDataPath('eox.dir')
}): Promise<EarthImagerySource>;
```

- Consumes: `EarthImagerySource` (Task 2), the harvested `<z>/<row>/<col>.jpg` files on disk under `coverageDir` (Task 6's output shape).
- Produces: an `EarthImagerySource` consumed by Task 8's bake invocation.

`readBox` composites the four 256 px EOX z13 tiles under one 512 px bake tile — 2×2 at the **same** z (EOX's ladder already equals skymap's own at `tilePx = 256`, per Task 6's identity check), using the identical per-child-shrink-then-composite pipeline `bakeCoarserLevel` uses and for the identical libvips reason (`buildEarthTiles.ts:150-160`'s composite-order landmine — compositing before resizing is a correctness requirement here too, not style, since this function is doing the same "children on disk → one parent raster" operation `bakeCoarserLevel` does, just across sources instead of across levels). `coverage` is derived from what's actually on disk under `coverageDir` (scan the harvested `<z>/<row>/<col>.jpg` tree, compute the bounding row/col range, convert back to a `LonLatBounds` — the inverse of Task 6's `eoxTileIndicesForBbox`) — **not** a hand-typed bbox, so a harvest that falls short of the requested bbox edge shrinks the manifest entry instead of silently claiming ground it doesn't have. `maxLevel` is `13`. Returns `null` for any `readBox` call whose box falls outside `coverage` or whose four constituent EOX tiles aren't all present on disk (same "a decline emits no tile" contract every other source honours, letting `bakeDeepestLevel`'s existing `buildEarthTiles.ts:118-119,134` branch handle it unmodified).

Provenance constants, verbatim from spec §4:

```ts
{
  sourceId: 'eox-s2cloudless-2016',
  attribution:
    'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH ' +
    '(Contains modified Copernicus Sentinel data 2016) released under ' +
    'Creative Commons Attribution 4.0 International License.',
  vintage: '2016',
}
```

- [x] **Test: composite arithmetic with stub tile files.** Following `bakeCoarserLevel`'s test idiom (`buildEarthTiles.test.ts:24-113` — solid-colour children, `pixelAt`/`expectPixelNear` helpers), write four 256 px solid-colour stub `.jpg` files at `<coverageDir>/13/<row>/<col>.jpg` for one 512 px bake tile's four EOX children, call `readBox` for the corresponding `LonLatBounds`, and assert each quadrant of the returned 512 px raster carries its own child's colour (reuse the NW/NE/SW/SE quadrant-sampling pattern from `buildEarthTiles.test.ts:89-113`).
- [x] **Test: `readBox` returns `null` outside coverage.** With only a small set of stub tiles on disk, a box entirely outside their range returns `null`.
- [x] **Test: coverage-from-disk bbox derivation.** Given a stub tile tree spanning a known row/col rectangle at z13, assert `(await eoxTileSource(...)).coverage` is the `LonLatBounds` that rectangle converts to — hand-computed from the WGS84 z13 grid formula, not re-derived via the same code path the source itself uses (a mirror per `testing.md` would prove nothing).
- [x] Implement `eoxTileSource`: scan `coverageDir` for the on-disk row/col range at startup, derive `coverage` and stash it; `readBox` maps the requested `LonLatBounds` to the 2×2 EOX z13 tile indices it needs (inverse of `eoxTileIndicesForBbox`'s per-tile bbox math), reads each with `sharp`, shrinks each to 256 px (already native size — a resize here would only be a no-op/identity unless a future harvest changes tile size, so this may be a direct read with no resize, per-child, still composited via `.composite()` never `.resize()`-after-`.composite()`), composites into the 512 px output, `ensureAlpha()`, returns the raw RGBA buffer. Missing quadrant(s) → `null` (matching `EarthImagerySource`'s decline contract — no partial-tile output, unlike `bakeCoarserLevel`'s "missing quadrants transparent" rule, since a *source* declining is different from a *bake* tolerating coastal gaps).
- [x] `npm run typecheck` — clean.
- [x] `npm test -- eoxTileSource` — green.
- [x] Commit:

```
git commit -m "$(cat <<'EOF'
feat(textures): add eoxTileSource, a 2x2-composited EarthImagerySource

Reads EOX s2cloudless 2016 z13 harvest tiles off disk (eox.dir),
composites four 256px children into one 512px bake tile via the same
shrink-then-composite pipeline bakeCoarserLevel uses. coverage is
derived from what's actually on disk, not hand-typed. maxLevel 13.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 (feature): wire the EOX band into the bake, bump `TILE_PREFIX`, document

**Files:**

- Modify: `tools/textures/buildEarthTiles.ts` (`main()`, `TILE_PREFIX` at `buildEarthTiles.ts:81`), `ATTRIBUTIONS.md` (near line 330, alongside the existing Blue Marble entries)

**Interfaces:**

- Consumes: `bakeAll` (Task 4), `eoxTileSource` (Task 7), `rawDataPath('eox.dir')` (Task 6).

`main()`'s `deepSource()`-only path becomes a two-band `bakeAll` call for the production (non-`--dev`) case:

```ts
await bakeAll(
  [
    { source: await deepSource(), minLevel: BAKE_MIN_LEVEL },
    { source: await eoxTileSource({ coverageDir: rawDataPath('eox.dir') }), minLevel: 8 },
  ],
  outDir,
);
```

The `--dev` path (`devSource()`, whole-globe equirect, no EOX) stays single-band — the EOX band needs the real harvest on disk, which `--dev` explicitly opts out of (per its existing docstring at `buildEarthTiles.ts:290-295`, "an explicit flag rather than a silent fallback"). `TILE_PREFIX` bumps `earth-tiles/v1` → `earth-tiles/v2` (`buildEarthTiles.ts:81`) — the module's own versioning rule (tiles serve `immutable`, so a shape change needs new keys). EOX's `minLevel: 8` is explicit, not derived from `BAKE_MIN_LEVEL` (spec §3's rationale: the regional band's floor is "one level deeper than the global band's own max," 7 + 1 = 8, a different rule than the whole-globe band's tier-derived floor).

- [x] Update `main()`'s production branch to the two-band `bakeAll` call above.
- [x] Bump `TILE_PREFIX` to `earth-tiles/v2`.
- [x] Add the EOX subsection to `ATTRIBUTIONS.md` under "NASA — Earth & Moon imagery" (near `ATTRIBUTIONS.md:330`, alongside the existing Blue Marble bullet list at `ATTRIBUTIONS.md:328-345`): **EOX IT Services — EOxCloudless (Sentinel-2)**, carrying the attribution string verbatim from Task 7's constants, noting CC BY 4.0 and the 2016-layer-only rule.
- [x] **No new test.** Task 4's `bakeAll` two-band test already covers "two bands in one invocation write two `levels.surface` entries" — this task only changes which two sources `main()` passes, which is a CLI wiring concern with no independent pure-function surface to test (same "no test — GPU/CLI wiring" reasoning the completed virtual-texture plan applied throughout its Phase B, e.g. `docs/superpowers/plans/completed/2026-07-29-earth-surface-virtual-texture-a-to-d.md` task B2).
- [x] `npm run typecheck` — clean.
- [x] `npm test` — full suite green (confirms nothing downstream of `TILE_PREFIX`/`main()` broke).
- [x] Commit:

```
git commit -m "$(cat <<'EOF'
feat(textures): wire the EOX Copenhagen band into buildEarthTiles

Production bake is now two bands: BMNG world (unchanged floor) and
EOX Copenhagen z8-13 (minLevel 8 — one level deeper than BMNG's own
max, not tier-derived). TILE_PREFIX bumps v1 -> v2 (new pixel shape,
served immutable, needs new keys). ATTRIBUTIONS.md gains the EOX
CC BY 4.0 credit. No real harvest or bake run yet (Task 9).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 (execution, USER-GATED): real harvest, real bake, visual pass

**Not a code task — no new files, no tests.** This is where the architecture built in Tasks 1–8 gets pointed at real data for the first time.

- [x] **Announce to the user before any network request leaves the machine**, and get an explicit go-ahead: the harvest is ~276 requests against `tiles.maps.eox.at` (spec §4's Copenhagen-patch estimate) at ~2 req/s, roughly 2–3 minutes, hitting a third-party service under its stated CC BY 4.0 / courtesy terms (spec §9 — no bulk-access email sent yet, this is a hand-picked-patch harvest, within the terms the spec's ground-preparation research already checked).
- [x] On go-ahead, run the harvest: `npm run fetch-eox -- --west 12.4 --south 55.5 --east 12.9 --north 55.8` (or whatever exact flag names Task 6 implemented — use its actual CLI, this is the Copenhagen bbox from spec §3). Confirm ~276 tiles landed under `data/raw/eox/13/`.
- [x] Run the real bake: `npm run build-earth-tiles` (no `--dev` — this is the production two-band path from Task 8). Confirm it emits both BMNG (`z3`–`z7`) and EOX (`z8`–`z13` over Copenhagen) tiles under `public/data/images/earth-tiles/` (main checkout's directory, via the worktree symlink — this is intended), and that `manifest.json`'s `levels.surface` has two entries with `prefix: 'earth-tiles/v2'`.
- [x] **Stop here and hand off to the user for the dev-server visual pass** (spec §7): fly to Copenhagen and confirm EOX detail resolves at z8–z13 with no seam artifact worse than the accepted BMNG(2004)/Sentinel(2016) look jump (spec §6 — if it reads jarring rather than "you've zoomed into a sharper source," the named fallback is baking Copenhagen's z3–z7 from EOX too, a second manifest entry, not a code change); `EARTH_TILE_LOD_BIAS` reads sane at z12–z13 with no obvious over/under-refinement; flying anywhere outside the Copenhagen patch is visually unchanged from before this feature.
- [x] **Explicitly NOT in this task:** R2 sync. Record as a post-merge checklist item for whoever merges this branch: after merge, from the **main worktree only** (never from this worktree — worktrees don't own `data/`, per `project_worktree_data_isolation`), run `npm run sync-r2-secure` and verify the CDN serves `v2` tiles and the flipped manifest (spec §5's cache-skew note: up to a day of clients holding a stale `v1` manifest against a fresh bundle is accepted, not adapted for).
