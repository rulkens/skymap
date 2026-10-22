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

### P8 planning findings (2026-10-22; rulings R1–R6 asked, recommended options written in)

- **Home (R1).** The passes read tile state through `PassState` (`surfaceTilesPass.ts:58,114,131-132`,
  `terrainPickMarkerPass.ts:39,72`), which names `subsystems` (`PassState.d.ts:12-23`). The runtime
  lives at `state.subsystems.surfaceTiles = { stream, runtime }` (named after `OctreeChunkStream` and `tileStreamSubsystem`, user 2026-10-22): no `PassState` widening, and the body
  PR moves the pair into the body Layer's runtime unchanged.
- **Two assignments (R2).** The terrain seam is read before tile planning (`stepCameraRuntime` at
  `runFrame.ts:122`, `frameContext.ts:98`; planning at `:243`). Stream events fold at the frame head;
  the step runs at the planning point. One assignment at the planning point would leave the camera
  floor a frame behind the drawn terrain.
- **Upload stays in the stream (R3).** Routing ImageBitmaps through the step would hold GPU payloads in
  the runtime for a frame and duplicate `upload()`'s `slotOf` re-check, the eviction-mid-fetch guard
  (`tileStreamSubsystem.ts:65-81`). The stream uploads on fetch completion as today and reports events.
- `frameCounter` (the atlas LRU clock, `surfaceTileSubsystem.ts:152`) is the atlas's resource and stays
  in the stream, with `destroyed` and both streams and atlases.

### Task 4: tile state as plain data, a pure fold and a pure step (P8a)

review: yes

**Files:** `src/@types/engine/state/SurfaceTileRuntime.d.ts`;
`src/@types/engine/surfaceTiles/{SurfaceTileEvent,SurfaceTileEffect,SurfaceTileStepInputs}.d.ts`;
`src/services/engine/surfaceTiles/{foldSurfaceTileEvents,stepSurfaceTiles,emptySurfaceTileRuntime}.ts`
and one file per selector (`residentSlotOf`, `terrainHeightOf`, `residentHeightLevelOf`, `subCameraOf`,
`surfaceTilesAwake`, `surfaceTileDebugOf`); `derivePlannerParams` (`surfaceTileSubsystem.ts:173-206`)
extracted to `src/utils/surfaceTiles/derivePlannerParams.ts`; tests under
`tests/services/engine/surfaceTiles/`. Nothing in the engine calls these until Task 5.

**Runtime fields** (each replaces closure state in `surfaceTileSubsystem.ts`):

| Field | Replaces |
| --- | --- |
| `manifest: { bodyId; status: 'pending' \| 'loaded' \| 'failed'; value } \| null` | `:109-111` |
| `params: { bodyId; baseLevel; params } \| null` | `paramsState` `:116-120` |
| `engaged: { bodyId; slotsPerRow } \| null` | `atlas.bodyId`/`.slotsPerRow` `:126-131` (atlases stay in the stream) |
| `albedo`, `height: ReadonlyMap<string, ResidentTile>` | `:136-137`; `ResidentTile` gains `atlasUvOrigin`/`atlasUvScale`, stamped by the stream at upload |
| `pending: ReadonlyMap<string, { z; product }>` | `pendingLevelOf` `:142`, widened to height; the wake vote replaces `inFlightCount()` `:533` |
| `failed: ReadonlySet<string>` | the stream's `failedKeys` as the planner reads them (`:355`) |
| `lastEngaged` | `:146-150`; `droppedAllocations` arrives by event |
| `cut: readonly SurfaceCutTile[]` | `lastCut` `:158` |

```ts
export type SurfaceTileEvent =
  | { kind: 'manifestLoaded'; bodyId: SurfaceTileBodyId; manifest: SurfaceTileManifest | null } // null: 404
  | { kind: 'tileLoaded'; bodyId: SurfaceTileBodyId; key: string; resident: ResidentTile }
  | { kind: 'tileFailed' | 'tileDeclined' | 'tileDropped' | 'tileEvicted';
      bodyId: SurfaceTileBodyId; key: string; product: SurfaceTileProduct };
// declined: payload landed after its slot was recycled; dropped: allocate refused (atlas full)

export type SurfaceTileEffect =
  | { kind: 'fetchManifest'; bodyId: SurfaceTileBodyId; manifestKey: string }
  | { kind: 'engage'; bodyId: SurfaceTileBodyId; tilePx: number } // allocate both atlases
  | { kind: 'release' }                                              // stand down
  | { kind: 'demand'; touch: readonly string[];
      fetch: readonly { key: string; tile: SurfaceTileId; prefix: string; priority: number }[] };

export type SurfaceTileStepInputs = {
  /** null: no view engages a tiling body (or its pose is null). */
  readonly frame: { readonly bodyId: SurfaceTileBodyId; readonly baseLevel: number;
    readonly camPosLocalM: Readonly<Vec3>; readonly cameras: readonly TileCamera[] } | null;
  readonly pastReleaseRadius: (bodyId: SurfaceTileBodyId) => boolean;
};
export function foldSurfaceTileEvents(prev: SurfaceTileRuntime,
  events: readonly SurfaceTileEvent[]): SurfaceTileRuntime;
export function stepSurfaceTiles(prev: SurfaceTileRuntime, inputs: SurfaceTileStepInputs):
  { readonly next: SurfaceTileRuntime; readonly effects: readonly SurfaceTileEffect[] };
```

