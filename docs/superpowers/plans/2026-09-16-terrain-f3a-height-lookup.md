# Terrain F3a — the height lookup

Spec: [`2026-09-13-per-planet-terrain-design.md`](../specs/2026-09-13-per-planet-terrain-design.md)
§8 (amended 2026-09-16), §11, §12.

Earth draws displaced terrain (F1+F2) that the engine does not know about: the camera
floor, surface-fixed site placement and the altitude readouts all still use the smooth
datum sphere. F3a adds one query and routes three consumers to it. F4's rovers depend on
it — all four `SURFACE_FIXED_SITES` rows are Mars and all four sit 1.4–4.5 km below the
datum.

**Read §8.2 before starting.** The spec's conservative `ceilingHeightM` bound and the
compiled §3.4e grid were withdrawn on 2026-09-16; there is one estimator, not two, and no
monotonicity promise. Building either back is out of scope.

## Packaging and sequence

Two PRs, per the user's ruling at the refactor-ground checkpoint.

- **PR 1 (prep)** — P1, P2. No behaviour change. Touches `cutSurfaceTiles.ts` and
  `bodyRung.ts`, neither of which PR #738 modifies, so it can land in parallel with the
  Mars F4 prep.
- **PR 2 (feature)** — F1–F3. Two of its three feature files (`surfaceTileSubsystem.ts`,
  `deriveBodyStates.ts`) are edited by #738, which also renames
  `earthSurfaceTilesPass.ts` → `surfaceTilesPass.ts`. **Land #738 first and rebase**, or
  expect to resolve those by hand.

## Parallelism and perf

P1/P2 are independent of each other; F1 is independent of P1/P2; F2 depends on F1; F3
depends on P2 and F2. `terrainHeightM` runs on per-frame camera paths
(`bodyRung.step`/`engage`/`release`, `deriveBodyStates`), so `npm run perf` before and
after PR 2, with this worktree's own `--url`. A neutral-or-negative result halts landing
and the call is the user's.

---

## PR 1 — prep

### P1: extract the deepest-resident-ancestor climb

**Files:** `src/utils/scene/deepestResidentAncestor.ts` (new),
`src/utils/scene/cutSurfaceTiles.ts` (modify),
`tests/utils/scene/deepestResidentAncestor.test.ts` (new)
**review: yes** — renderer walk, a landmine file.

`cutSurfaceTiles.ts` hand-rolls the same ancestor climb three times (`reliefHeadroom` at
`:252-266`, plus `resolveCutResidency` and `resolveHeightLattice`). `terrainHeightM`
would be the fourth. Consolidate first.

**Signature:**

```ts
export function deepestResidentAncestor<T>(
  tile: SurfaceTileId,
  minLevel: number,
  lookup: (tile: SurfaceTileId) => T | null,
): { readonly found: T; readonly levelDelta: number } | null;
```

- [ ] Add the helper, generic over the lookup's payload so all four callers (three now,
      `terrainHeightM` later) share one climb and query once per level, not twice.
- [ ] **Preserve each call site's existing floor level exactly.** `reliefHeadroom`'s loop
      is `z - levelDelta > baseLevel` — strictly greater, so it never probes `baseLevel`
      itself, while the lattice resolver does. Pass each site's current bound as
      `minLevel`; do not unify them.
- [ ] Test `deepestResidentAncestor stops at minLevel` and
      `deepestResidentAncestor returns null when nothing in the chain is resident` — the
      `minLevel` boundary is the off-by-one this extraction can silently move. No test
      for the happy path; `cutSurfaceTiles.test.ts` already covers it through the callers.
- [ ] `npm test -- cutSurfaceTiles deepestResidentAncestor` green.
- [ ] Commit.

### P2: the floor's radius becomes a per-direction lookup

**Files:** `src/services/engine/camera/rungs/bodyRung.ts`,
`src/utils/camera/flooredBodyPose.ts`, `src/utils/camera/hostedFocusOverHorizon.ts`,
`src/services/engine/camera/poseFrameConversion.ts`, the `HostBody` type,
plus the call sites those three signature changes reach
(`anchoredZoomStep.ts:56`, `settledZoomPose.ts:106`, `src/services/camera/surfaceStep.ts:98`,
`bodyRung.ts:93/:129/:144/:145-151`, `src/state/camera/watchFlyToLonLatSaga.ts:76`)
**review: yes** — camera/pose maths.

`surfaceFloorM(datumRadiusM, standoffRadii)` (`src/utils/camera/surfaceFloorM.ts:5-7`) is
a pure scalar with no direction. Its three callers each already hold a body-fixed eye
vector (`bodyFixedEyeM`, or `eyeLocalM`/`forwardLocal` in `toWorldArm`). Give them a
lookup instead of a bare radius, so the feature PR only swaps the implementation.

**Contract:** `HostBody` gains

```ts
groundRadiusAtM(dirBodyFixed: Vec3): number;
```

