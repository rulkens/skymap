# Terrain F3a — the height lookup

Spec: [`2026-09-13-per-planet-terrain-design.md`](../specs/2026-09-13-per-planet-terrain-design.md)
§5.3, §8 (amended 2026-09-16 and 2026-09-17), §11, §12.

Earth draws displaced terrain (F1+F2) that the engine does not know about: the camera
floor, surface-fixed site placement and the altitude readouts all still use the smooth
datum sphere. F3a adds one query and routes three consumers to it. F4's rovers depend on
it — all four `SURFACE_FIXED_SITES` rows are Mars and all four sit 1.4–4.5 km below the
datum.

**Read §8.2 and §8.4 before starting.** Two design decisions are already made and are not
open: the conservative `ceilingHeightM` bound and the compiled §3.4e grid were withdrawn
(one estimator, no monotonicity promise), and the CPU gets its posts from a decimated grid
in the `SHGT` header chunk — **not** by reading pixels, which #736 forbids.

## Packaging and sequence

Two PRs, per the user's ruling at the refactor-ground checkpoint.

- **PR 1 (prep)** — P1, P2. No behaviour change.
- **PR 2 (feature)** — F0–F3, including a height-product re-bake and R2 sync.

#738 landed as `0bd22dd0c` and this branch is rebased onto it. Two things it changed that
this plan is written against: the surface-tile helpers moved
`src/utils/scene/` → `src/utils/surfaceTiles/`, and `mergeSurfaceTileManifest.ts` now
makes a height-only bake safe (it no longer drops albedo provenance from `manifest.json`).

## Parallelism and perf

P1/P2 are independent of each other. F0 gates F1 (the decoder is what F1 reads); F2
depends on F1; F3 depends on P2 and F2. `terrainHeightM` runs on per-frame camera paths
(`bodyRung.step`/`engage`/`release`, `deriveBodyStates`), so `npm run perf` before and
after PR 2, with this worktree's own `--url`. A neutral-or-negative result halts landing
and the call is the user's.

---

## PR 1 — prep

### P1: extract the deepest-resident-ancestor climb

**Files:** `src/utils/surfaceTiles/deepestResidentAncestor.ts` (new),
`src/utils/surfaceTiles/cutSurfaceTiles.ts` (modify),
`src/utils/surfaceTiles/resolveHeightLattice.ts` (modify),
`tests/utils/surfaceTiles/deepestResidentAncestor.test.ts` (new)
**review: yes** — renderer walk, a landmine file.

The same ancestor climb is hand-rolled three times: `reliefHeadroom`
(`cutSurfaceTiles.ts:253`), `resolveCutResidency` (`:423`) and `resolveHeightLattice.ts:26`.
`terrainHeightM` would be the fourth. Consolidate first.

**Signature:**

```ts
export function deepestResidentAncestor<T>(
  tile: SurfaceTileId,
  minLevel: number,
  lookup: (tile: SurfaceTileId) => T | null,
  maxLevelDelta?: number,
): { readonly found: T; readonly levelDelta: number } | null;
```

- [x] Add the helper, generic over the lookup's payload so all four callers (three now,
      `terrainHeightM` later) share one climb and query once per level, not twice.
- [x] **Preserve each call site's existing bounds exactly.** All three loops are
      `z - levelDelta > baseLevel` — strictly greater, so none probes `baseLevel` itself —
      but only `resolveHeightLattice` also caps at `MAX_LEVEL_DELTA` (7, past which `cells`
      hits 0). That cap is why `maxLevelDelta` is optional; do not apply it to the other
      two, and do not unify the floors.
- [x] Test `deepestResidentAncestor stops at minLevel` and
      `deepestResidentAncestor returns null when nothing in the chain is resident` — the
      `minLevel` boundary is the off-by-one this extraction can silently move. No test for
      the happy path; `cutSurfaceTiles.test.ts` already covers it through the callers.
- [x] Test `resolveHeightLattice` from a shifted start — the review found the new
      `MAX_LEVEL_DELTA - startDelta` arithmetic had no coverage; two cases pin it from both
      sides, mutation-verified (`81d7fdfe7`).
- [x] `npm test -- cutSurfaceTiles resolveHeightLattice deepestResidentAncestor` green.
- [x] Commit.

### P2: the floor's radius becomes a per-direction lookup

