# Earth RTC surface foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [x]`) syntax for tracking.

> **Prerequisite.** This plan executes on a fresh worktree branched from `main`
> **after PR #608 merges** (the spec + this branch's debug cockpit ride that PR).
> Do not start Task 1 against a worktree that predates #608 — the spec file this
> plan cites, and the `482facb7d`-era `SURFACE_STANDOFF_RADII`/`MIN_NEAR_MPC`
> values it depends on, must already be on `main`.

**Goal:** Move Earth's detail-tile geometry and per-tile addressing from the
shipped unit-sphere-plus-page-table representation to a receiver-centric
(camera-relative) one: a per-frame CPU quadtree cut over the existing tile
pyramid, static curved patch meshes baked per resident tile, and a
per-instance GPU path carrying `originRelCamMpc` — the same precision seam the
star catalog renderer ships. This dissolves the `f32` precision walls the
spec's §1 measures (a ~0.4 m camera-motion step, a ~2.4 m equirect-UV
quantum, a ~10 m ocean-glint cancellation) without touching the manifest,
band predicates, atlas/LRU residency, or fetch/bake pipeline underneath.

**Architecture:** One leading prep task (Task 1) extracts Earth's
twice-(soon-to-be-thrice-)derived per-frame frame into a single memoised
`prepareEarthFrame`, mirroring the shipped `prepareStarCut` pattern — pure
refactor, no behaviour change, landing before any RTC code exists. The
feature itself is then: a single pure cut walk, `cutSurfaceTiles`, that
**supersedes** `planEarthTiles` outright — one traversal producing both the
draw cut (`SurfaceCutTile[]` with CPU-resolved ancestor-fallback residency)
and the fetch-demand product `planEarthTiles` produced alone today, so the
tiles drawn and the tiles fetched can never desync the way two independent
per-frame walks over the same tree eventually would (Task 2); a pure
per-tile curved patch-mesh baker plus a CPU-side LRU cache of the baked
geometry (Task 3); a new instanced GPU renderer with a vertex-pulling
storage-buffer scheme (Task 4, since — see Task 4's note — the spec's
"mirror the star catalog renderer" instruction needs adapting: star
billboards are 3-vertex point sprites, tile patches are multi-vertex curved
meshes); integration that swaps the page-table draw for the instanced one,
retargets `earthTileSubsystem` onto `cutSurfaceTiles`'s fetch-demand
product, and deletes `buildEarthPageTable` and `planEarthTiles` from the
tile-detail path entirely (Task 5); and a verification gate (Task 6).

**Tech Stack:** TypeScript (Vite/Vitest), raw WebGPU + WGSL/WESL, `wgpu-matrix`
(`mat4d`) for the f64 compose-then-narrow seam.

**Spec:**
[docs/superpowers/specs/2026-08-20-earth-rtc-surface-camera-design.md](../specs/2026-08-20-earth-rtc-surface-camera-design.md)
— authoritative for the §9.2 grid-family ruling, the §3 type/GPU shapes, and
every decision this plan does not re-derive. This plan covers **Plan 1
(§2–§3) only**; Plan 2 (§4, surface navigation) is a separate plan authored
after this one lands.

## Global Constraints

Quoted verbatim from the spec, binding for every task below:

- **Perf-halt rule (spec §5):** "`npm run perf` measured before and after on
  every renderer/GPU-side change in Plan 1 … A neutral-or-negative
  measurement halts the landing pipeline per `feedback_code_is_liability` —
  land/park is the user's ruling."
- **Distance semantics untouched (spec §1 Goals):** "The tile-pyramid
  `(kind, z, x, y)` addressing, the manifest, the band predicates, the
  atlas/LRU residency machinery, and the fetch/bake pipeline are all
  **untouched** — this is a consumption-side (mesh + per-frame addressing)
  change, not a re-bake."
- **Earth-only scope (spec §1 Non-goals):** "Other bodies' migration … The
  Moon, Sun, and planets keep the current `composeBodyMvp` unit-sphere path.
  Nothing here changes their renderer, their MVP composition, or their
  camera behaviour."
- **Grid family (spec §9.2 ruling):** "The cut walk operates on the equirect
  pyramid's own `(z, x, y)` grid … `cubeSphereMesh` is NOT used for tile
  patches — it stays in service for the base globe only."
- **Base-globe fallback (spec §3.4 / §8):** "Every failure path (no
  manifest, no atlas, a 404 on every tile) lands on the picture Earth draws
  without it" — RTC must not regress this.

Plus the house-wide rules this plan inherits: `type` aliases never
`interface`; one exported symbol per file in `src/utils/` and `src/@types/`
(filename matches the export); any file move goes through `npm run
move-files`/`npm run refactor -- move`, never `git mv`; comment budget
(module header ≤ 10 lines, comment lines ≤ half the code lines); `npm run
typecheck` (both tsconfigs) and `npm test` stay green after every task; any
`.wesl` task instructs the executor to load the `wesl-shaders` skill first.

---

## Strategy

Task 1 is the ground-preparation item from the spec's §2 (P1), riding this
plan's PR as its leading commit(s), landing before any RTC code exists so a
reviewer can verify "nothing moved" independently of "RTC works." Tasks 2–4
build the three new pure/GPU pieces bottom-up (cut → mesh → GPU), each
independently testable without a real GPU device or the others. Task 5 wires
them into `runFrame`/`earthLayer`/`earthTileSubsystem`, swapping
`planEarthTiles` for `cutSurfaceTiles` at its one call site, and deletes
`buildEarthPageTable` and `planEarthTiles` from the tile-detail path. Task 6
is the measure-and-verify gate the perf-halt rule and the spec's §8 visual
checklist require.

## Definition of Done

- **Deliverable inventory:** `src/@types/scene/SurfaceCutTile.d.ts`,
  `src/@types/scene/SurfaceTileMesh.d.ts`, `src/utils/scene/cutSurfaceTiles.ts`,
  `src/utils/scene/bakeSurfaceTileMesh.ts`,
  `src/services/gpu/resources/surfaceTileMeshCache.ts`,
  `src/services/gpu/renderers/bodies/earthSurfaceTileRenderer.ts` +
  `earthSurfaceTileLayout.ts`, `src/services/gpu/shaders/bodies/earthSurfaceTile/{vertex,fragment,io}.wesl`,
  a `prepareEarthFrame` export on `earthLayer.ts`, `earthLayer` drawing both
  the base globe and the instanced detail tiles, `buildEarthPageTable.ts`
  deleted, `planEarthTiles.ts` + `tests/utils/scene/planEarthTiles.test.ts`
  deleted (superseded outright by `cutSurfaceTiles`, the one walk that now
  feeds both draw and fetch), `EarthTilePlan.d.ts` reshaped down to the
  fetch-demand fields (`zWin`, `requests`, `subCameraDirLocal` —
  `winX0`/`winY0` deleted with the page table they addressed),
  `earthTileSubsystem`'s page-table half deleted with a new residency-query
  method in its place.
- **Named observable behaviours for the manual smoke pass (Task 6, dev
  server):** the spec's §8 visual checklist — step-free camera motion and
  stable imagery down to ~2 m altitude; no blocky UV quantization at z15+;
  stable ocean glint below 10 m altitude; the base-globe fallback still
  renders correctly with no manifest / no atlas / a 404 on every tile; flying
  anywhere outside a tiled band is visually unchanged from before this
  feature.
- **The deferral boundary:** Plan 2 (cursor-directed zoom, cursor-anchored
  drag, surface-fixed follow) is not started here. The cut-planner/SSE
  frontier, synthetic super-resolution, GeoDanmark productionization, and
  other bodies' RTC migration are all explicitly out of scope per spec §6.

