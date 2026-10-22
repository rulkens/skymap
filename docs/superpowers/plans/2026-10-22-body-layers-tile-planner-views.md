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

- [ ] Task 2

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