**Files:** `src/services/engine/camera/rungs/bodyRung.ts`,
`src/utils/camera/flooredBodyPose.ts`, `src/utils/camera/hostedFocusOverHorizon.ts`,
`src/services/engine/camera/poseFrameConversion.ts`, the `HostBody` type,
plus the call sites those three signature changes reach
(`anchoredZoomStep.ts`, `settledZoomPose.ts`, `src/services/camera/surfaceStep.ts`,
`bodyRung.ts`, `src/state/camera/watchFlyToLonLatSaga.ts`)
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

- [x] Add the field at `bodyRung.ts`'s `host()`, returning the datum.
- [x] Switch the three `surfaceFloorM` callers to source their radius from it.
      `surfaceFloorM`'s own signature does not change — only the value it is handed.
- [x] **Leave `HostBody.radiusM` alone.** It also feeds pivot maths
      (`pivotRadiusMpc.ts`) and site placement (`sitePointBodyFixed`), which want the
      datum and keep it. Spec §3.4a deleted a global `radiusM` precisely to stop one
      scalar serving several currencies; do not add a second scalar beside it.
- [x] No new test — a no-op plumbing change the compiler checks, per
      [`testing.md`](../conventions/testing.md).
- [x] `npm run typecheck && npm test` green; the app looks identical.
- [x] Commit.

---

## PR 2 — the feature

### F0: `SHGT` v3 — the CPU post grid

**Files:** `src/data/scene/heightTileFormat.ts`,
`src/@types/scene/HeightTileHeader.d.ts`, `src/utils/surfaceTiles/decodeHeightTileHeader.ts`,
`tools/utils/textures/encodeHeightTile.ts`, `tools/utils/textures/readHeightTileFile.ts`,
`tests/tools/utils/textures/decodeHeightTile.test.ts` (modify)
**review: yes** — binary format.

Spec §8.4. The grid is a decimated copy of the image's own pixels, byte-identical, in
pixel order — same 24-bit Terrain-RGB code, same global step, rows NORTH-first. No second
encoding: `heightCode.ts` and `codeHeightM.ts` serve both sides.

