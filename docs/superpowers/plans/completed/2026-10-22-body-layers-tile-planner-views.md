# Body Layers prep P6: the tile planner reads the rig views

**Spec:** [`specs/2026-10-20-body-layers-design.md`](../specs/2026-10-20-body-layers-design.md) §5
ruling 11, §6 P6. Prep for the body PR (§7 step 4); own PR (user, 2026-10-22).

**Strategy.** Today's surface-tile planning is ~80 inline lines in `runFrame.ts:253-332` that key on
the canvas view for the engaged body, the gate and the camera pose, and on the rig `views` for the
cut. This PR makes it one function over `views` alone, with a planner's result shape, called from
`runFrame` at today's point. Mono rigs are unchanged (`views` is `[canvas]`); dome and XR rigs engage
tiles for a body in any drawn face or eye. The body PR then registers the function as a body
`planners` row as is. `prepareBodySurfaceFrame` leaves `earthPass.ts` first.

**Contract widenings:** none. `FrameContentPlanner`, `PassState`, `ContentPass` and the Layer types
stay as they are. If the function needs a `PassState` field it lacks, STOP and report.

**Execution:** lean SDD. One dispatch (Sonnet) = Tasks 1–2, two commits; one final review; CI; smoke.

**Perf estimate and ruling.** Worst pose: Earth at street level under the mono rig, tiles engaged.
The same calls run as today (one `prepareBodySurfaceFrame` per view, memoised per `(view, body)`;
one `cutSurfaceTiles`); the canvas lookup it drops was a memo hit. Under dome rigs the engaged-body
search walks every face's slabs (6 × a handful). Net zero for mono, < 0.01 ms for dome.
**Ruling: no perf gate.**

**Planning findings:**

- `PassState` already carries `subsystems`, `assetSlots` and `data`, which the planning reads
  (`bodySurfaceTier`, `sceneBodyStates`, the subsystem).
- The subsystem is a parameter, not read off `state`: the body PR's planner closes over its own
  runtime's subsystem, so the function must not reach `state.subsystems.surfaceTiles`.
- `setLastCut` stays in this PR (`runFrame` stores the returned cut); the body PR replaces the
  hand-off with the planner's value through `snapshot.plans`.
- `isAnimating()` must vote even on a disengaged frame (the manifest fetch runs before the tiles
  can engage); the `awake` vote carries it.
- Existing tests: `tests/utils/surfaceTiles/surfaceTilesEngaged.test.ts`, `cutSurfaceTiles.test.ts`,
  `tests/services/engine/subsystems/surfaceTileSubsystem.test.ts`.

---

### Task 1: `prepareBodySurfaceFrame` gets its own file

**Files:** `src/services/engine/frame/passes/earthPass.ts` → `src/services/engine/frame/prepareBodySurfaceFrame.ts`
(via `npm run refactor` extract or `npm run move-files`; its memo moves with it), importers
`surfaceTilesPass.ts`, `surfaceTilesEngaged.ts`, `runFrame.ts`, and any tests. Behaviour-neutral.
If `earthPass.ts` is on the frame-file purity allow-list (`tests/services/engine/frame/frameFilePurity.test.ts`)
for this export, remove it from the list.

- [x] Task 1

### Task 2: one tile-planning function over the rig views

review: yes

**Files:** `src/services/engine/frame/planSurfaceTiles.ts` (create), `src/services/engine/frame/runFrame.ts`
(the inline block becomes one call), a type for the result if one is needed under `src/@types/`,
`tests/services/engine/frame/planSurfaceTiles.test.ts` (create).

**Contract:**

```ts
export function planSurfaceTiles(
  tiles: SurfaceTileSubsystem,
  views: readonly FrameView[],
  state: PassState,
): PlannerResult<readonly SurfaceCutTile[]>; // awake = tiles.isAnimating(); settling = false
```

- Engaged body: the first `SURFACE_TILE_REGISTRY` host with a `body-m` slab, walking `views` in
  order, then each view's slabs in order.