**In this PR it returns `body.surface.datumRadiusM` unchanged.**

- [ ] Add the field at `bodyRung.ts:51-61`'s `host()`, returning the datum.
- [ ] Switch the three `surfaceFloorM` callers to source their radius from it.
      `surfaceFloorM`'s own signature does not change — only the value it is handed.
- [ ] **Leave `HostBody.radiusM` alone.** It also feeds pivot maths
      (`pivotRadiusMpc.ts`) and site placement (`sitePointBodyFixed`), which want the
      datum and keep it. Spec §3.4a deleted a global `radiusM` precisely to stop one
      scalar serving several currencies; do not add a second scalar beside it.
- [ ] No new test — a no-op plumbing change the compiler checks, per
      [`testing.md`](../conventions/testing.md).
- [ ] `npm run typecheck && npm test` green; the app looks identical.
- [ ] Commit.

---

## PR 2 — the feature

### F1: `terrainHeightM`

**Files:** `src/utils/scene/terrainHeightM.ts` (new),
`src/@types/scene/ResidentHeightLookup.d.ts` (new),
`tests/utils/scene/terrainHeightM.test.ts` (new)
**review: yes** — post addressing against the tile format.

**Signatures:**

```ts
// src/@types/scene/ResidentHeightLookup.d.ts
export type ResidentHeightLookup = (tile: SurfaceTileId) => HeightTile | null;

// src/utils/scene/terrainHeightM.ts
export function terrainHeightM(
  dirBodyFixed: Vec3,
  deepestLevel: number,
  baseLevel: number,
  resident: ResidentHeightLookup,
): number;
```

**Behaviour:** climb from `deepestLevel` via `deepestResidentAncestor` (P1) to the deepest
resident height tile containing `dirBodyFixed`; return the bilinear interpolation of that
tile's posts, in metres above the datum. Nothing resident in the chain → `0`.

Facts the implementation must hold, all already written down elsewhere — carry them, do
not re-derive:

- A height tile is `HEIGHT_POSTS_PER_TILE` = **129 posts per edge spanning 128 cells**
  (`src/data/scene/heightTileFormat.ts`). Mapping the in-tile fraction with `×129` gives
  plausible heights that are wrong by a sub-texel amount growing with level — rovers sink
  and nothing looks broken.
- **Row 0 of a height tile is its NORTH row** (`heightTileFormat.ts:16-17`,
  `decodeHeightTile.ts`) while the vertex lattice counts north from the patch's _south_
  edge. `vertex.wesl` flips `j` for this reason; a CPU reader must flip too.
- Direction → tile x/y goes through the existing `surfaceTileXyForUv.ts:22-27`; do not
  write a second mercator projection.
- Every 24-bit code maps to a finite height — there are no sentinels or NaNs to guard
  (`decodeHeightTile.ts:19-20`).

- [ ] Test `terrainHeightM falls back to the deepest resident ancestor` — the leaf's own
      tile absent, an ancestor resident: reads the ancestor's posts, not `0`.
- [ ] Test `terrainHeightM returns exactly 0 when no ancestor is resident` — asserting
      `0`, and `Number.isFinite`. A `NaN` here becomes a `NaN` camera position and a black
      screen with no error.
- [ ] Test `terrainHeightM reads a shared post identically from both levels` — a post
      coincident at levels _L_ and _L+1_ (strict decimation, §3.4c-R1, guarantees the
      coarse post _is_ the fine post) reads the same metres from either. This is the
      half-texel and north-flip guard in one, and nothing else in the suite catches it.
- [ ] `npm test -- terrainHeightM` green.
- [ ] Commit.

### F2: retain the decoded heights, expose one query

**Files:** `src/services/engine/subsystems/surfaceTileSubsystem.ts`,
`src/@types/engine/subsystems/SurfaceTileSubsystem.d.ts`,
`src/data/scene/terrainHeightCacheTiles.ts` (new),
`tests/services/engine/subsystems/surfaceTileSubsystem.test.ts` (modify)
**review: yes** — subsystem lifetime and the decode/upload seam.