**Format delta** (append to `heightTileFormat.ts`'s byte table, which is the authority):

```
HEIGHT_TILE_VERSION            2 → 3
HEIGHT_GRID_STRIDE             8
HEIGHT_GRID_POSTS_PER_EDGE     17          // (129 - 1) / 8 + 1, exact
HEIGHT_GRID_BYTES              867         // 17 · 17 · 3
HEIGHT_TILE_GRID_OFFSET        16
HEIGHT_TILE_CHUNK_BYTES        16 → 883

  off  size      field
   16   867  u8  grid[]   R,G,B per post, row-major, NORTH row first,
                          image pixels (8i, 8j) for i,j in 0..16
```

`HeightTileHeader` gains `readonly gridCodes: Uint8Array` (867 B, the raw bytes — decode
to metres at read time via `codeHeightM`, so the header stays allocation-cheap).

- [x] Bump the version and extend the byte table in the module header. `decimateHeightGrid.ts`
      already exists — check whether it gives the stride-8 subset directly before writing
      anything new.
- [x] Test `encode/decode round-trips the v3 grid` and
      `grid post (i, j) equals image pixel (8i, 8j)` — the second is the only place the CPU
      and the shader can silently diverge (§11). Assert against the tile's own pixels, not
      against a recomputed expectation.
- [x] Test `decodeHeightTileHeader rejects a v2 chunk` — a stale cached tile must fail
      loudly at the decoder, not read 867 B of neighbouring memory as heights.
- [x] `npm test -- heightTile` green.
- [x] Commit.

### F0b: re-bake the height product and sync

**Files:** none in `src/`; `public/data/images/earth-tiles/` and R2.

- [x] Re-bake **height only** — `mergeSurfaceTileManifest.ts` (#738) keeps albedo
      provenance, which is what used to make this unsafe. Prefix v9 → v10.
- [x] **This worktree's `public/data` is symlinked to main's**, so the bake writes into
      every server's tiles. Confirm with the user before running it, and never run
      `build-surface-tiles --product albedo` alone.
- [ ] Sync the height product to R2 and purge; #742 fixed the CORS-variant purge.
      **After the merge, not before** — the deployed JS decodes v2 only, so shipping
      v3 tiles early flattens terrain on the live site. The bake kept the `v9` prefix
      (one `prefix` field covers both products; bumping it during a height-only bake
      would point the manifest at `v10` albedo tiles that do not exist), so the purge
      is required rather than optional.
- [x] 20,684 height tiles, 180 MB → ~198 MB expected (+10%). A materially different figure
      means the grid is not being written, or is being written uncompressed into the image.

### F1: `terrainHeightM`

**Files:** `src/utils/surfaceTiles/terrainHeightM.ts` (new),
`src/@types/scene/ResidentHeightLookup.d.ts` (new),
`tests/utils/surfaceTiles/terrainHeightM.test.ts` (new)
**review: yes** — post addressing against the tile format.

**Signatures:**

```ts
// src/@types/scene/ResidentHeightLookup.d.ts
export type ResidentHeightLookup = (tile: SurfaceTileId) => HeightTileHeader | null;

// src/utils/surfaceTiles/terrainHeightM.ts
export function terrainHeightM(
  dirBodyFixed: Vec3,
  deepestLevel: number,
  baseLevel: number,
  resident: ResidentHeightLookup,
): number;
```

**Behaviour:** climb from `deepestLevel` via `deepestResidentAncestor` (P1) to the deepest
resident height tile containing `dirBodyFixed`; return the bilinear interpolation of that
tile's **17×17 header grid**, in metres above the datum. Nothing resident in the chain → `0`.

Facts the implementation must hold, all already written down elsewhere — carry them, do
not re-derive:

- The grid is **17 posts spanning 16 cells**, at image stride 8. Mapping the in-tile
  fraction with `×17` instead of `×16` gives plausible heights that are wrong by a
  sub-texel amount growing with level — rovers sink and nothing looks broken.
- **Row 0 is the NORTH row** (`heightTileFormat.ts:15-16`) while the vertex lattice counts
  north from the patch's _south_ edge. `vertex.wesl` flips `j` for this reason; a CPU
  reader must flip too.
- Direction → tile x/y goes through the existing `surfaceTileXyForUv.ts`; do not write a
  second mercator projection.
- `latticeHeightSample.ts` is the existing tested f64 twin of `lattice.wesl`'s sampler.
  Reuse it with a `postM` that reads the grid, rather than writing a second bilinear.
- Every 24-bit code maps to a finite height — no sentinels or NaNs to guard.
- **A zero `dirBodyFixed` reaches this function.** P2's review found three sites that can
  pass one: `flooredBodyPose.ts:29` queries _before_ its own `magM === 0` guard, and
  neither `toWorldArm` nor `hostedFocusOverHorizon` guards at all. A zero vector has no
  direction, so `terrainHeightM` must define the answer rather than normalize a zero and
  return `NaN`. Return `0` (the datum), same as every other miss — and do not "fix" the
  callers' guards in this task.

- [x] Test `terrainHeightM falls back to the deepest resident ancestor` — the leaf's own
      tile absent, an ancestor resident: reads the ancestor's grid, not `0`.
- [x] Test `terrainHeightM returns exactly 0 when no ancestor is resident` — asserting
      `0`, and `Number.isFinite`. A `NaN` here becomes a `NaN` camera position and a black
      screen with no error.
- [x] Test `terrainHeightM returns 0 for a zero direction vector` — the three unguarded
      call sites above make this reachable in production, and its failure mode is the same
      black screen.
- [x] Test `terrainHeightM reads a shared post identically from both levels` — a post
      coincident at levels _L_ and _L+1_ (strict decimation, §3.4c-R1, guarantees the
      coarse post _is_ the fine post) reads the same metres from either. This is the
      half-texel and north-flip guard in one, and nothing else in the suite catches it.
- [x] `npm test -- terrainHeightM` green.
- [x] Commit.

### F2: retain the header grids, expose one query

**Files:** `src/services/engine/subsystems/surfaceTileSubsystem.ts`,
`src/@types/engine/subsystems/SurfaceTileSubsystem.d.ts`,
`tests/services/engine/subsystems/surfaceTileSubsystem.test.ts` (modify)
**review: yes** — subsystem lifetime.

`heightResident` (`surfaceTileSubsystem.ts:371-375`) already keeps a `ResidentTile` per
atlas-resident height tile and stores `subtreeRangeM` from the header. Keep the grid
beside it — 867 B × 1024 slots ≈ 890 KB, so **no cache, no cap, no eviction policy**; the
existing evict handler at `:280` already clears entries.

**Contract:** the subsystem gains

```ts
terrainHeightAt(bodyId: BodyId, dirBodyFixed: Vec3): number;
```

composing `terrainHeightM` with its own residency and the manifest's deepest band level
for that direction (`deepestBandLevelAt`, already present). Returns `0` when `bodyId` is
not the engaged body — body-generic, so Mars is a registry row away.

- [x] Add the grid to `ResidentTile` and to what the height `onResult` stores.
- [x] Test `terrainHeightAt returns 0 for a body that is not engaged` — the body-generic
      contract, and the guard against a Mars query silently reading Earth's atlas once F4
      adds the second row.
- [x] `npm test -- surfaceTileSubsystem` green.
- [x] Commit.

### F3: route the three consumers

**Files:** `src/services/engine/camera/rungs/bodyRung.ts`,
`src/utils/camera/sitePointBodyFixed.ts`, `src/services/engine/frame/deriveBodyStates.ts`,
`src/utils/camera/cameraDebugSnapshotOf.ts`, `src/data/bodies/surfaceFixedSites.ts`
**review: yes** — camera/pose maths.

Spec §8.3's F3a table. Three rows, and only three:

| row                    | change                                                                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ground collision       | `HostBody.groundRadiusAtM` (P2) starts returning `datumRadiusM + terrainHeightAt(dir)` instead of the datum                                            |
| site placement         | `sitePointBodyFixed.ts` and `deriveBodyStates.ts` use `datumRadiusM + terrainHeightAt(dir) + site.altitudeM`                                           |
| eye-to-ground readouts | `cameraDebugSnapshotOf.ts`'s `altitudeM` subtracts the terrain height. DebugPanel and `CameraStateSection.tsx` read this snapshot; no UI change needed |

- [x] **Do not touch the h/R band arithmetic.** `hOverR`, `nearestBodyHR`,
      `bodyUpWeight`, `mappedTiltRad`, `approachTiltedPose`, `releasedWorldRoll`,
      `pivotRadiusMpc` stay on `datumRadiusM` (§8.3). They are behaviour, not readout;
      routing them to terrain would change camera feel and is not in scope.
- [x] `site.altitudeM` is the **mesh's wheel lift** read from `MESH_ASSETS`
      (`surfaceFixedSites.ts:16-20`), not an elevation — it adds on top of the terrain
      height, it is not replaced by it. No site row changes.
- [x] Delete the now-false sentence in `surfaceFixedSites.ts`'s docstring: "Heights are
      measured from Mars's mean 3390 km sphere, so areoid-relative site elevations are not
      modelled."
- [x] No new tests — a routing change, per [`testing.md`](../conventions/testing.md). The
      behaviour it produces is the eye-check below.
- [x] `npm run typecheck && npm test` green.
- [ ] ~~`npm run perf`~~ — **waived by the user, 2026-09-17.** Not run before or after.
- [x] Commit.

---

## Definition of Done

**Deliverables**

- `src/utils/surfaceTiles/deepestResidentAncestor.ts`, with the three hand-rolled climbs
  collapsed onto it.
- `SHGT` v3 in `src/data/scene/heightTileFormat.ts`, written by the bake and read by
  `decodeHeightTileHeader`.
- The height product re-baked to v10 and synced to R2.
- `src/utils/surfaceTiles/terrainHeightM.ts` + `src/@types/scene/ResidentHeightLookup.d.ts`.
- `SurfaceTileSubsystem.terrainHeightAt(bodyId, dirBodyFixed)`.
- `HostBody.groundRadiusAtM(dirBodyFixed)`.

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
- **Zoom in and back out over steep ground returns you where you started.**
  `anchoredZoomStep`'s nadir-fallback anchor sits on the datum (P2's review), so once the
  floor is terrain-aware, "one notch out undoes one notch in" is measured against a
  different surface than the floor pushes off. Whether that asymmetry is visible is an
  eye-check question, not an arithmetic one; if it is, fixing it is its own change, not a
  widening of F3a.

**Deferral boundary** — out of scope, do not chase

- Everything in §8.3 that F3a's table does not name: pick/`raycast`, the horizon-cap
  occludee, the cloud-deck altitude, the atmosphere rows, the remaining `radiusM` routing.
  That is F3b.
- Mars. F3a is body-generic and reads whichever body the tile subsystem has engaged;
  adding the Mars row is F4. Mars tiles will need the v3 grid when they are first baked —
  that is automatic, not a task here.
- The conservative `ceilingHeightM` bound, the `ceiling`/`best` split, `boundsM`, and the
  compiled §3.4e grid — all withdrawn, see spec §8.2.
- A finer grid stride. 17×17 is the ruling; revisit only if the eye-check shows the rover
  or the floor visibly off the drawn surface.
- Rate-limiting the floor's rise. Only if the eye-check shows the hillside-clip that §8.2
  prices, and then as its own change.