- Gate (`surfaceTilesEngaged`), pose (`camPosLocalM`, `radiusM`, `reliefM`) and the release check read
  the first view holding that body's slab; the cut walks every view holding it, as today.
- `tiles.update` and `tiles.release` keep today's call conditions; the cut is empty on a disengaged
  frame (so `runFrame`'s `setLastCut` never keeps a stale cut).
- `runFrame` passes `views` (not `canvas`), stores `value` with `setLastCut`, and feeds `awake` where
  `surfaceTilesAnimating` went; `surfaceTilesAnimating` is deleted.

**Tests:**

- `engages a tiling body seen only by a later view` — two views, Earth's `body-m` slab only in the
  second: the cut is non-empty and `update` is called for Earth. **Bug caught:** the trigger still reads
  only the first (canvas) view, so a dome face showing Earth never tiles.
- `votes awake while the manifest loads, even disengaged` — no tiling slab in any view and
  `isAnimating()` true: `awake` is true and the cut empty. **Bug caught:** the vote only on engaged
  frames sleeps the loop mid-fetch.
- `a disengaged frame returns an empty cut` — after an engaged frame, a view set with no tiling
  slab yields `[]`. **Bug caught:** a stale cut survives a pull-back.

- [x] Task 2

### Task 3: tile planning reads no slab (user, 2026-10-22)

review: yes

The planner must not depend on the renderer's slab partition. Today it reads a `body-m` slab for
three things, each with a renderer-free source:

| Reads | For | Source instead |
| --- | --- | --- |
| a tiling host's `body-m` slab exists | the body is on screen | the view's body-row roster `deriveSlabs` is fed (`visibleBodyRows`: `visibleSlabBodies` over `snapshot.slabBodyCandidates` plus the mesh-host re-admission, extracted from `deriveView` and shared) ∩ `SURFACE_TILE_REGISTRY`, inside `FOREGROUND_MAX_DISTANCE_MPC` (user, 2026-10-22: `sceneBodyPresentation` has no Earth, a 3 px resolve floor and no frustum cull, so it disagrees) |
| `view.slab.vp` → `composeBodySlabMvp` | each view's body-local frustum (f64) | `FrameView.bodyPose(bodyId)` + `FrameView.frustum` + `viewportPx` |
| `prepareBodySurfaceFrame`'s memo | one derivation shared with `earthPass` | none: one compose per view per frame |

**Files:** every planner file in one folder, `src/services/engine/frame/surfaceTilePlanner/`
(user, 2026-10-22): `planSurfaceTiles`, `planSurfaceCut`, `releaseTilesPastRadius` (moved via
`npm run move-files`), and the new `engagedTileBody` and `tileCamerasOf`; tests mirror under
`tests/services/engine/frame/surfaceTilePlanner/`, and the folder joins the frame-file purity sweep.
`src/services/engine/frame/visibleBodyRows.ts` (not planner-only: `deriveView` calls it too) with a
`BodyRowGate` type; a `TileCamera` type, which `cutSurfaceTiles`' view input now names; delete
`TilingSlab.d.ts`; tests.

**Contract:**

```ts
export function tileCamerasOf(views: readonly FrameView[], bodyId: SurfaceTileBodyId,
  radiusM: number): readonly { viewProjLocal: Float64Array; viewportPx: Readonly<Vec2> }[];
export function engagedTileBody(ctx: FrameView): SurfaceTileBodyId | null; // pure over the view's body-row roster
```

- **Narrow input (user, 2026-10-22).** The planner takes no `PassState`:

  ```ts
  export function planSurfaceTiles(
    tiles: SurfaceTileSubsystem,
    views: readonly FrameView[],
    committedTier: (bodyId: SurfaceTileBodyId) => Tier,
  ): PlannerResult<readonly SurfaceCutTile[]>;
  ```

  `datumRadiusM`/`reliefM` come from the static body tables by id; body positions for the release
  check from `view.snapshot.bodyStates` (the frame's one `deriveBodyStates` sample, which is what
  `sceneBodyStates` returns, without its unused `state`); the committed tier is the one runtime fact. `runFrame` passes
  `(id) => bodySurfaceTier(state, id)`. Its helpers (`planSurfaceCut`, `releaseTilesPastRadius`)
  narrow the same way.
- `cutSurfaceTiles` keeps its input; the planner feeds it the adapter's cameras and the first view's
  `bodyPose(bodyId).eyeRelBodyM`.
- `prepareBodySurfaceFrame` and `SlabView` no longer appear in tile planning; the drawing passes keep
  them.
- Verify, don't assume: (a) whether `cutSurfaceTiles` culls on the near/far planes (the slab vp's
  depth band) or only on the side planes and horizon; the planner frustum must cull no fewer tiles
  than the slab's in any mono pose; (b) that `engagedTileBody` agrees with "a tiling host has a
  `body-m` slab" for every tiling body over the sub-pixel and distance edges. If either fails, STOP
  and report with the evidence.