- **Fold:** events in arrival order; a tile event for a body other than `engaged.bodyId`, or a
  `manifestLoaded` for a body other than `manifest.bodyId` (`:233-239`), is dropped; no events returns
  `prev`; each map is copied at most once per fold.
- **Step**, in today's order: (1) manifest: a new body sets `pending`, nulls `params`, emits
  `fetchManifest`, and emits `release` for a different engaged body at once (R4: today the release
  waits for the new manifest, `:316`; nothing draws in between); (2) params re-derived only when
  `manifest` or `baseLevel` changes; (3) cut via `cutSurfaceTiles` with
  `residentSlot: (t) => residentSlotOf(prev, t)`; (4) engaged iff `plan.zWin > baseLevel`, else
  `lastEngaged` is null and residency is kept; (5) demand: misses (in none of residency, `pending`,
  `failed`) join `pending`; one `demand` effect (after `engage` on the first), `touch` = every requested
  slot-holding non-failed key in request order, `fetch` = misses largest first (today's two-pass,
  `:335-426`); (6) one release verdict (R4, user 2026-10-22: switch and distance, never visibility alone):
  release when the engaged body is not this frame's body, or when the camera is farther than
  `TILE_RELEASE_RADII × datumRadiusM` from it. Today the atlases ride the globe texture's gate (2 ×
  10⁴ radii, `bodyTextureLoadRadius.ts`; ~0.85 AU for Earth, where it is ~0.1 px) though tiles only
  engage close in; the user ruled that wrong (2026-10-22). `TILE_RELEASE_RADII` is a named constant in
  `surfaceTileParams.ts`, set to twice the farthest distance at which tiles engage (measured at the
  widest frustum and largest viewport the app allows, per tiling body; the plan task records the
  method and numbers), so the factor 2 is the hysteresis against edge thrash. The step input
  `pastReleaseRadius` becomes `camDistanceM: (bodyId) => number`; `releaseTilesPastRadius.ts` and the
  atlases' use of `pastTextureReleaseRadius` delete. Visibility alone never releases. Release clears residency, `pending`, `failed`,
  `lastEngaged` and keeps `manifest`/`params` (`:301-309`). A `frame: null` step clears `lastEngaged` (R5).