Today the decode is dropped: `surfaceTileSubsystem.ts:279` is `release: () => {}` ("A
decoded height tile is plain JS memory; nothing to hand back") and `:362-380` keeps only
`subtreeRangeM`. Keep the array instead — the same one the atlas was handed, so one decode
serves both consumers.

**Contract:** the subsystem gains

```ts
terrainHeightAt(bodyId: BodyId, dirBodyFixed: Vec3): number;
```

composing `terrainHeightM` with its own residency and the manifest's deepest band level
for that direction (`deepestBandLevelAt`, already present around `:482-489`). Returns `0`
when `bodyId` is not the engaged body — body-generic, so Mars is a registry row away.

- [ ] Retain decoded tiles in an insertion-ordered cache capped at
      `TERRAIN_HEIGHT_CACHE_TILES`, a named constant in `src/data/scene/`, **not** for the
      whole atlas. Arithmetic for the commit message: 129² × 4 B = 66.6 KB per tile, so
      mirroring the 1024-slot height atlas would put ~68 MB on the JS heap beside the 68 MB
      already on the GPU — a real regression on Adreno. 128 tiles ≈ 8.5 MB, and queries
      only ever touch the chain under the camera plus one per site, so the coarse levels
      stay hot by construction.
- [ ] Correct the `:279` comment — it now states the opposite of what the code does.
- [ ] Test `terrainHeightAt returns 0 for a body that is not engaged` — the body-generic
      contract, and the guard against a Mars query silently reading Earth's atlas once F4
      adds the second row. No test for the cache's eviction order: it is an LRU with no
      correctness claim resting on it.
- [ ] `npm test -- surfaceTileSubsystem` green.
- [ ] Commit.

### F3: route the three consumers

**Files:** `src/services/engine/camera/rungs/bodyRung.ts`,
`src/utils/camera/sitePointBodyFixed.ts`, `src/services/engine/frame/deriveBodyStates.ts`,
`src/utils/camera/cameraDebugSnapshotOf.ts`, `src/data/bodies/surfaceFixedSites.ts`
**review: yes** — camera/pose maths.

Spec §8.3's F3a table. Three rows, and only three:

| row                    | change                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ground collision       | `HostBody.groundRadiusAtM` (P2) starts returning `datumRadiusM + terrainHeightAt(dir)` instead of the datum                                                   |
| site placement         | `sitePointBodyFixed.ts:11-13` and `deriveBodyStates.ts:83-85` use `datumRadiusM + terrainHeightAt(dir) + site.altitudeM`                                      |
| eye-to-ground readouts | `cameraDebugSnapshotOf.ts:98`'s `altitudeM` subtracts the terrain height. The DebugPanel and `CameraStateSection.tsx` read this snapshot; no UI change needed |

- [ ] **Do not touch the h/R band arithmetic.** `hOverR`, `nearestBodyHR`,
      `bodyUpWeight`, `mappedTiltRad`, `approachTiltedPose`, `releasedWorldRoll`,
      `pivotRadiusMpc` stay on `datumRadiusM` (§8.3). They are behaviour, not readout;
      routing them to terrain would change camera feel and is not in scope.
- [ ] `site.altitudeM` is the **mesh's wheel lift** read from `MESH_ASSETS`
      (`surfaceFixedSites.ts:16-20`), not an elevation — it adds on top of the terrain
      height, it is not replaced by it. No site row changes.
- [ ] Delete the now-false sentence in `surfaceFixedSites.ts`'s docstring: "Heights are
      measured from Mars's mean 3390 km sphere, so areoid-relative site elevations are not
      modelled."
- [ ] No new tests — a routing change, per [`testing.md`](../conventions/testing.md). The
      behaviour it produces is the eye-check below.
- [ ] `npm run typecheck && npm test` green.
- [ ] `npm run perf` against this worktree's `--url`, compared with the pre-PR-2 baseline.
- [ ] Commit.

---

## Definition of Done

**Deliverables**

- `src/utils/scene/deepestResidentAncestor.ts`, with `cutSurfaceTiles.ts`'s three
  hand-rolled climbs collapsed onto it.
- `src/utils/scene/terrainHeightM.ts` + `src/@types/scene/ResidentHeightLookup.d.ts`.
- `SurfaceTileSubsystem.terrainHeightAt(bodyId, dirBodyFixed)`.
- `HostBody.groundRadiusAtM(dirBodyFixed)`.
- `src/data/scene/terrainHeightCacheTiles.ts`.

**Observable behaviours** (user's eye-check; use the `camera/flyToLonLat` action for
poses — Earth is focus-pinned at boot and its follow driver reverts bare camera writes)

- Flying from Everest to the Dead Sea, the camera floor **follows the terrain down** —
  you can descend below datum level at the Dead Sea, and cannot descend into the ground at
  Everest.
- **No upward camera pop on first load** at a low-altitude pose.
- The DebugPanel's `altitude_m` reads eye-to-**ground**, not eye-to-datum, and goes to
  roughly zero at ground level.
- Camera feel is unchanged: the regime-band transitions, zoom taper and tilt mapping
  behave as before, because their h/R inputs still use the datum.

**Deferral boundary** — out of scope, do not chase

- Everything in §8.3 that F3a's table does not name: pick/`raycast`, the horizon-cap
  occludee, the cloud-deck altitude, the atmosphere rows, the remaining `radiusM` routing.
  That is F3b.
- Mars. F3a is body-generic and reads whichever body the tile subsystem has engaged;
  adding the Mars row is F4 (#738 and its feature PR).
- The conservative `ceilingHeightM` bound, the `ceiling`/`best` split, `boundsM`, and the
  compiled §3.4e grid — all withdrawn, see spec §8.2.
- Rate-limiting the floor's rise. Only if the eye-check shows the hillside-clip that §8.2
  prices, and then as its own change.