---

## Task 1 (prep): `prepareEarthFrame` — one derivation, three consumers

**Files:**

- Modify: `src/services/engine/frame/passes/earthLayer.ts` (add
  `PreparedEarthFrame` + `prepareEarthFrame`; rewrite `draw`/`drawPick` to
  consume it)
- Modify: `src/services/engine/frame/runFrame.ts` (tile-planning block,
  currently `runFrame.ts:578–626`)
- Test: `tests/services/engine/frame/passes/earthLayer.test.ts` (modify — see
  the ctx-freshness step below; this is load-bearing, not optional)

**Where the spec's line numbers have drifted:** the spec's §2 cites
`runFrame.ts` "around lines 592–612" and `earthLayer.ts`'s `draw` "around
lines 96–116." On this branch the tile-planning block is `runFrame.ts:578–626`
(the `camPosLocal`/`composeBodyMvp` calls at `:598–611`) and `earthLayer.draw`
is `earthLayer.ts:91–164` (the same two calls at `:99–116`) — close to the
spec's estimate, cited here as the accurate anchor.

**A correction to the spec's "third call site" framing.** The spec says
`earthLayer.drawPick` "independently calls `composeBodyMvp` off the same
slab today." Reading the actual code: `drawPick`
(`earthLayer.ts:170–188`) does **not** call `composeBodyMvp` itself — it
looks up `earthState` via its own `sceneBodyStates(state, ctx).get(earth.id)!`
call, then delegates entirely to `drawFlooredSpherePick`
(`src/services/engine/helpers/drawFlooredSpherePick.ts`), which internally
composes **its own** MVP and `camPosLocal` from a **floored** pick radius
(`minPickRadiusMpc`), not Earth's true equatorial radius. `prepareEarthFrame`
must not feed `drawPick` its `mvpLocal`/`camLocal` fields — those are composed
against the wrong radius for picking. `drawPick`'s genuine duplication with
the other two sites is narrower: it re-reads `earthState` and re-computes
`radiusMpc` from `earth.radiusKm * SCALE_UNITS.KM_TO_MPC`, exactly the same
`earthState`/`radiusMpc` the other two sites derive. `prepareEarthFrame`
removes that duplication; `drawFlooredSpherePick`'s own floored-radius
composition is untouched.

**Interfaces:**

```ts
// src/services/engine/frame/passes/earthLayer.ts (new exports)
export type PreparedEarthFrame = {
  readonly earthState: BodyState;
  readonly radiusMpc: number; // earth.radiusKm * SCALE_UNITS.KM_TO_MPC
  readonly mvpLocal: Float32Array; // composeBodyMvp(view.slab.vp, ...), full radius
  readonly camLocal: Vec3; // camPosLocal(view.camPos, ...), full radius
};

export function prepareEarthFrame(
  state: EngineState,
  ctx: ReadyFrameContext,
  view: SlabView,
): PreparedEarthFrame | null;
```

- Consumes: `sceneBodyStates(state, ctx)`, `composeBodyMvp`, `camPosLocal`
  (the same three utils each of the three sites already imports),
  `state.data.bodies.earth`.
- Returns `null` when `state.data.bodies.earth === null` — the same
  null-and-no-op contract all three call sites already implement locally.
- **Why `view` is a parameter, not derived internally via
  `slabViewOf(ctx, NEAR0)`:** `earthLayer.draw`/`drawPick` already receive
  `view: SlabView` as a `ContentLayer` parameter (the executor's own slab
  resolution) and must keep consuming exactly that reference — the existing
  `earthLayer.test.ts` fixtures build a `view` by hand and a bare `ctx` with
  no `.slabs` field, relying on `draw` never touching `ctx.slabs`. If
  `prepareEarthFrame` called `slabViewOf(ctx, NEAR0)` itself, every existing
  `draw` test would throw on the fixture's missing `.slabs`. `runFrame.ts`'s
  tile-planning block keeps its own `const view = slabViewOf(ctx, NEAR0);`
  (it already needs `view.viewportPx` for `planEarthTiles`, independent of
  this extraction) and passes `view` through.
- **Memoization:** `WeakMap<ReadyFrameContext, PreparedEarthFrame | null>`,
  mirroring `preparedByCtx` in
  `src/services/engine/frame/passes/starCatalogLayer.ts:644,656–662` exactly
  — computed at most once per `ctx` object, regardless of which of the three
  call sites reaches it first in a given frame. This is a documented
  precondition, not enforced by types: `view` must always be
  `slabViewOf(ctx, NEAR0)` for the same `ctx` the memo keys on (true at both
  real call sites).