**Tests:**

- `the planner frustum culls as the slab frustum does` — for Earth at street level, orbit and limb
  poses, the tile-camera `viewProjLocal` yields the same `cutSurfaceTiles` cut as the slab-built
  matrix. **Bug caught:** a basis or f32 slip in the adapter plans tiles for the wrong patch.
- `engages exactly the tiling bodies that get a body slab` — over poses across the sub-pixel and
  `FOREGROUND_MAX_DISTANCE_MPC` edges. **Bug caught:** tiles plan for a body the renderer culled, or
  stop for one it draws.

- [x] Task 3

### P8: one owner per fact, in the octree's shape (user, 2026-10-22)

A first draft (plain-data runtime + fold + step + effects/events) gave tile residency two owners: the
GPU atlas, which must own key → slot and the LRU because it allocates real texture slots, and a
plain-data copy kept in sync by 7 event kinds, 4 effect kinds, a fold and two assignments per frame.
The user ruled it complected and chose the octree's shape (`planOctreeChunks` + `OctreeChunkStream`,
`src/layers/starCatalog/frame.ts:73-100`): **the stream is the sole owner of residency; the planner is
pure and owns every decision; the planner's output is the frame's tile plan.**

| Fact | Owner | Written |
| --- | --- | --- |
| manifest, atlases, LRU, key → slot, in-flight, failed | `SurfaceTileStream` | at fetch/upload/evict (live, as today and as the octree) |
| which body, engage/keep/release, cut, touched/requests, `lastPlan`, `subCamera`, wake vote | `planSurfaceTiles` (pure) | once per frame, as its result |
| the frame's tile plan the passes and the seam read | `state.subsystems.surfaceTiles.plan` | by `runFrame`, once per frame |

Rulings that stand: R1 (under `subsystems`, now `{ stream, plan }`); R3 (the stream uploads); R4
(release on a body switch or past `TILE_RELEASE_RADII`); R5 (`over` position facts vs `frame` view
facts; `subCamera` from `over`, `lastPlan` from `frame`); R6 (P7 in the body PR). R2 dissolves: residency
stays live, updated at upload, so the camera reads a landed height tile next frame with no fold.

### Task 4: the pure tile planner owns every decision (P8a)

review: yes

**Files:** `src/@types/engine/surfaceTiles/{SurfaceTileResidency,SurfaceTilePlan,SurfaceTileOver,SurfaceTileVerdict}.d.ts`
(create); `src/services/engine/frame/surfaceTilePlanner/` (the pure planner and its helpers, one symbol per
file); `derivePlannerParams` (`surfaceTileSubsystem.ts:173-206`) extracted to
`src/utils/surfaceTiles/derivePlannerParams.ts` via `npm run refactor`; tests mirrored. Not wired until Task 5.

**Contract:**