- **Selectors:** `residentSlotOf` (`:440-461`), `terrainHeightOf`/`residentHeightLevelOf` (`:469-528`),
  `subCameraOf` (O(1); today the seam builds the whole snapshot, `surfaceTileTerrain.ts:12`),
  `surfaceTilesAwake` (`manifest?.status === 'pending' || pending.size > 0`), `surfaceTileDebugOf`
  (`:538-598`; `cutCount` is this frame's `cut.length`; `EMPTY_SURFACE_TILE_DEBUG_SNAPSHOT` moves beside it).

**Tests:**

- `a cut never names a slot after its tile was evicted` — fold `[tileLoaded K@S, tileEvicted K,
  tileLoaded K2@S]`, step a frame covering K: K's leaf resolves to its ancestor, never slot S. **Bug
  caught:** out-of-order folding or slot-keyed residency draws K2's pixels as K.
- `a tile evicted mid-fetch leaves nothing pending and is asked for again` — **Bug caught:** K pending
  forever (the loop never sleeps), or never refetched.
- `a superseded manifest never lands` — Earth frame, Mars frame, fold `manifestLoaded(earth)`: `params`
  null, awake, no `demand`. **Bug caught:** Mars tiles requested under Earth's prefix.
- `a pull-back empties the cut but keeps residency` — **Bug caught:** a stale cut after pull-back, or a
  refetch storm on return.
- `a quiet frame returns prev by identity` — empty fold, idle disengaged step, engaged step with no
  misses keep identities. **Bug caught:** per-frame map copies.
- Port the logic cases of `surfaceTileSubsystem.test.ts` (manifest validation, base level, engage gate,
  `readyAtMs`, height 0 for a non-engaged body, debug snapshot) as step/selector tests; Task 5 deletes
  the originals.

- [ ] Task 4

### Task 5: a stream runs the effects, reads become selectors, the imperative API goes (P8b)

review: yes

**Files:** `surfaceTileSubsystem.ts` → `surfaceTileStream.ts` (`npm run move-files`, then
`createSurfaceTileSubsystem` → `createSurfaceTileStream` via `npm run refactor`);
`SurfaceTileSubsystem.d.ts` → `SurfaceTileStream.d.ts` + `SurfaceTiles.d.ts`;
`EngineSubsystemHandles.d.ts:39`, `wireSlots.ts:95`, `engine.ts:61,213,437-438,504-505`; `runFrame.ts`;
the `surfaceTilePlanner/` files; `surfaceTilesPass.ts`, `terrainPickMarkerPass.ts`,
`surfaceTileTerrain.ts`; tests (`surfaceTileStream.test.ts`, `planSurfaceTiles.test.ts`, `runFrame.test.ts`).

```ts
export type SurfaceTileStream = Destroyable & {
  run(effects: readonly SurfaceTileEffect[]): void;  // synchronous, in order
  drainEvents(): readonly SurfaceTileEvent[];         // arrival order; empties the queue
  getAtlasView(): GPUTextureView | null;
  getHeightAtlasView(): GPUTextureView | null;
};
export type SurfaceTiles = Destroyable & { readonly stream: SurfaceTileStream; runtime: SurfaceTileRuntime };
export function planSurfaceTiles(prev: SurfaceTileRuntime, views: readonly FrameView[],
  committedTier: (bodyId: SurfaceTileBodyId) => Tier): { readonly next: SurfaceTileRuntime;
  readonly effects: readonly SurfaceTileEffect[]; readonly result: PlannerResult<readonly SurfaceCutTile[]> };
```

- `runFrame`: at the head, before `stepCameraRuntime`,
  `tiles.runtime = foldSurfaceTileEvents(tiles.runtime, tiles.stream.drainEvents())`; at the planning
  point, `tiles.runtime = next; tiles.stream.run(effects)`.
- Stream: uploads on fetch completion, queues `tileLoaded` (`readyAtMs`, uv from `slots.slotUv`);
  `upload()` null → `tileDeclined`; evict handlers → `tileEvicted`; `allocate()` null → `tileDropped`;
  null fetch → `tileFailed`; manifest fetch → `manifestLoaded`; a destroyed or released stream queues
  nothing (`tileStreamSubsystem.ts:90-93`).
- Deleted from the stream: `plannerParams`, `update`, `residentSlot`, `terrainHeightAt`,
  `residentHeightLevelAt`, `setLastCut`/`getLastCut`, `engagedBodyId`, `release`, `isAnimating`,
  `getDebugSnapshot`. Passes read `tiles.runtime.cut` and `terrainHeightOf(tiles.runtime, …)`;
  `surfaceTileTerrain` reads the runtime through the selectors (`LayerTerrain` unchanged);
  `engine.debug.surfaceTiles` returns `surfaceTileDebugOf(runtime)` until P7.
- Contract widenings: none. Anything needing the runtime other than through `state.subsystems` is a STOP.

**Tests:**

- `heights that land between frames reach the camera that frame` (`runFrame.test.ts`). **Bug caught:**
  the camera floor a frame behind the drawn terrain.
- `an upload into a recycled slot reports declined, never loaded`. **Bug caught:** the cut names a slot
  holding another tile.
- `a released stream reports nothing from fetches still in flight` (and closes the bitmap). **Bug
  caught:** Earth residency repopulating after a switch to Mars, or leaked bitmaps.
- `touch runs before any allocate in one demand`. **Bug caught:** the eviction cascade (`:335-341`).
- Port `planSurfaceTiles.test.ts` to a runtime; its three bug names stand.

- [ ] Task 5

**P8 perf estimate and ruling.** Worst pose: Earth at street level, mono, streaming (4 fetches in
flight, both atlases near full: 256 albedo + 1,024 height slots, `surfaceTileParams.ts:31,40,45`).
`cutSurfaceTiles` is unchanged and dominant. Added on a streaming frame: the fold copies each touched
product map once (≤ 1,280 entries, ~30–60 µs), the step copies `pending` only on frames with misses;
`surfaceTilePath` runs once per request instead of twice. ≤ ~0.1 ms desktop, ~0.3 ms phone, only while
tiles land; a quiet frame costs 0. `subCameraOf` drops from O(resident) to O(1). **Ruling: no perf gate.**

**Known risks:** off-frame readers (`liveWorldPose`, `engine.ts:530-532`; the debug handle) see
residency as of the last fold, not the instant a tile lands; the runtime's `failed` set mirrors the
stream's `failedKeys` (both cleared only on eviction; a second clear path in the stream would make them
drift); porting the 873-line `surfaceTileSubsystem.test.ts` is most of the effort.

### P7 placement (R6)

No clean interim writer exists while core owns the runtime: a core fact (field, action, selector) or
core dispatching into the body Layer's facts would both be deleted one PR later. After Task 4 the
snapshot is a pure selector, so P7 is small. Recommended: P7 lands in the body PR (its tile planner
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