**Placement decision (flagged — differs from the spec's file inventory):**
the spec's §7 file inventory lists a **new** file,
`src/services/engine/frame/passes/earthFrame.ts (or similar)`, for this
extraction. The shipped precedent it's modelled on —
`prepareStarCut` — instead lives inside the **same file** as the
`ContentLayer` it serves (`starCatalogLayer.ts`), not a sibling file. This
plan follows the shipped precedent over the spec's suggested new file: adding
`prepareEarthFrame` to `earthLayer.ts` keeps one file per body-layer instead
of splitting Earth's frame-derivation from its draw call, and `runFrame.ts`'s
import site (`import { prepareEarthFrame, earthLayer } from './passes/earthLayer';`)
mirrors its existing `import { prepareStarCut } from './passes/starCatalogLayer';`
byte-for-byte.

- [ ] Add `PreparedEarthFrame` + `prepareEarthFrame` to `earthLayer.ts`,
      computing exactly what `runFrame.ts:594–611` and `earthLayer.draw`'s
      own `:96–105,111–116` each compute today: `earthState =
      sceneBodyStates(state, ctx).get(earth.id)!`, `radiusMpc =
      earth.radiusKm * SCALE_UNITS.KM_TO_MPC`, `mvpLocal =
      composeBodyMvp(view.slab.vp, earthState.positionMpc,
      RENDER_ORIGIN_MPC, radiusMpc, earthState.orientation)`, `camLocal =
      camPosLocal(view.camPos, earthState.positionMpc, radiusMpc,
      earthState.orientation)`. Memoize per the WeakMap above.
- [ ] **Test `prepareEarthFrame returns null when bodies.earth is null`.**
- [ ] **Test `prepareEarthFrame composes mvpLocal from the slab f64 vp, not
      the f32 vp`** — mock `composeBodyMvp` (mirroring the existing
      `earthLayer.test.ts` mock at `:49–51`) and assert the first argument
      `toBe(view.slab.vp)` and `not.toBe(view.vp)`, the same load-bearing seam
      assertion the file already carries for `draw`.
- [ ] **Test `prepareEarthFrame memoizes per ctx`** — call it twice with the
      identical `ctx`/`view` pair; assert the second call returns the exact
      same object (`toBe`) and that the mocked `composeBodyMvp` was called
      exactly once across both calls.
- [ ] Rewire `earthLayer.draw` to call `prepareEarthFrame(state, ctx, view)`,
      destructure `{ earthState, radiusMpc, mvpLocal, camLocal }`, delete its
      own `sceneBodyStates`/`composeBodyMvp`/`camPosLocal` calls and the now-
      redundant `earth.radiusKm * SCALE_UNITS.KM_TO_MPC` recomputation at
      `:103,114`; no-op (return) when `prepareEarthFrame` returns `null`
      (replacing today's `earth === null` check, which stays as the renderer
      guard).
- [ ] Rewire `earthLayer.drawPick` to call `prepareEarthFrame(state, ctx,
      view)` for `earthState`/`radiusMpc` **only** — pass `prepared.earthState.positionMpc`,
      `radiusMpc`, and `prepared.earthState.orientation` into
      `drawFlooredSpherePick`'s existing argument shape unchanged. Do **not**
      feed `mvpLocal`/`camLocal` anywhere near `drawPick` — see the
      correction above.
- [ ] Rewire `runFrame.ts`'s tile-planning block (`:592–611`) to call
      `prepareEarthFrame(state, ctx, view)` in place of its own
      `sceneBodyStates`/`radiusMpc`/`camPosLocal`/`composeBodyMvp` calls,
      feeding `viewProjLocal: prepared.mvpLocal` and `camPosLocal:
      prepared.camLocal` into `planEarthTiles`'s existing argument shape. Skip
      the planning block when `prepareEarthFrame` returns `null` (the
      existing `earth !== null` guard one line up already gates this; keep
      both checks or fold them — implementer's call, behaviour is identical
      either way).
- [ ] **Required test-fixture fix (`earthLayer.test.ts`):** the file's
      `NEAR_CTX` is a single module-level constant (`makeCtx(...)`, called
      once at load time) reused by reference across many `it()` blocks,
      including three separate tests (`'draws the seeded earth …'`, `'packs
      sunDirLocal …'`, `'packs camPosLocal …'`) that each call
      `earthLayer.draw(PASS_STUB, view, NEAR_CTX, state)` exactly once and
      assert `expect(composeMock).toHaveBeenCalledTimes(1)`. With
      `prepareEarthFrame`'s ctx-keyed memo, the **second** and **third** of
      those three tests to run will hit the cache primed by the first
      (`NEAR_CTX` is the same object every time) and get **zero** calls to
      `composeBodyMvp`, failing their `toHaveBeenCalledTimes(1)` assertion —
      a real, mechanical test break this task introduces, not a hypothetical
      one. Fix: stop hoisting `NEAR_CTX` to a shared module constant; call
      `makeCtx(FOREGROUND_MAX_DISTANCE_MPC / 2)` fresh at each of those three
      tests' own call sites so each gets its own `ReadyFrameContext` object
      and its own cache entry. Leave every other use of `makeCtx`/`NEAR_CTX`
      alone (the debug-toggle test's two same-`NEAR_CTX` draws don't assert
      `composeMock` counts, and `earthLayer.enabled`'s tests never call
      `prepareEarthFrame` at all — `enabled` keeps its own separate,
      untouched `sceneBodyStates` read; see the note below).
- [ ] **Do not route `earthLayer.enabled` through `prepareEarthFrame`.**
      `enabled` (`earthLayer.ts:68–89`) only needs `earthState.positionMpc`
      for its distance/sub-pixel gates — it never needs `mvpLocal`/`camLocal`
      and is called with bare `ctx` fixtures that carry no `.slabs`
      (`CTX_STUB`, `makeCtx`'s return). Since `prepareEarthFrame` takes
      `view: SlabView` as an argument (not derived from `ctx.slabs`), this is
      not automatically a conflict — but `enabled` has no `view` parameter to
      pass (the `ContentLayer.enabled` signature is `(state, ctx)`, no
      `view`), so it cannot call `prepareEarthFrame` without inventing one.
      Leave `enabled`'s existing `sceneBodyStates(state, ctx).get(earth.id)!`
      call exactly as-is; this is a deliberate scope boundary, not an
      oversight.
- [ ] `npm run typecheck` — clean.
- [ ] `npm test -- earthLayer runFrame` — green.
- [ ] Commit (own commit, before Task 2's code exists):

```
refactor(engine): extract prepareEarthFrame, the shared Earth per-frame derivation

runFrame's tile-planning block and earthLayer.draw independently
recomputed Earth's local-frame MVP + camPosLocal from the same five
inputs; drawPick separately re-derived earthState/radiusMpc. One
prepareEarthFrame, memoised per ReadyFrameContext (mirrors
prepareStarCut), now serves all three call sites. Pure refactor —
earthLayer.test.ts's mocked composeBodyMvp assertions pin the output
unchanged; its NEAR_CTX fixture split into per-test contexts so the
new per-ctx memo doesn't collapse three independent draw assertions
into one live call.

Prep for docs/superpowers/specs/2026-08-20-earth-rtc-surface-camera-design.md
§2 (P1) — RTC's cut walk needs this same frame a third time, on the
seam this task creates rather than a fourth fork.
```

---

## Task 2: `SurfaceCutTile` + the single walk (`cutSurfaceTiles`), dual product

**Files:**

- Create: `src/@types/scene/SurfaceCutTile.d.ts`, `src/utils/scene/cutSurfaceTiles.ts`
- Test: `tests/utils/scene/cutSurfaceTiles.test.ts` (new — `planEarthTiles.test.ts`'s
  fixtures retarget here; see the test plan below)

**Ruling (binding, supersedes an earlier draft of this task): one walk, two
products — not a parallel walk.** An earlier version of this plan had
`cutSurfaceTiles` run beside a still-running `planEarthTiles`, each walking
the same tree with its own copy of the horizon/frustum/LOD-bias predicates,
on the theory that the spec's §7 "untouched" list protected
`planEarthTiles.ts` itself. Rereading that list: it names "`planEarthTiles.ts`'s
band predicates (`earthTileBandRefineAllowed`/`earthTileBandRequestAllowed`)"
— two separate files `planEarthTiles.ts` **imports**
(`src/utils/scene/earthTileBandRefineAllowed.ts`,
`earthTileBandRequestAllowed.ts`), not the walk itself. And the spec's §3.1
is explicit that the cut is the **same** walk, re-pointed: "reuses
`planEarthTiles`'s three tests verbatim in spirit … but instead of writing
an `EarthTilePlan` …, the walk's **leaves** become `SurfaceCutTile[]`." One
walk, redirected — not two.

Two independent per-frame quadtree walks over the same tile pyramid, each
carrying its own copy of the horizon/frustum/refine-vs-emit logic, have to
agree forever or the tiles drawn desync from the tiles fetched — exactly the
silent-desync class Task 1's `prepareEarthFrame` exists to eliminate one
level up (three call sites independently re-deriving the same per-frame
frame), reintroduced one level down if the walk itself forks in two. It also
doubles the per-frame CPU cost of the one thing this whole plan is trying to
make cheaper on the CPU. **`cutSurfaceTiles` supersedes `planEarthTiles`
outright**: it is `planEarthTiles`'s walk body — hoisted matrix scratch,
explicit stack, the five-way closure over `camDir`/`maxTileLevel`/`zWin`/etc.,
the horizon cull, the nine-sample frustum test with its near-plane-straddler
fallback, the refine-vs-emit decision via
`earthTileBandRefineAllowed`/`earthTileBandRequestAllowed` — **moved**, not
duplicated, into this file, with one addition at each leaf's emission point:
the CPU-resolved ancestor-fallback residency lookup that decides whether (and
how) that leaf becomes a `SurfaceCutTile`. `planEarthTiles.ts` has no
production caller once Task 5's `runFrame.ts` swap lands, and is deleted
there (not in this task — see Task 5); this task's job is to retarget its
test fixtures onto `cutSurfaceTiles` first, so the new walk is proven against
the same coverage before anything stops calling the old one.

**Interfaces:**

```ts
// src/@types/scene/SurfaceCutTile.d.ts — verbatim from spec §3.1, unchanged
export type SurfaceCutTile = {
  readonly id: { readonly z: number; readonly x: number; readonly y: number };
  readonly originLocal: Vec3;
  readonly resident: {
    readonly slot: number;
    readonly atlasUvOrigin: readonly [number, number];
    readonly atlasUvScale: readonly [number, number];
    readonly levelDelta: number;
    readonly quadrantOffset: readonly [number, number];
  };
};

// src/@types/scene/EarthTilePlan.d.ts — RESHAPED (this task), not deleted:
// the fetch-demand product of the single walk. `winX0`/`winY0` (the
// page-table window's origin) are dropped — `cutSurfaceTiles` does no
// window clip (see the note below the interface); `zWin`, `requests` and
// `subCameraDirLocal` keep exactly today's meaning and are still consumed
// by earthTileSubsystem.update()'s engage gate, fetch loop and debug
// snapshot untouched (Task 5).
export type EarthTilePlan = {
  readonly zWin: number;
  readonly requests: readonly EarthTileRequest[];
  readonly subCameraDirLocal: Vec3;
};

// src/utils/scene/cutSurfaceTiles.ts
export function cutSurfaceTiles(input: {
  readonly kind: EarthTileKind;
  readonly camPosLocal: Readonly<Vec3>;
  readonly viewProjLocal: Float32Array;
  readonly viewportPx: Readonly<Vec2>;
  readonly baseLevel: number;
  readonly bands: readonly EarthTileBand[];
  readonly tilePx: number;
  readonly lodBias: number;
  /** Resolve one exact tile's atlas residency, or null if it is not
   *  resident. Injected so this stays a pure function testable without a
   *  real GPU/atlas — Task 5 wires the real `earthTileSubsystem.residentSlot`
   *  query in. Takes the full `EarthTileId` (carries `kind`, unlike
   *  `SurfaceCutTile.id`) because it must key the same
   *  `earthTilePath(tile, prefix)` lookup `earthTileSubsystem` already uses
   *  for its resident map. */
  readonly residentSlot: (tile: EarthTileId) => {
    readonly slot: number;
    readonly atlasUvOrigin: readonly [number, number];
    readonly atlasUvScale: readonly [number, number];
  } | null;
}): {
  readonly cut: readonly SurfaceCutTile[];
  readonly requests: EarthTilePlan;
};
```

**The walk:** horizon cull (`capAngle`/`centreAngle`/`patchAngle` via
`equirectUvToDirection`), frustum + nine-sample projected `screenPx` (the
near-plane-straddler fallback at `planEarthTiles.ts:167–176` **must** carry
over unchanged — the same false-negative-cull bug the eox-deep-tile-bands
work already pinned closed once), and the refine-vs-emit decision via
`earthTileBandRefineAllowed`/`earthTileBandRequestAllowed` are lifted
verbatim from `planEarthTiles.ts`. The **request** side of the output
(`requests: EarthTilePlan`) is exactly what `planEarthTiles` computes today
at every refine and leaf-emit step — same `requests.push({ tile: { kind, z,
x, y }, screenPx })` calls, same largest-on-screen-first sort, same `zWin`
bookkeeping — with one deliberate subtraction: **no window clip.**
`planEarthTiles`'s final step filtered `requests` down to a
`windowSide × windowSide` grid centred on the sub-camera point, because that
window was also the page-table texture's exact size and a full-grid table
would be 537 MB at z13 (`EarthTilePlan.d.ts`'s old header). With the page
table gone, that reason is gone; the frustum+horizon culling upstream of it
already bounds `requests` to roughly the on-screen set (per the spec §3.4's
own framing of the page table's "whole reason to exist"), and an
over-budget atlas already degrades gracefully today via
`droppedAllocations`. Dropping the window clip is judged safe on that
reasoning, not verified against a real device — **flag this for a look
during Task 6's manual smoke pass**: watch `EarthTileAtlasSection`'s
`droppedAllocations`/`misses` readout at a grazing, wide-FOV pose for signs
the unclipped request list is materially larger than before.

The **cut** side is new: each **leaf** the walk reaches (the same leaves
that reach the emit branch today) becomes a `SurfaceCutTile` **if and only
if** it or one of its ancestors (walking up from `leaf.z` toward — but not
including — `baseLevel`, since `baseLevel` and shallower is the base-globe's
territory, never atlas-resident) resolves via `residentSlot`. A leaf with no
resident tile anywhere in its ancestor chain down to `baseLevel + 1` is
**dropped from `cut` entirely** — the base globe drawn underneath (Task 5)
already covers that ground, per the spec §3.4 fallback rule. This
resolution happens once per leaf, in the same pass that decides whether the
leaf goes into `requests` — not a second pass, not a second walk.
`levelDelta` is how many ancestor steps it took to find a resident tile (0 =
the leaf's own exact tile); `quadrantOffset` is the single composed `[0,1)`
fractional position of the leaf's footprint inside the resolved ancestor's
atlas rect (the same math `earth/fragment.wesl:241–245` already does
per-fragment today via `cellCols`/`fract`, moved CPU-side and resolved once
per leaf instead of once per fragment).

- [ ] **Test `cutSurfaceTiles` drops a leaf whose whole ancestor chain is
      non-resident** — a `residentSlot` stub returning `null` unconditionally;
      assert `cut` is empty even though the walk reaches leaves and
      `requests.requests` is non-empty (verifying the two products
      genuinely diverge here, not that the walk found nothing at all).
- [ ] **Test `cutSurfaceTiles` resolves `levelDelta: 0` for an exactly
      resident leaf** — a `residentSlot` stub that returns non-null only for
      the exact `{z,x,y}` the walk should reach at a known nadir camera pose
      (mirror `planEarthTiles.test.ts`'s `nadirAt` fixture, retargeted).
- [ ] **Test `cutSurfaceTiles` falls back to a resident ancestor with the
      correct `levelDelta` and `quadrantOffset`** — a `residentSlot` stub
      resident only at `leaf.z - 2`; assert `levelDelta === 2` and
      `quadrantOffset` matches a hand-computed `[0,1)` fraction for the
      leaf's known sub-quadrant position (a hand-computed expectation per
      `testing.md`, not the same fraction formula the source uses).
- [ ] **Test `cutSurfaceTiles` never resolves an ancestor at or shallower
      than `baseLevel`** — a `residentSlot` stub resident at `baseLevel`
      itself; assert that resident entry is never used to backfill a leaf
      (the base globe covers it instead — this pins the "not including
      baseLevel" boundary explicitly, since off-by-one here would either
      double-draw the base level as an atlas tile or leave a gap).
- [ ] **Test the near-plane-straddler fallback carries over, in both
      products** — retarget `planEarthTiles.test.ts`'s off-nadir-tilt
      fixture (the "keeps the deep band alive when the near plane slices a
      root patch" case, `planEarthTiles.test.ts:160–171`) against
      `cutSurfaceTiles`, with a `residentSlot` stub resident at the expected
      deep tile; assert `requests.requests` is non-empty and includes the
      deep tile (as today) **and** `cut` is non-empty (the false-negative-cull
      regression this test exists to catch applies to both outputs of the
      one walk that produces them).
- [ ] **Test the horizon cull still drops the far hemisphere** — retarget
      `planEarthTiles.test.ts:256–280`'s far-altitude fixture; assert the
      antipodal tile never appears in `requests.requests`.
- [ ] **Test `zWin` reaches the level a hand-computed texel density calls
      for, and gains exactly one level per halving of altitude** — retarget
      `planEarthTiles.test.ts`'s two `expectedLevel`/monotonicity tests onto
      `requests.zWin`.
- [ ] **Test `lodBias` shifts `requests.zWin` and shrinks `requests.requests`,
      and a bias large enough to underflow still floors at `baseLevel`** —
      retarget both `lodBias` tests verbatim.
- [ ] **Test engage/disengage against a one-level pyramid, and the
      `maxTileLevel` clamp** — retarget the "engages against the shipped
      z5-only pyramid, and stands down above it" and "never exceeds
      maxTileLevel" tests onto `requests.zWin`/`requests.requests`.
- [ ] **Test every leaf's fetch request carries its full ancestor chain
      down to the floor** — retarget "requests every ancestor down to the
      floor alongside each leaf" verbatim onto `requests.requests`.
- [ ] **Test the degenerate on-surface camera returns nothing, not
      nonsense, from both products** — retarget "returns an empty plan
      rather than nonsense when the camera is on the surface": assert
      `requests.requests` and `cut` are both empty, and
      `requests.subCameraDirLocal` is still the meaningful `[1, 0, 0]`, not a
      NaN trap.
- [ ] **Test `requests.subCameraDirLocal` is the normalised `camPosLocal`,
      not a recomputed direction** — retarget verbatim.
- [ ] **Test leaves land on both sides of the antimeridian** — retarget the
      "emits leaves on both sides of the antimeridian" fixture, dropping its
      window-membership assertions (`winX0`/`winY0`, the `EARTH_TILE_WINDOW_SIDE`
      wrap check) since `cutSurfaceTiles` has no window to be inside of —
      keep only the seam-straddling coverage itself (a request east of the
      seam and a request west of it, both present in `requests.requests`).
- [ ] Implement `cutSurfaceTiles`: move `planEarthTiles`'s walk body in
      wholesale (no behaviour change to the request/`zWin` side beyond
      dropping the window clip, called out above), adding the
      `residentSlot`-driven ancestor-fallback resolution at each leaf's
      emission point to produce `cut` from the same pass.
- [ ] `npm run typecheck` — clean.
- [ ] `npm test -- cutSurfaceTiles` — green. (`planEarthTiles.test.ts` also
      still runs and still passes here, unmodified — it is deleted only in
      Task 5, once nothing calls `planEarthTiles` in production.)
- [ ] Commit.

---

## Task 3: the patch-mesh baker + LRU mesh cache

**Files:**

- Create: `src/@types/scene/SurfaceTileMesh.d.ts`, `src/utils/scene/bakeSurfaceTileMesh.ts`,
  `src/services/gpu/resources/surfaceTileMeshCache.ts`
- Test: `tests/utils/scene/bakeSurfaceTileMesh.test.ts` (new),
  `tests/services/gpu/resources/surfaceTileMeshCache.test.ts` (new)

**Interfaces:**

```ts
// src/@types/scene/SurfaceTileMesh.d.ts
export type SurfaceTileMesh = {
  /** Unit-sphere-frame positions, relative to the tile's own origin
   *  direction (NOT the sphere centre) — the same "bake unit-sphere-local,
   *  let composeBodyMvp's S apply radiusMpc" convention cubeSphereMesh
   *  already uses, extended per-tile. (resolution+1)^2 * 3 floats. */
  readonly positions: Float32Array;
  /** Intra-tile uv in [0,1]^2 — NOT the whole-globe equirect uv
   *  cubeSphereMesh bakes; the atlas rect maps this per-instance in the
   *  shader (see Task 4). (resolution+1)^2 * 2 floats. */
  readonly uvs: Float32Array;
  /** Unit east tangent per vertex, same convention as cubeSphereMesh.
   *  (resolution+1)^2 * 3 floats. */
  readonly tangents: Float32Array;
  /** resolution^2 * 6 indices (two CCW-outward triangles per quad cell). */
  readonly indices: Uint32Array;
};

// src/utils/scene/bakeSurfaceTileMesh.ts
export function bakeSurfaceTileMesh(
  id: { readonly z: number; readonly x: number; readonly y: number },
  resolution: number,
): SurfaceTileMesh;
```

Per §9.2's ruling, the grid is sampled via `equirectUvToDirection` over the
tile's own `[u0,u1]×[v0,v1]` footprint (derived from `id` the same way
`cutSurfaceTiles.ts` already derives a node's uv footprint from `(z,x,y)`
— see Task 2, moved there verbatim from `planEarthTiles.ts:114–120`),
**not** `cubeSphereMesh`'s cube-face parameterization. Each vertex's position
is `equirectUvToDirection(uv) - originDir`, where `originDir =
equirectUvToDirection([u0, v_of_tile_origin])` is the tile's own origin
direction (pick a fixed corner or the centre — implementer's call, document
whichever is chosen; it must match whatever `cutSurfaceTiles`'s
`originLocal` uses for the SAME tile, since Task 5's per-instance placement
sums the two). This is what dissolves the 2.4 m equirect-UV quantum (spec
§3.3): the position magnitude at tile scale is small enough that an `f32`
mantissa resolves it cleanly at every pyramid depth, unlike today's one
whole-globe `u = lon/2π + 0.5`.

```ts
// src/services/gpu/resources/surfaceTileMeshCache.ts
export type SurfaceTileMeshCache = {
  /** Get (baking on first miss) this frame's mesh for `id`, touching its
   *  LRU stamp. Never null — a bake always succeeds for a valid id. */
  get(id: { readonly z: number; readonly x: number; readonly y: number }, frame: number): SurfaceTileMesh;
};

export function createSurfaceTileMeshCache(
  capacity: number,
  resolution: number,
): SurfaceTileMeshCache;
```

Mirrors `TextureAtlas`'s LRU shape (`src/services/gpu/resources/textureAtlas.ts`
— LRU by `lastSeenFrame`, keyed by string, `touch`/`allocate`-equivalent
split) but keyed by tile id (`` `${z}/${x}/${y}` ``) and holding CPU
`SurfaceTileMesh` objects rather than GPU texture slots — a **second,
independent** LRU from the atlas's, per spec §3.3 ("not itself
atlas-resident"). No GPU device dependency: this cache never touches WebGPU,
matching `TextureAtlas`'s own split between GPU-free slot bookkeeping and its
separate `initTexture`/`uploadBitmap` GPU methods (this cache has no GPU
methods at all — Task 4's renderer reads the cached CPU arrays and uploads
them itself, every frame, the same "rebuilt every frame into a storage
buffer" shape `starCatalogRenderer` already uses for its own per-frame CPU
cut).

- [ ] **Test `bakeSurfaceTileMesh` produces `(resolution+1)^2` vertices and
      `resolution^2 * 6` indices** — a structural size assertion, the kind
      `testing.md` keeps (a real off-by-one in the grid loop fails this).
- [ ] **Test `bakeSurfaceTileMesh`'s corner UVs are exactly `(0,0)`/`(1,0)`/
      `(0,1)`/`(1,1)`** — hand-picked corner vertex indices (`0`, `resolution`,
      `resolution*(resolution+1)`, the last index), asserting `uvs` at those
      indices, independent of the position math.
- [ ] **Test `bakeSurfaceTileMesh`'s positions are origin-relative** — assert
      the origin vertex's position is `[0,0,0]` (or whichever corner/centre
      convention is chosen) and that no other vertex's position magnitude
      exceeds a small multiple of the tile's own known angular extent at
      that `z` (a hand-computed bound from `earthTileColumns(z, ...)`, not a
      re-derivation of the bake formula) — this is the test that would catch
      a forgotten origin-subtraction regressing back to whole-sphere-scale
      coordinates.
- [ ] **Test `bakeSurfaceTileMesh` curvature** — sample the mesh's centre
      vertex and assert it deviates from the flat bilinear interpolation of
      the four corners by a hand-computed sagitta (the §3.4 "flat quad
      undershoots the sphere's curvature" rejection this bake exists to
      avoid) — nonzero at a shallow tile, and present at any depth (even if
      tiny), proving the bake genuinely samples the sphere rather than
      lerping corners.
- [ ] Implement `bakeSurfaceTileMesh`.
- [ ] **Test `surfaceTileMeshCache` bakes on miss, returns the cached
      reference on a hit** — `get(id, frame)` twice with the same `id`;
      assert the second call returns the exact same `SurfaceTileMesh`
      object (`toBe`) without a fresh bake (spy on the baker or count calls).
- [ ] **Test `surfaceTileMeshCache` evicts LRU when full** — capacity 2, three
      distinct ids requested across frames with increasing `frame` stamps
      touched per the `TextureAtlas.allocate`/`touch` pattern; assert the
      least-recently-touched id re-bakes (a fresh object, not the cached one)
      after the third id's request forces an eviction.
- [ ] Implement `surfaceTileMeshCache`.
- [ ] `npm run typecheck` — clean.
- [ ] `npm test -- bakeSurfaceTileMesh surfaceTileMeshCache` — green.
- [ ] Commit.

---

## Task 4: GPU path — `earthSurfaceTileRenderer`

**Files:**

- Create: `src/services/gpu/renderers/bodies/earthSurfaceTileRenderer.ts`,
  `src/services/gpu/renderers/bodies/earthSurfaceTileLayout.ts`,
  `src/services/gpu/shaders/bodies/earthSurfaceTile/{vertex,fragment,io}.wesl`,
  `src/@types/rendering/EarthSurfaceTileRenderer.d.ts`
- Test: `tests/services/gpu/renderers/bodies/earthSurfaceTileLayout.test.ts` (new —
  byte-offset parity, mirroring `nodeParamsLayout.test.ts`'s pattern for
  `starCatalogLayout.ts`)

**Load the `wesl-shaders` skill before touching any `.wesl` file in this
task.**

**A correction to the spec's §3.2 instruction, resolved here.** The spec
says to mirror "the star catalog renderer's shipped pattern … its own
`writeBuffer`/`submit` ownership." Read literally, `starCatalogRenderer`'s
instancing is a **3-vertex-per-instance billboard** scheme (`pass.draw(3,
totalInstances)`, `starCatalog/vertex.wesl` builds a screen-facing quad from
`@builtin(vertex_index) ∈ {0,1,2}` alone) — every instance shares the
**same trivial geometry** and differs only in placement. A `SurfaceCutTile`
is not a billboard: it carries a **baked multi-vertex curved mesh**
(Task 3's `(resolution+1)²`-vertex grid), and different tiles' meshes are
**topologically identical but geometrically distinct** (different curvature
per tile). True hardware instancing over `@builtin(instance_index)` requires
every instance to share one vertex/index buffer — which star billboards do
and tile patches, as baked, do not. The buildable resolution, kept
consistent with the star renderer's actual **buffer-ownership** pattern
(per-frame-rebuilt storage buffers, no GPU allocation growth beyond
grow-only capacity) rather than its specific vertex topology:

- A single **shared, fixed-size** vertex-pulling scheme: one draw call
  (`pass.draw(VERTS_PER_TILE * cutCount)` or `drawIndexed` with an
  index buffer replicated per instance-slot) where the vertex shader reads
  `@builtin(vertex_index)`, derives `tileSlot = vertex_index /
  VERTS_PER_TILE` and `localVertex = vertex_index % VERTS_PER_TILE`, and
  indexes **two** per-frame storage buffers: a `array<SurfaceTileNodeParams>`
  (one entry per cut tile — placement + addressing, the RTC precision seam)
  and a `array<TileVertex>` (every cut tile's baked mesh, concatenated
  back-to-back at `tileSlot * VERTS_PER_TILE`, the CPU-side twin of
  `earthRenderer.ts`'s `concatCubeSphereFaces` — except rebuilt every frame
  from `surfaceTileMeshCache` hits instead of concatenated once at
  construction). Because `bakeSurfaceTileMesh`'s resolution is fixed (one
  constant, Task 3), every tile contributes the **same** vertex count —
  `vertexBase = tileSlot * VERTS_PER_TILE` needs no prefix sum, unlike
  `starCatalogRenderer`'s variable-record-count `prefix` buffer.
- `SurfaceTileNodeParams` carries the RTC placement the spec's §3.2 asks
  for: `originRelCamMpc` (`vec3<f32>`, the `starNodeOriginRelCamMpc` pattern
  — `originLocal` (from `cutSurfaceTiles`) placed in world space via
  Earth's orientation/position, minus the camera position, subtracted in
  f64 CPU-side and narrowed once at upload) plus the resolved atlas
  addressing (`atlasUvOrigin`, `atlasUvScale` from `SurfaceCutTile.resident`).
  `levelDelta`/`quadrantOffset` are pre-resolved CPU-side (Task 2) into the
  flat `atlasUvOrigin`/`atlasUvScale` rect passed here, so the shader does
  no ancestor-fallback arithmetic — unlike today's `earth/fragment.wesl`,
  which resolves the fallback per-fragment because it has no CPU-side cut to
  resolve it ahead of time.
- The vertex shader composes each instance's placement as a
  **rotation-only** view (camera at the origin of its own frame) plus the
  per-instance `originRelCamMpc` translation — the `rebaseViewProj`-style
  seam the spec's §3.2 names, never a per-instance full MVP recompute. Cite
  `rebaseViewProj.ts` and `composeBodyMvp.ts`'s module headers for the
  f64-compose-then-narrow discipline this must follow: the CPU subtracts
  `camPosMpc` from the world tile origin in `mat4d`/JS-double arithmetic,
  narrows once at the `Float32Array` write.

**Byte layout (contract; exact offsets are this task's implementer's job,
following `starCatalogLayout.ts`'s documentation shape — this is the field
list and alignment rule, not a pre-committed offset table):**

```ts
// src/services/gpu/renderers/bodies/earthSurfaceTileLayout.ts
export const NODE_PARAMS_BYTES: number; // originRelCamMpc vec3 + vertexBase u32
                                          // + atlasUvOrigin vec2 + atlasUvScale vec2,
                                          // 16-byte vec3-aligned, mirroring
                                          // starCatalogLayout.ts's NODE_PARAMS_BYTES=32 shape
export const TILE_VERTEX_BYTES: number; // position vec3 + uv vec2 + tangent vec3

export function writeSurfaceTileNodeParams(
  view: DataView,
  base: number,
  originRelCamMpcX: number,
  originRelCamMpcY: number,
  originRelCamMpcZ: number,
  vertexBase: number,
  atlasUvOriginX: number,
  atlasUvOriginY: number,
  atlasUvScaleX: number,
  atlasUvScaleY: number,
): void;

export function writeTileVertex(
  view: DataView,
  base: number,
  positionX: number,
  positionY: number,
  positionZ: number,
  uvX: number,
  uvY: number,
  tangentX: number,
  tangentY: number,
  tangentZ: number,
): void;
```

- [ ] **Test `earthSurfaceTileLayout`'s byte offsets round-trip** — write a
      `SurfaceTileNodeParams`/`TileVertex` record via the writer, read every
      field back through the same `DataView` at the documented offsets,
      assert equality. This is the parity-test pattern
      `nodeParamsLayout.test.ts` runs for `starCatalogLayout.ts`, adapted —
      a WGSL struct reorder without a matching TS move is exactly the class
      of bug this guards, per `testing.md`'s "Keep-rules" section (WGSL/TS
      parity is explicitly load-bearing, not a restatement).
- [ ] Implement `earthSurfaceTileLayout.ts`.
- [ ] Write `earthSurfaceTile/io.wesl` (the shared `VSOut` struct, mirroring
      `bodies/earth/io.wesl`'s shape — clip position, intra-tile uv, local
      normal/tangent for lighting parity with the base globe's PBR path) and
      `earthSurfaceTile/{vertex,fragment}.wesl`. The fragment reuses the
      shared `lib/pbr.wesl` `pbrDirect` core and the same texture bindings
      (surface/material/night/normal/clouds) `earth/fragment.wesl` already
      binds, sampling the resolved atlas rect (`atlasUvOrigin +
      intraTileUv * atlasUvScale`) in place of `earth/fragment.wesl`'s
      page-table indirection (`:200–268` — that whole block has no
      equivalent here, since CPU-side `cutSurfaceTiles` already resolved
      which atlas rect this tile uses).
- [ ] **Depth-compare landmine (verify, don't assume):** the instanced tile
      pipeline draws directly over the base globe at the **same** nominal
      unit-sphere radius (both are radius-1 spheres in their respective
      local frames before `S` scales them). A plain `'less'`/`'greater'`
      "nearer" compare (`resolveDepthCompare('nearer', reversedZ)`, what
      `earthRenderer.ts:465` uses today) risks z-fighting between the two
      draws. `src/@types/rendering/DepthIntent.d.ts` already carries exactly
      this case: `'nearer-or-equal'` — "the coplanar atmosphere shell needs
      to draw over the body surface it shares a radius with." Use
      `resolveDepthCompare('nearer-or-equal', reversedZ)` for the tile
      pipeline (drawn **after** the base globe in Task 5's draw order, so
      ties resolve in the tiles' favour), or document precisely why a small
      per-instance radial offset is used instead if the implementer finds
      `'nearer-or-equal'` insufficient (e.g. it also lets a stale/wrong tile
      win a tie against a correct one at the exact same depth — verify this
      isn't visually distinguishable before shipping either way).
- [ ] Implement `createEarthSurfaceTileRenderer(device, targetFormat,
      depthFormat, reversedZ, meshCache)`: builds the two per-frame storage
      buffers (grow-only capacity, mirroring
      `starCatalogRenderer.ts:356–375`'s `ensureDrawBuffers` shape), a
      `draw(pass, args: { readonly tiles: readonly SurfaceCutTile[];
      readonly camPosMpc: ...; readonly bodyPositionMpc, orientation,
      radiusMpc; readonly vp: Float32Array; ... })` that rebuilds both
      buffers from `tiles` + `meshCache.get(id, frame)` every call, and
      issues one draw.
- [ ] `npm run typecheck` — clean.
- [ ] `npm test -- earthSurfaceTileLayout` — green.
- [ ] Commit.

---

## Task 5: integration

**Files:**

- Modify: `src/services/engine/frame/passes/earthLayer.ts` (base globe +
  instanced-tiles draw)
- Modify: `src/services/engine/frame/runFrame.ts` (`cutSurfaceTiles(...)`
  call site replaces the `planEarthTiles(...)` call site entirely)
- Modify: `src/services/engine/subsystems/earthTileSubsystem.ts` (delete the
  page-table half; add a residency-query method)
- Modify: `src/services/gpu/renderers/bodies/earthRenderer.ts` (drop the
  page-table/atlas bindings 7–9; the base globe no longer blends tile
  detail)
- Modify: `src/data/bodies/earthTileParams.ts` (delete
  `EARTH_TILE_WINDOW_SIDE` — see the collision note below),
  `src/@types/scene/EarthTilePlannerParams.d.ts` (drop `windowSide`),
  `src/services/gpu/shaders/bodies/earth/fragment.wesl` (drop the
  page-table sampling block and its mirrored `EARTH_TILE_WINDOW_SIDE`
  const, alongside the bindings 7–9 removal above),
  `tests/services/gpu/shaders/earthTileConstants.parity.test.ts` (drop the
  `EARTH_TILE_WINDOW_SIDE` case)
- Delete: `src/utils/scene/buildEarthPageTable.ts`,
  `tests/utils/scene/buildEarthPageTable.test.ts` (if it exists — verify),
  `src/utils/scene/planEarthTiles.ts`,
  `tests/utils/scene/planEarthTiles.test.ts` (superseded by
  `cutSurfaceTiles.test.ts` from Task 2 — verify nothing else imports
  `planEarthTiles` before deleting)
- Test: `tests/services/engine/subsystems/earthTileSubsystem.test.ts`
  (modify — drop page-table assertions, add residency-query coverage,
  update `EarthTilePlan` fixtures for the reshape),
  `tests/services/engine/frame/passes/earthLayer.test.ts` (modify — add
  instanced-draw coverage)

**The single-walk swap.** `runFrame.ts`'s tile-planning block calls
`cutSurfaceTiles(...)` where it called `planEarthTiles(...)` today, off the
same `prepareEarthFrame` result, with `earthTiles.residentSlot` (added
below) wired into `cutSurfaceTiles`'s `residentSlot` parameter. The one
call's `{ cut, requests }` result feeds **two** consumers: `cut` threads to
`earthLayer`'s new per-frame tiles input (draw); `requests` — an
`EarthTilePlan`, reshaped in Task 2 — passes straight into
`earthTiles.update({ plan: requests, nowMs: ctx.nowMs })`, **the same call
shape `earthTileSubsystem.update()` already takes today** (its parameter
type is `{ plan: EarthTilePlan; nowMs: number }` before and after this
task — only `EarthTilePlan`'s own shape changed, in Task 2, not
`update()`'s signature). This is deliberate: reusing the existing `plan`
field name and type, just reshaped, means `update()`'s fetch loop
(`misses`/`allocate`/`enqueueFetch`), its `lastPlan`/`lastDroppedAllocations`
bookkeeping, and its `plan.zWin > active.baseLevel` engage gate all keep
reading exactly what they read today — the only genuine deletions inside
`update()` are the page-table upload path (`uploadPageTable`, `windowMoved`,
the `winX0`/`winY0` comparison) and its own `zWin`/`winX0`/`winY0` window
projection, which have no reader once the page table is gone.

**A collision the single-walk ruling surfaces, flagged rather than silently
resolved: `windowSide` goes fully dead, which it did NOT under the rejected
dual-walk draft.** Under dual-walk, `planEarthTiles` kept running unchanged,
so its window-clip step (and `EarthTilePlannerParams.windowSide` /
`EARTH_TILE_WINDOW_SIDE`, the value it clips against) stayed load-bearing.
Under single-walk, `planEarthTiles.ts` is deleted outright and
`cutSurfaceTiles` does no window clip at all (Task 2) — so `windowSide` has
no reader anywhere in the tile-detail path once this task lands. This task
deletes it at every remaining site: `EarthTilePlannerParams.windowSide` (the
field), `earthTileSubsystem.ts`'s `derivePlannerParams` (stop returning it)
and its `EARTH_TILE_WINDOW_SIDE`-sized page-table texture/writes (already
being deleted below, for the page-table reasons), `earthTileParams.ts`'s
`EARTH_TILE_WINDOW_SIDE` export, `earth/fragment.wesl`'s mirrored
`EARTH_TILE_WINDOW_SIDE` const and the page-table cell lookup it sizes
(`:200–268`, the block Task 4's note already observed "has no equivalent"
in the new tile shader — it has none in the OLD base-globe shader either,
once bindings 7–9 are gone), and `earthTileConstants.parity.test.ts`'s
`EARTH_TILE_WINDOW_SIDE` parity case. Judged safe (see Task 2's note on
dropping the window clip) but not proven against a real device — the same
Task 6 smoke-pass flag applies.

- [ ] Add a residency-query method to `EarthTileSubsystem`
      (`src/@types/engine/subsystems/EarthTileSubsystem.d.ts` +
      `earthTileSubsystem.ts`'s `resident` map, currently closure-private):
      `residentSlot(tile: EarthTileId): { slot: number; atlasUvOrigin;
      atlasUvScale } | null` (or return the raw `resident.get(key)` entry
      plus a slot→uv conversion — implementer's call on where the
      `slotUv`-equivalent math lives; `TextureAtlas.slotUv` already computes
      this shape for the galaxy atlas, so reuse rather than reinvent it once
      the atlas's own `slotsPerRow`/`atlasSide`/`slotSide` are in scope
      here). This is the callback Task 5 wires into `cutSurfaceTiles`'s
      `residentSlot` parameter.
- [ ] Delete `buildEarthPageTable.ts` (and its test file, if present) once
      nothing references it.
- [ ] Delete `planEarthTiles.ts` and `planEarthTiles.test.ts` once
      `runFrame.ts`'s call site (below) calls `cutSurfaceTiles` instead —
      `cutSurfaceTiles.test.ts` (Task 2) already carries every assertion
      `planEarthTiles.test.ts` made, so this is a pure deletion, not a
      coverage loss.
- [ ] Drop `windowSide` from `EarthTilePlannerParams` and its one producer
      (`earthTileSubsystem.ts`'s `derivePlannerParams`); delete
      `EARTH_TILE_WINDOW_SIDE` from `earthTileParams.ts`; delete its mirror
      and the page-table cell-lookup block from `earth/fragment.wesl`; drop
      its case from `earthTileConstants.parity.test.ts` — see the collision
      note above.
- [ ] Delete `earthTileSubsystem.ts`'s page-table half: the `pageTable`
      `GPUTexture` allocation in `engage()` (`:224–235`), `uploadPageTable`
      (`:247–275`), `standDown`'s page-table zero-write (`:280–291`, though
      `standDown` itself may still be needed for other engage/disengage
      bookkeeping — verify), the `windowMoved`/`rebuildOwed`-driven upload
      trigger in `update()` (`:376–384`), and `getUploadedWindow()` /
      `getTileResources()`'s `pageTable` half (`:461–462`) — keep whatever
      of `getTileResources()` the atlas view itself still needs to publish,
      if the new renderer still binds the shared atlas texture directly
      (verify against Task 4's actual bind-group shape: does the new
      renderer read `earthTileSubsystem`'s existing atlas texture view, or
      does it need its own? The spec's §3.4 keeps "the atlas, its LRU
      eviction … unchanged" — so the SAME atlas view should still flow
      through).
- [ ] Update `earthTileSubsystem.test.ts` to match: drop every assertion
      that inspects the page-table upload path; update its `ENGAGED`/
      `DISENGAGED`/`fillPlan`/`nextPlan` `EarthTilePlan` fixtures to the
      reshaped type (drop their `winX0`/`winY0` fields); add coverage for
      the new `residentSlot` method (resident tile → correct slot/uv;
      non-resident → `null`).
- [ ] Rewrite `earthLayer.draw` to draw the base globe (unchanged
      `earthRenderer.draw` call, minus the now-dead page-table uniform
      fields `zWin`/`winX0`/`winY0` in `packEarthSurfaceUniforms` — verify
      whether those slots become true padding or get removed; removing them
      reshapes `EarthSurfaceUniforms`, a call for this task since the base
      globe no longer needs a window at all) **then** the instanced detail
      tiles (`earthSurfaceTileRenderer.draw`, gated on the cut being
      non-empty — an empty cut is a legitimate "nothing resident yet, base
      globe alone" frame, not a bug).
- [ ] Update `runFrame.ts`'s tile-planning block: replace the
      `planEarthTiles(...)` call with `cutSurfaceTiles(...)`, passing
      `earthTiles.residentSlot` as its `residentSlot` argument; call
      `earthTiles.update({ plan: result.requests, nowMs: ctx.nowMs })` in
      place of today's `earthTiles.update({ plan, nowMs })` (same shape,
      new source); thread `result.cut` to `earthLayer`'s new per-frame
      tiles input (however that's carried to `draw` — likely via
      `ReadyFrameContext`-adjacent state or a subsystem-owned `lastCut`
      field, mirroring how `earthTiles.plannerParams`/`update` already
      separate "compute" from "consume" — implementer's call, keep it
      inside the existing `earthTiles`/`ctx` seams rather than inventing a
      new global).
- [ ] Update `earthRenderer.ts`: remove `TILE_PAGE_TABLE_BINDING`/
      `TILE_ATLAS_BINDING`/`TILE_SAMPLER_BINDING` (bindings 7–9) and their
      placeholder textures/bind-group-layout entries, since the base globe
      no longer blends tile detail (Task 4's renderer owns tile drawing
      entirely now). Verify `packEarthSurfaceUniforms`'s
      `zWin`/`winX0`/`winY0`/reshape lands consistently with the previous
      step's choice.
- [ ] `npm run typecheck` — clean.
- [ ] `npm test` — full suite green.
- [ ] Manual dev-server check (not yet the full Task 6 pass): fly to a
      tiled band, confirm detail tiles render and the base-globe fallback
      still shows correctly with the tile subsystem disengaged (far
      altitude); glance at `EarthTileAtlasSection`'s request/miss/dropped
      counters for the unclipped-request-list concern flagged above.
- [ ] Commit.

---

## Task 6: verification gate

**Not a code task** beyond whatever Task 5's manual check surfaced needing a
fix. This task is the perf-halt rule and the spec's §8 visual checklist,
executed and recorded.

- [ ] Load the `perf` skill (`.claude/skills/perf/SKILL.md`) before running
      anything. In this worktree, run `npm run perf -- --url
      http://localhost:<this worktree's dev-server port>` **before** any
      Task 4/5 GPU-side change lands relative to a clean baseline commit (if
      not already captured earlier in this branch's history) and **after**
      Task 5 completes. Record MERGED/PER-LAYER/FLOOR numbers in this
      section of the plan (or the ledger) per the skill's interpretation
      guidance.
- [ ] **Land/park is the user's ruling per `feedback_code_is_liability`**: a
      neutral-or-negative perf measurement halts the pipeline here — report
      the numbers to the user before proceeding to the visual pass.
- [ ] `npm test` — full suite green.
- [ ] `npm run typecheck` — clean.
- [ ] Hand off to the user for the dev-server visual pass (spec §8):
  - Step-free camera motion and stable imagery down to ~2 m altitude
    (exercises the floor being lowered further than today's ~15 m, per the
    spec's acceptance criteria — magnified z19/z20 texels are expected and
    fine).
  - No blocky UV quantization at z15 and deeper.
  - Ocean glint stays stable (no visible jitter) below 10 m altitude.
  - The base-globe fallback still renders correctly on every failure path:
    no manifest, no atlas engaged, a 404 on every tile request.
  - Flying anywhere outside a tiled band is visually unchanged from before
    this feature (BMNG-only regions untouched).
- [ ] `/feature-done` audit once the visual pass is clean.