```ts
/** The stream's read side, handed to the planner, the passes and the terrain seam. Read-only. */
export type SurfaceTileResidency = {
  manifest(bodyId: SurfaceTileBodyId): { status: 'absent' | 'pending' | 'loaded' | 'failed';
    value: SurfaceTileManifest | null };
  residentSlot(tile: SurfaceTileId): ResidentSlot | null;   // today's :440-461 answer
  hasFailed(key: string): boolean;
  inFlightCount(): number;
  engagedBodyId(): SurfaceTileBodyId | null;               // whose atlases are allocated
};
export type SurfaceTileVerdict = 'keep' | { engage: SurfaceTileBodyId; tilePx: number } | 'release';
export type SurfaceTilePlan = {
  readonly cut: readonly SurfaceCutTile[];
  readonly touched: readonly string[];                      // resident keys this frame wants, request order
  readonly requests: readonly SurfaceTileRequest[];          // misses, largest on screen first
  readonly wantManifest: SurfaceTileBodyId | null;
  readonly verdict: SurfaceTileVerdict;
  readonly lastPlan: { requestCount; zWin; misses } | null;  // from `frame`; null when nothing planned
  readonly subCamera: { lonDeg; latDeg; coveredMaxLevel } | null;  // from `over`; survives looking up
  readonly awake: boolean;                                   // manifest pending or fetches in flight
};
export function planSurfaceTiles(
  views: readonly FrameView[],
  over: SurfaceTileOver | null,          // nearest tiling body within TILE_RELEASE_RADII: id, camPosLocalM, distanceM
  residency: SurfaceTileResidency,
  committedTier: (bodyId: SurfaceTileBodyId) => Tier,
): SurfaceTilePlan;
```

- Decisions moved out of `update()` (`surfaceTileSubsystem.ts:311-436`) into the planner: the engage
  gate (`plan.zWin > baseLevel`), the touch-then-allocate split (`touched` vs `requests`; the stream
  applies touches first, as `OctreeChunkStream.update` does), misses (not resident, not failed, not in
  flight), the manifest request, and the verdict (R4: release on a body switch or past
  `TILE_RELEASE_RADII`, never on visibility alone).
- `TILE_RELEASE_RADII` in `surfaceTileParams.ts`: twice the farthest measured engage distance (widest
  frustum, largest viewport, per tiling body); the task records method and numbers.
  `releaseTilesPastRadius.ts` and the atlases' use of `pastTextureReleaseRadius` delete.
- `over` comes from `FrameView.bodyPose` with no visibility gate; `frame` (cameras, base level) only when
  `visibleBodyRows` shows the body. Looking up at street level: `over` and `subCamera` unchanged, cut
  and `lastPlan` empty.

**Tests** (a plain-object `SurfaceTileResidency`, no GPU or fetch fakes):

- `looking up at street level keeps the position readout and plans nothing` — `over` set, no view shows
  Earth: `subCamera` is Copenhagen, `cut`/`requests`/`lastPlan` empty, verdict `keep`. **Bug caught:**
  the readout or the atlases follow the view instead of the position.
- `a body switch releases at once; distance releases past TILE_RELEASE_RADII; off-screen never does`.
  **Bug caught:** atlases held to 0.85 AU, or dropped on a turn of the head.
- `touched lists every resident requested key before any request` (near-full residency). **Bug caught:**
  the eviction cascade (`:335-341`).
- `a failed or in-flight key is never requested again` and `no manifest yet → wantManifest, empty cut,
  awake`. **Bug caught:** refetch storms; Mars tiles under Earth's prefix.
- Port the decision cases of `surfaceTileSubsystem.test.ts` (engage gate, base level, params) here.

**Ruling after the measurement (user, 2026-10-27): the release radius is lens-relative.** One fixed
radius must cover the 0.5° telephoto extreme (2110 R), so at a normal 60° lens the atlases stayed
until the body was ~1 px. Instead `over` and the release verdict use twice the distance at which tiles
would engage with the CURRENT lens: `engageDistanceM(body, pxPerRad, baseLevel)` (∝ the view's
pixels per radian; the measured relation above), release when `|camPosLocalM| > 2 × engageDistanceM`.
~9 R at 60°, ~2,100 R at 0.5° on 8192 px; zooming out from telephoto while far releases (accepted).
`TILE_RELEASE_RADII` deletes. Done in Task 5 (below).

**Record (2026-10-23).**

- `TILE_RELEASE_RADII` = 2110 for Earth and Mars. Method: a throwaway script swept the eye outward
  (×1.02 steps from 1.01 R) through the real `cutSurfaceTiles` + `tileCamerasOf` under a whole-globe
  band, over sub-camera latitudes 0–89°, every tier, FOV 0.5°–100° and viewports up to 8192², and
  kept the farthest distance with `zWin > baseLevel`. The farthest engage is at the NARROWEST lens,
  not the widest (more pixels per radian): small tier (base z2), FOV 0.5° (the slider's minimum),
  8192 px (WebGPU's baseline canvas edge) = 1054.3 R; 527 R at the 4096² dome take, 559 R on an 8K
  display, 4.4 R at 60° on 4096², 2.3 R at 100°. Scale-free in radii, so Earth and Mars measure
  alike. A release radius below the farthest engage would engage and release on alternate frames.
- The planner keys on one body: `over` (nearest tiling body in reach, `surfaceTileOverOf`), so the
  nearest wins when several are visible; the views only gate the cut (`tileBodiesInView`). It
  engages only the body `over` names, so no lens can engage past the release radius.
- Off-plan: `SurfaceTileResidency.isInFlight(key)` (a key in flight holds a slot the stream must
  touch; misses exclude it); `SurfaceTileOver` carries no `distanceM` (it is `|camPosLocalM|`);
  the walk's demand type `scene/SurfaceTilePlan` renamed `SurfaceTileDemand` (the incumbent yields
  the name); the live path's `planSurfaceTiles` renamed `driveSurfaceTileSubsystem` until Task 5
  deletes it with `planSurfaceCut`, `engagedTileBody` and `releaseTilesPastRadius` (still live, so
  kept here); `ResidentSlot` extracted from the subsystem type for the residency to share.

- [x] Task 4

### Task 5: the subsystem becomes `SurfaceTileStream`; `runFrame` applies the plan (P8b)

review: yes

**Files:** `surfaceTileSubsystem.ts` → `surfaceTileStream.ts` (`npm run move-files`, then
`createSurfaceTileSubsystem` → `createSurfaceTileStream` via `npm run refactor`); its type →
`SurfaceTileStream.d.ts`; `EngineSubsystemHandles.d.ts:39` → `surfaceTiles: { stream; plan } | null`;
`wireSlots.ts:95`; `engine.ts` (init, destroy, debug handle); `runFrame.ts`; `surfaceTilesPass.ts`,
`terrainPickMarkerPass.ts`, `surfaceTileTerrain.ts`; tests.

```ts
export type SurfaceTileStream = Destroyable & {
  readonly residency: SurfaceTileResidency;
  /** Like OctreeChunkStream.update: manifest request, verdict, then touches before allocations. */
  apply(plan: SurfaceTilePlan, frame: number): void;
  heightAt(bodyId: SurfaceTileBodyId, dirBodyFixed: Readonly<Vec3>): number;   // today's :504
  residentHeightLevelAt(bodyId: SurfaceTileBodyId, dir: Readonly<Vec3>): number | null; // :516
  getAtlasView(): GPUTextureView | null;
  getHeightAtlasView(): GPUTextureView | null;
  debugStats(): Omit<SurfaceTileDebugSnapshot, 'plan' | 'subCamera'>;  // residency counts only
};
```

- `runFrame`, at today's planning point: `const plan = planSurfaceTiles(views, over, tiles.stream.residency,
  committedTier); tiles.plan = plan; tiles.stream.apply(plan, frameIndex);` and the wake vote reads
  `plan.awake`. One writer of `tiles.plan` per frame.
- Deleted from the subsystem: `plannerParams`, `update`, `setLastCut`/`getLastCut`, `release`,
  `isAnimating`, `getDebugSnapshot` (the debug handle composes `stream.debugStats()` with
  `tiles.plan.lastPlan`, `cut.length` and `subCamera` until P7).
- Passes read `tiles.plan.cut` and the stream's atlas views; the terrain seam reads `stream.heightAt`,
  `stream.residentHeightLevelAt` and `tiles.plan.subCamera` (`LayerTerrain` unchanged).
- Contract widenings: none.

**Tests:**

- `apply touches every listed key before allocating any request` (fake atlas near full). **Bug caught:**
  a resident tile this frame needs evicted for a miss.
- `an upload into a recycled slot is dropped and never reported resident`. **Bug caught:** the cut names a
  slot holding another tile.
- `release frees both atlases and ignores fetches still in flight` (bitmaps closed). **Bug caught:** Earth
  tiles repopulating after a switch to Mars, or leaked bitmaps.
- Port the stream cases of `surfaceTileSubsystem.test.ts`; delete `driveSurfaceTileSubsystem.ts` and its
  test with the live path's helpers.

**Record (2026-10-27).**

- Release ruling: `engageDistanceM(radiusM, pxPerRad)` = R·(0.4 + 1.145e-3·pxPerRad), fitted to a re-run
  of the sweep at base z2 (4.46 R at 60° on 4096², 1075 R at 0.5° on 8192²; it under-reads small
  viewports by up to 21%, which the factor 2 covers, test-pinned against the real walk). No `baseLevel`
  argument: z2 engages farthest, so one relation bounds every tier (a large-tier session holds its
  atlases up to ~2.7× farther than its own engage needs).
  `surfaceTileOverOf(views)` takes the finest lens of any view.
- Off-plan: `apply(plan)` keeps its own frame counter (`runFrame` has no frame index); the stream takes
  `baseLevelOf` (the committed tier's base level) for `heightAt`'s climb floor, as the old
  `paramsState` did; `IDLE_SURFACE_TILE_PLAN` seeds `tiles.plan` and the planner's idle returns;
  `engagedTileBody.test.ts` ported to `tileBodiesInView.test.ts` (the slab-agreement pins).

- [x] Task 5

**P8 perf estimate and ruling.** Same work as today, moved: `cutSurfaceTiles` dominant and unchanged; the
decisions run once per frame either way; no map copies, no event queue; `subCamera` drops from an
O(resident) scan to O(1). **Ruling: no perf gate.**

**Known risks:** the planner reads live residency, so a tile landing between `planSurfaceTiles` and
`apply` in the same task cannot happen (both run synchronously in `runFrame`); `apply` must re-check a
key's slot at upload (today's `tileStreamSubsystem.ts:64-80` guard, unchanged); porting the 873-line
`surfaceTileSubsystem.test.ts` splits between Tasks 4 and 5.

### P7 placement (R6)

No clean interim writer exists while core owns the tiles: a core fact (field, action, selector) or
core dispatching into the body Layer's facts would both be deleted one PR later. **Ruled (user,
2026-10-22): P7 lands in the body PR** (its tile planner row
publishes `facts.surfaceTileDebug` throttled to 250 ms while `selectDebugPanelOpen`; the two debug
sections move into `src/layers/body/`; `engine.debug.surfaceTiles` and the panel's poll delete).

---

## Definition of Done

**Deliverables:** `prepareBodySurfaceFrame.ts`; `planSurfaceTiles`; `runFrame` with no canvas in tile
planning and no `surfaceTilesAnimating`; three tests.

**Observable behaviour (smoke), identical to main under the mono rig:**

- `#focus=body-earth`, descend to street level over Copenhagen: tiles stream in and sharpen.
- `#focus=body-mars`, descend into Gale crater: Mars tiles engage.
- Pull back past the release radius and return: tiles re-engage.
- `#focus=body-soendermarken`: the park on its terrain.

**Out of scope:** registering the planner as a Layer row, the cut through `snapshot.plans`, moving
the plan into the frame program's plan phase (body PR); P7's debug readout.
