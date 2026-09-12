# Voyager 1/2 and the Mars rovers — implementation plan

Spec: [`docs/superpowers/specs/2026-09-11-voyager-rovers-design.md`](../../specs/completed/2026-09-11-voyager-rovers-design.md).
Read its "Ground preparation", "Rulings" and "Testing" sections before Task 1 —
this plan is written against them and does not restate them.

Branch `worktree-voyager-rovers`, based on `worktree-whale-petunias-mesh-bodies`
(PR #678, unmerged). The PR targets that branch and is retargeted to `main` once
#678 lands. The three prep refactors (Tasks 1–3) are their own commits and ride
this PR (spec ruling 9).

## Task dependency table

| #   | Task                                                          | Depends on        | Wave |
| --- | ------------------------------------------------------------- | ----------------- | ---- |
| 1   | P1 — extract `perifocalAxesWorld`                             | —                 | 0    |
| 2   | P2 — `deriveOrbitConics` reads `TRAIL_ELEMENTS`               | —                 | 0    |
| 3   | P3 — phase-split `deriveBodyStates`                           | —                 | 0    |
| 4   | Hyperbolic solver + `keplerianPositionMpc` branch             | 1                 | 1    |
| 5   | `PositionDriver` union + `surfaceFixed` driver                | 3                 | 1    |
| 6   | `RotationElements` union + `lookAt` + `surfaceLocked`         | 3                 | 1    |
| 7   | `probe` maker                                                 | —                 | 1    |
| 8   | Bake reports `groundOffsetM`                                  | —                 | 1    |
| 9   | `meshBodySlabHostId` + hostless slab row + self-host lighting | 5                 | 2    |
| 10  | Assets: prebakes, `MESH_SOURCES`, `RAW_DATA`, `build-meshes`  | 8                 | 2    |
| 11  | The real seed rows                                            | 4, 5, 6, 7, 9, 10 | 3    |
| 12  | Fact-sheet rows                                               | —                 | 3    |
| 13  | Attributions + registry docblock + deploy check               | 10                | 4    |
| 14  | Perf, before and after                                        | 11                | 4    |
| 15  | Visual pass                                                   | 11, 12            | 4    |

**Waves** (`feedback_sdd_parallel_tasks`: own worktree per task, cherry-pick onto
the execution branch):

- **Wave 0** — {1, 2, 3} in parallel. Disjoint files, all behavioural no-ops
  except 2's deliberate table swap.
- **Wave 1** — {4, 5, 6, 7, 8} in parallel once 1 and 3 have landed.
- **Wave 2** — {9, 10} in parallel.
- **Wave 3** — {11, 12} in parallel.
- **Wave 4** — 13 anytime after 10; 14 and 15 serial at the end, 14 before 15 so
  a halt lands before the user is asked to look.

Task 11 is the one serializing hinge: every mechanism task must be green before
a real row exists that exercises it.

## Global constraints

- **One symbol per file** in `src/utils/`, `src/@types/`, `tools/utils/`;
  filename = symbol name; deep relative imports, no barrels. **Pass files under
  `src/services/engine/frame/passes/` declare ONLY the pass** — every helper or
  constant a task adds goes in its own file with a focused test, and
  `tests/services/engine/frame/passes/passFilePurity.test.ts` enforces it (its
  `ALLOWED` rows only ever go down). This line is repeated in each task below
  because it is the one that gets dropped.
- `type` aliases, never `interface`. `Vec3`/`Mat3` aliases, never raw tuples.
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the code lines.
- Tests: **only what each task lists**, mirroring the spec's "Testing" section.
  No constant/registry restatements, no mirrors, no runtime type tests, no
  clamp-boundary tests.
- File moves/renames go through `npm run move-files -- <from> <to>` (see
  `.claude/skills/refactor/SKILL.md`), never `git mv` plus hand-edited imports.
- `npm run typecheck:fast` is the inner loop; confirm the final state of each
  task against real `npx tsc --noEmit` before committing.
- Stage specific paths on commit; never `git add -A`. No `Co-Authored-By`
  trailer.

### Standing landmines (repeated in the tasks they bite)

1. **`e > 1` poisons `keplerianEllipse`** (`b = a·√(1 − e²)` → `NaN`). The
   hyperbolic path must never reach it, and `deriveOrbitConics` must never walk
   a hyperbolic row (Tasks 2, 4).
2. **`elementsById(id)` throws for a body with no orbital row.** Two live call
   sites (`meshBodiesAttachedTo`, `frameContext.ts:118`) would crash on a rover
   (Tasks 5, 9).
3. **`sunVisibleFraction` returns `NaN` at zero host separation**, and
   `hostSkyFraction(r, 0)` returns 0.5, not 0. A self-hosted body needs both
   terms skipped (Task 9).
4. **Positions cancel in Mpc, THEN scale to metres** — never the other way
   (`bodyStateInHostFrame`, `bodyRelativePose`). f64 throughout; narrow only at
   the uniform write (Tasks 5, 9).
5. **Longitude is EAST-positive** on the IAU Mars frame, and latitude is
   planetocentric. A west-positive conversion puts every rover on the wrong side
   of the planet and no test but the traverse one catches it (Tasks 5, 11).
6. **The bake recentres on the area-weighted surface centroid**
   (`buildMeshes.ts:340-380`), so a rover's origin is inside its chassis.
   `altitudeM` is `MESH_ASSETS[key].groundOffsetM`, never eyeballed (Tasks 8, 11).
7. **Mean anomaly is unwrapped.** Voyager 1's `M` at J2000 is 1249.78°, not
   169.78°. Nothing may normalise it to `[0, 2π)` (Tasks 4, 7).

---

## Task 1 — P1: extract `perifocalAxesWorld`

**Wave 0.** **Files:** `src/utils/orbit/perifocalAxesWorld.ts` (new),
`src/utils/orbit/keplerianEllipse.ts` (modify).

Behavioural no-op: `keplerianEllipse.ts:70-100` computes the perifocal axes
inline through a private `frameToWorld`; the hyperbolic position step (Task 4)
needs the identical pair.

**Signature:**

```ts
// src/utils/orbit/perifocalAxesWorld.ts
/** P̂ (toward periapsis) and Q̂ (90° prograde), mapped from the row's reference
 *  plane into equatorial world. `Rz(Ω)·Rx(i)·Rz(ω)`'s first two columns. */
export function perifocalAxesWorld(elements: OrbitalElements): {
  readonly pWorld: Vec3;
  readonly qWorld: Vec3;
};
```

- [x] Move the `px…qz` derivation and the private `frameToWorld` into the new
      file; `keplerianEllipse` imports it and keeps its own `a`/`e`/`b`/`aE`
      arithmetic.
- [x] No new test. `tests/utils/orbit/keplerianEllipse.test.ts`,
      `skyInclinationToFrameInclination.test.ts`, `sStar.test.ts` and
      `sceneOrbitConics.test.ts` staying green IS the test for a pure extraction.
- [x] **One symbol per file; pass files declare only the pass.**
- [x] `npm test -- orbit` green, `npx tsc --noEmit` green. Commit.

---

## Task 2 — P2: `deriveOrbitConics` reads `TRAIL_ELEMENTS`

**Wave 0.** **Files:** `src/data/bodies/sceneOrbitConics.ts` (modify),
`tests/data/bodies/sceneOrbitConics.test.ts` (modify).

One table decides which rows carry a drawn conic, and it is `TRAIL_ELEMENTS`
(`src/data/bodies/trailElements.ts`) — the table `orbitTrailsPass` already reads.
`deriveOrbitConics` walking `ORBITAL_ELEMENTS` instead is how a hyperbolic row
would reach `keplerianEllipse` and fill `SCENE_ORBIT_CONICS` with `NaN`
(landmine 1). Observable change today: the whale's and the petunias' rows leave
`SCENE_ORBIT_CONICS`, which draws no trail for them anyway.

- [x] Change `deriveOrbitConics`'s `elements` default from `ORBITAL_ELEMENTS` to
      `TRAIL_ELEMENTS`. The explicit-argument form (used by the anchor-focus
      test) is unchanged.
- [x] Update the module docblock to say which table it walks and why — one
      sentence, not a history note.
- [x] Add the test `the conic table excludes mesh bodies` asserting
      `SCENE_ORBIT_CONICS.some(c => c.id === 'whale')` is false. It fails if the
      default ever drifts back.
- [x] The existing `places each body on its own ellipse` test must stay green
      unchanged.
- [x] **One symbol per file; pass files declare only the pass.**
- [x] `npm test -- sceneOrbitConics orbitTrails` green. Commit.

---

## Task 3 — P3: phase-split `deriveBodyStates`

**Wave 0.** **Files:** `src/services/engine/frame/deriveBodyStates.ts` (modify),
`src/data/bodies/orientationForBody.ts` (modify), plus every
`orientationForBody` call site.

Behavioural no-op that makes Tasks 5 and 6 possible: today one loop sets position
and orientation together, so an orientation cannot read another body's position
and a position cannot read a host's orientation.

**New shape of `deriveBodyStates`:**

```
Phase 1 — positions into a Map<string, Vec3> (+ each row's propagated M)
  1a  SCENE_ANCHORS      authored
  1b  FOCUS_ORDER        the existing orbit loop, unchanged arithmetic
Phase 2 — orientations, over the finished position map, into the BodyState Map
```

**Signature change:**

```ts
// src/data/bodies/orientationForBody.ts
export function orientationForBody(
  id: string,
  simDays: number,
  positions: ReadonlyMap<string, Readonly<Vec3>>,
): Mat3;
```

- [x] Split the loops. The one-deep `simDays` memo, the `FOCUS_ORDER` module
      constant, and the `meanAnomalyRad` carried onto each state are unchanged.
- [x] Add `positions` to `orientationForBody`; the single existing arm ignores
      it. Document in one line **why** it takes a map it does not read: the
      `lookAt` arm (Task 6) will, and phase 1c (Task 5) calls this function
      mid-phase with a partial map, which is safe precisely because the
      `iau-pole` arm is position-independent.
- [x] Update every call site (`grep -rn orientationForBody src tests`).
- [x] No new test: the existing `deriveBodyStates` / `sceneOrbitConics` /
      `orbitTrailsPass` suites pin the values, and a phase split that changed one
      would break them.
- [x] **One symbol per file; pass files declare only the pass.**
- [x] `npm test` green (full suite — this touches the body snapshot every pass
      reads), `npx tsc --noEmit` green. Commit.

---

## Task 4 — Hyperbolic solver and the `keplerianPositionMpc` branch

**Wave 1**, depends on Task 1. **Files:**
`src/utils/orbit/hyperbolicAnomalyFromMean.ts` (new),
`src/utils/orbit/hyperbolicPositionMpc.ts` (new),
`src/utils/orbit/keplerianPositionMpc.ts` (modify),
`tests/utils/orbit/hyperbolicAnomalyFromMean.test.ts` (new).

Spec: "Hyperbolic orbits". `eccentricAnomalyFromMean` and `keplerianEllipse` are
**not** touched — this is a sibling, not a widening (landmine 1).

**Signatures:**

```ts
// src/utils/orbit/hyperbolicAnomalyFromMean.ts
/** Solve M = e·sinh H − H for H. `e > 1`; M is unwrapped and may be large. */
export function hyperbolicAnomalyFromMean(meanAnomalyRad: number, eccentricity: number): number;

// src/utils/orbit/hyperbolicPositionMpc.ts
/** Focus-relative position on a hyperbola, Mpc — the `e > 1` counterpart of
 *  `keplerianPositionMpc`'s ellipse evaluation. */
export function hyperbolicPositionMpc(elements: OrbitalElements): Vec3;
```

`keplerianPositionMpc` gains exactly one line at the top:
`if (elements.eccentricity > 1) return hyperbolicPositionMpc(elements);`

**Contract for `hyperbolicPositionMpc`** (`a` is negative, `P̂w`/`Q̂w` from
Task 1's `perifocalAxesWorld`):

```
X = C + A·cosh H + B·sinh H
A = a·P̂w        C = −a·e·P̂w        B = −a·√(e² − 1)·Q̂w
```

Newton seed `H₀ = asinh(M / e)`; `MAX_ITERATIONS = 40`, `TOLERANCE = 1e-14`
(same tolerance as the elliptic solver; the higher cap covers a near-parabolic
`e`, which neither Voyager is).

- [x] Test `hyperbolicAnomalyFromMean inverts the forward equation`: for
      `H ∈ {−3, −0.5, 0, 0.5, 3.4}` × `e ∈ {1.5, 3.7, 6.28}`, assert
      `hyperbolicAnomalyFromMean(e*Math.sinh(H) - H, e)` is close to `H` to 1e-10.
      A round-trip against the forward equation, not against the solver's own
      iteration — a wrong formula fails it, a mirror would not.
- [x] Test `periapsis sits at QR along the periapsis direction`: a fixture row
      with `meanAnomalyRad: 0`, `e = 3.7`, `a = −3.2153` au (in Mpc) →
      `|hyperbolicPositionMpc(row)|` equals `a·(1 − e)` in Mpc to 1e-12 relative.
      Hand-derived from the conic, not from the code.
- [x] **Do not normalise the mean anomaly** (landmine 7).
- [x] **One symbol per file; pass files declare only the pass.**
- [x] `npm test -- orbit` green. Commit.

---

## Task 5 — `PositionDriver` union and the `surfaceFixed` driver

**Wave 1**, depends on Task 3. **Files:**
`src/@types/scene/PositionDriver.d.ts` (new),
`src/@types/scene/SurfaceFixedSite.d.ts` (new),
`src/data/bodies/surfaceFixedSites.ts` (new, **empty array** — real rows in
Task 11), `src/data/bodies/positionDrivers.ts` (new),
`src/utils/scene/surfacePointBodyFixed.ts` (new),
`src/services/engine/frame/deriveBodyStates.ts` (modify),
plus new tests for `surfacePointBodyFixed` and `bodyHostId`.

Spec: "Position drivers as a tagged union". The union is a **derived read
surface** over the three authored tables — `SCENE_ANCHORS` and `ORBITAL_ELEMENTS`
keep their shapes and all of their existing consumers.

**Contracts** (exact shapes in the spec; repeated here only where a caller must
match them):

```ts
// src/@types/scene/SurfaceFixedSite.d.ts
export type SurfaceFixedSite = {
  readonly id: string;
  readonly hostId: string;
  /** Planetocentric latitude, degrees. */
  readonly latDeg: number;
  /** EAST-positive longitude, degrees, on the host's IAU body-fixed frame. */
  readonly lonDeg: number;
  /** Height above the host's mean sphere, metres. */
  readonly altitudeM: number;
};

// src/data/bodies/positionDrivers.ts
export const POSITION_DRIVERS: readonly PositionDriver[];
export function positionDriverById(id: string): PositionDriver; // throws on a miss
/** Orbit → `focusId`; surfaceFixed → `hostId`; anchor → null. */
export function bodyHostId(id: string): string | null;

// src/utils/scene/surfacePointBodyFixed.ts
export function surfacePointBodyFixed(latDeg: number, lonDeg: number, radiusM: number): Vec3;
```

`deriveBodyStates` gains **phase 1c** after the `FOCUS_ORDER` loop: for each
`surfaceFixed` driver, `position = hostPos + orientationForBody(hostId, simDays,
positions) · surfacePointBodyFixed(lat, lon, hostRadiusM + altitudeM)`, and
`meanAnomalyRad: 0` (no orbit for a trail to fade along, same as an anchor). The
host radius comes from `SCENE_BODIES` — the same home `bodyHomePose` and
`bodyTextureLoadRadius` read it from.

- [x] Test `surfacePointBodyFixed places the cardinal points` — hand-computed:
      `(0, 0, r)` → `[r, 0, 0]`; `(0, 90, r)` → `[0, r, 0]`; `(90, 137, r)` →
      `[0, 0, r]`. This is where an east/west sign error dies (landmine 5).
- [x] Test `bodyHostId answers per driver kind` — `'moon'` → `'earth'`,
      `'earth'` → `'sun'`, `'sun'` → `null`. Three real rows, one per arm; the
      `surfaceFixed` arm is covered by Task 11's traverse test, since no row
      exists yet.
- [x] The phase-1c loop over an empty `SURFACE_FIXED_SITES` is a no-op, so the
      full suite must stay green with no value changes.
- [x] **Cancel in Mpc, then scale** (landmine 4): `surfacePointBodyFixed` returns
      metres and is converted with `SCALE_UNITS.M_TO_MPC` before being added to
      the host's Mpc position, which is the only order that keeps the host's
      heliocentric magnitude out of the metre arithmetic.
- [x] **One symbol per file; pass files declare only the pass.**
- [x] `npm test` green, `npx tsc --noEmit` green. Commit.

---

## Task 6 — `RotationElements` union: `lookAt` and `surfaceLocked`

**Wave 1**, depends on Task 3. **Files:**
`src/@types/scene/RotationElements.d.ts` (modify),
`src/data/bodies/orientationForBody.ts` (modify),
`src/utils/orbit/rotationLookAt.ts` (new),
`src/utils/orbit/rotationSurfaceLocked.ts` (new),
plus tests for the two new utils.

Spec: "Rotation as a tagged union" — the union shape, the roll convention and the
ENU derivation are stated there in full; match them exactly. **The 21 existing
`ROTATION_ELEMENTS` rows are not edited** (ruling 15): the `iau-pole` arm's
`kind` is optional, and `orientationForBody` dispatches with
`switch (row.kind) { case undefined: case 'iau-pole': … }` plus a
`default: never` exhaustiveness arm.

**Signatures:**

```ts
// src/utils/orbit/rotationLookAt.ts
/** +X on the unit vector body→target; +Z placed as near the ecliptic north pole
 *  as that allows; +Y completes the right-handed triad. */
export function rotationLookAt(bodyPosMpc: Readonly<Vec3>, targetPosMpc: Readonly<Vec3>): Mat3;

// src/utils/orbit/rotationSurfaceLocked.ts
/** +Z on the local up (body − host); +X the heading, measured from local north
 *  toward local east. `hostPoleWorld` is the host orientation's third column. */
export function rotationSurfaceLocked(
  bodyPosMpc: Readonly<Vec3>,
  hostPosMpc: Readonly<Vec3>,
  hostPoleWorld: Readonly<Vec3>,
  headingDeg: number,
): Mat3;
```

- [x] Test `rotationLookAt aims +X at the target`: with the body at the origin
      and the target on world `+Y`, column 0 is `[0, 1, 0]`; and for an
      off-axis fixture, `det === +1` and all three columns are orthonormal to
      1e-12. Orthonormality is what catches a botched Gram-Schmidt.
- [x] Test `rotationLookAt survives a boresight along the ecliptic pole`: target
      directly above the body — the result is still orthonormal with `det +1`
      (the fallback up-reference), not `NaN`.
- [x] Test `rotationSurfaceLocked builds the local ENU triad`: host at the
      origin with pole `+Z`, body on `+X` at radius `r`. `headingDeg: 0` →
      column 2 (up) is `[1, 0, 0]` and column 0 (forward) is `[0, 0, 1]` (north);
      `headingDeg: 90` → column 0 is `[0, 1, 0]` (east). Hand-computed; `det +1`.
- [x] No test for the `iau-pole` arm: the existing `rotationElements` /
      `orientationForBody` suites already pin it and must stay green untouched.
- [x] **One symbol per file; pass files declare only the pass.**
- [x] `npm test` green, `npx tsc --noEmit` green. Commit.

---

## Task 7 — `probe` maker

**Wave 1**, independent. **Files:** `src/data/bodies/makers/probe.ts` (new),
`tests/data/bodies/makers/probe.test.ts` (new).

The counterpart of `makers/satellite.ts` for a JPL Horizons ELEMENTS column set:
it takes the columns in the units Horizons publishes and does the one conversion
that must not be hand-typed twice — the epoch shift from the fetch date back to
J2000 (ruling 13: `M(t) = n·(t − Tp)` exactly, for any conic).

**Signature:**

```ts
// src/data/bodies/makers/probe.ts
export function probe(spec: {
  id: string;
  focusId: string;
  /** Horizons `A`, au. NEGATIVE for a hyperbola. */
  semiMajorAu: number;
  /** Horizons `EC`. > 1 for a hyperbola. */
  eccentricity: number;
  inclinationDeg: number; // IN
  ascendingNodeDeg: number; // OM
  argPeriapsisDeg: number; // W
  /** Horizons `Tp`, the periapsis Julian Date. M at J2000 is derived from it. */
  periapsisJd: number;
  /** Horizons `N`, mean motion, degrees per day. */
  meanMotionDegPerDay: number;
  color: Vec3;
}): OrbitalElements;
```

Behaviour: `meanAnomalyRad = degToRad(meanMotionDegPerDay * (CONST_J2000 −
periapsisJd))`, `meanAnomalyRateRadPerCty = degToRad(meanMotionDegPerDay) *
36525`, `semiMajorMpc = semiMajorAu * SCALE_UNITS.AU_TO_MPC`, the three angles
through `degToRad`, no `plane` (ecliptic, which is what `REF_PLANE='ECLIPTIC'`
returns). No other rates.

- [x] Test `probe reproduces the published mean anomaly at the fetch epoch`:
      feed Voyager 1's columns (spec's data table), then
      `propagateElements(row, 2461294.5).meanAnomalyRad` equals
      `degToRad(2916.322928412766)` to 1e-9 rad. The expectation is JPL's own
      published `MA`, computed from a column the maker does not read — an
      external cross-check, not a mirror.
- [x] **Do not normalise the mean anomaly** (landmine 7); assert the raw,
      unwrapped value.
- [x] **One symbol per file; pass files declare only the pass.**
- [x] `npm test -- probe` green. Commit.

---

## Task 8 — the bake reports `groundOffsetM`

**Wave 1**, independent. **Files:** `tools/meshes/buildMeshes.ts` (modify),
`src/data/bodies/meshAssets.generated.ts` (regenerate — field only, no new rows),
`tests/tools/meshes/buildMeshes.test.ts` (modify).

Landmine 6: `mergeGeometry` recentres on the area-weighted surface centroid, so a
surface-locked body's origin sits inside it. The bake is the only place that
knows how far down its lowest vertex is.

**Contract:** `MeshAssetRow` gains

```ts
/** How far the lowest vertex sits BELOW the origin along the body frame's −Z,
 *  metres, ≥ 0. A surface-locked body is lifted by this so it rests on the
 *  host's sphere; meaningless (but harmless) for a free-flying one. */
readonly groundOffsetM: number;
```

computed in `mergeGeometry` as `-min(centred z)`, clamped at 0, and printed
beside `r=` in the tool's per-asset report line.

- [x] Test `groundOffsetM measures the lowest vertex`: over the existing
      synthetic-GLB fixture, a unit cube centred on its own centroid spanning
      `z ∈ [−1, 1]` reports `1`.
- [x] Re-run `npm run build-meshes` so `whale`/`petunias` pick up the field;
      commit the regenerated file. No other value in it may change — check the
      diff.
- [x] **One symbol per file; pass files declare only the pass.**
- [x] `npm test -- buildMeshes` green, `npx tsc --noEmit` green. Commit.

---

## Task 9 — `meshBodySlabHostId`, the hostless slab row, self-host lighting

**Wave 2**, depends on Task 5. **Files:**
`src/utils/scene/meshBodySlabHostId.ts` (new),
`src/data/bodies/hostlessMeshBodies.ts` (new),
`src/utils/scene/meshBodiesAttachedTo.ts` (modify),
`src/services/engine/frame/frameContext.ts` (modify),
`src/services/engine/frame/frameProgram.ts` (modify),
`src/services/engine/frame/passes/meshBodiesPass.ts` (modify),
plus a test for `meshBodySlabHostId`.

Spec: "A hostless mesh body hosts itself" and "Lighting a body with no host".

**Contracts:**

```ts
// src/utils/scene/meshBodySlabHostId.ts
/** The body-slab row a mesh body draws in: its position driver's host when that
 *  host owns a row, else the body itself. */
export function meshBodySlabHostId(body: MeshBody): string;

// src/data/bodies/hostlessMeshBodies.ts
/** Mesh bodies that own a `body-m` row — `BODY_SLAB_CAPACITY` counts them. */
export const HOSTLESS_MESH_BODIES: readonly MeshBody[];
```

Edits, all one-liners against existing composition points:

- `meshBodiesAttachedTo`'s `BY_HOST_ID` reduce groups on `meshBodySlabHostId(body)`
  instead of `elementsById(body.id).focusId` (landmine 2 — that call **throws**
  for a body with no orbital row).
- `frameContext.ts:118-120`'s `meshHostIds` map reads the same function, same
  reason.
- `frameContext.ts:97-100`'s `slabBodyCandidates` appends
  `state.data.bodies.meshBodies.filter(b => meshBodySlabHostId(b) === b.id)` —
  read off the store, not the static table, so the roster stays store-driven.
- `frameProgram.ts:89`: `BODY_SLAB_CAPACITY = 1 + SCENE_PLANETS.length +
SCENE_ANCHOR_POINT_BODIES.length + HOSTLESS_MESH_BODIES.length` (25 → 27 once
  Task 11 lands its rows; 25 until then). Derived, never a literal (ruling 25).
  Update its docblock to name the fourth contributor.
- `meshBodiesPass.draw`: one local `const hosted = body.id !== hostId;`, feeding
  `sunVisibleFraction: hosted ? sunVisibleFraction({…}) : 1` and
  `hostShineStrength: hosted ? … : 0` (landmine 3). Two ternaries inside `draw` —
  **no new top-level declaration in that file**, or `passFilePurity.test.ts`
  fails.

- [x] Test `meshBodySlabHostId routes to the host's row, or the body's own`: a
      mesh body whose driver host is `'earth'` returns `'earth'`; one whose
      driver host is `'sun'` (no slab row) returns its own id. Use the real
      `SCENE_MESH_BODIES` whale for the first and a synthetic fixture for the
      second until Task 11 lands a Voyager.
- [x] No test for the pass edit: no renderer or shader unit tests (spec). The
      `NaN` it prevents is caught in the visual pass, Task 15.
- [x] **One symbol per file; pass files declare only the pass.**
- [x] `npm test` green, `npx tsc --noEmit` green. Commit.

---

## Task 10 — Assets: prebakes, `MESH_SOURCES`, `RAW_DATA`, `build-meshes`

**Wave 2**, depends on Task 8. **Files:**
`data/raw/meshes/{voyager,curiosity,perseverance,mer}/` (source + `LICENSE` +
`README.md`, gitignored binaries), `data/raw/meshes/meshes.sha256` (modify),
`tools/utils/io/rawDataRegistry.ts` (modify),
`tools/utils/io/meshSources.ts` (modify),
`tools/meshes/prebake/*.py` (new, per source that needs one),
`src/data/bodies/meshAssets.generated.ts` (regenerate),
`public/data/meshes/*` (generated).

**Input:** the asset agent's report at
`.superpowers/sdd/2026-09-11-voyager-rovers/asset-report.md` — the downloads, the
Blender exports, the prebakes it ran, and the sizes it measured. Read it first;
do not re-fetch what it already placed.

Four `MESH_SOURCES` rows (`voyager`, `curiosity`, `perseverance`, `mer`), each
naming its `native` `RawDataKey`, its `licence` (`Public domain (NASA)`), its
`attribution` (author + the NASA 3D Resources page), and a `bodyFromSource`
`Mat3` — a **proper** rotation, `det +1` — putting the download into the spec's
body frame (ruling 17):

- `voyager`: **+X** = high-gain-antenna boresight, **+Z** = bus reference up.
- the three rover keys: **+Z** = up (mast), **+X** = forward (drive direction).

`RAW_DATA` rows follow the `meshes.whale` / `meshes.petunias` pattern exactly:
one row per source file with `upstream` + `readme`, one `*.readme` row per
directory, a separate `*Source` row where a prebake stands between the download
and what `MESH_SOURCES` names. Per-source README records author, URL, licence,
fetch date, checksum, and — for `voyager` — the **verbatim Horizons refresh
query** from the spec.

- [x] Run each prebake, then `npm run build-meshes`.
- [x] **Budget gate (user ruling):** for each of the four keys, report
      `.mesh` + `_albedo.png` + `_mr.png` + `_normal.png` total bytes, and it
      must be **under 10 MB**. If `mer` or `curiosity` is over, decimate further
      in the prebake — never by raising `TRIANGLE_BUDGET`/`TEXTURE_SIZE_BUDGET`,
      which are renderer-affordance constants, not per-asset dials.
- [x] Commit the regenerated `meshAssets.generated.ts` (four new rows; the
      whale's and the petunias' values must not change — check the diff) and the
      `public/data/meshes/` outputs.
- [x] Report each asset's `triangleCount`, `boundingRadiusM`, `groundOffsetM`,
      `normalMapSubstituted` and total size.
- [x] No new tool test: the bake path is already covered by Task 8's fixture test
      and the existing `buildMeshes` suite.
- [x] **One symbol per file; pass files declare only the pass.**
- [x] Commit.

---

## Task 11 — the real seed rows

**Wave 3**, depends on 4, 5, 6, 7, 9, 10. **Files:**
`src/data/bodies/sceneMeshBodies.ts`, `src/data/bodies/orbitalElements.ts`,
`src/data/bodies/surfaceFixedSites.ts`, `src/data/bodies/rotationElements.ts`,
`src/data/bodies/palette.ts`, `src/data/bodies/bodySearchNames.ts` (all modify),
plus the tests below.

Every number in this task comes from the spec's "Data" section. Transcribe, do
not recompute.

**Six `SCENE_MESH_BODIES` seeds** — `voyager1`, `voyager2` (both
`meshKey: 'voyager'`), `curiosity`, `perseverance`, `spirit`, `opportunity`
(the last two both `meshKey: 'mer'`, ruling 20). Labels: `Voyager 1`,
`Voyager 2`, `Curiosity`, `Perseverance`, `Spirit`, `Opportunity`. **No
`captionRevealM`** on any of them (ruling 5/26).

**Two `ORBITAL_ELEMENTS` rows** via Task 7's `probe` maker, `focusId: 'sun'`,
with the spec's `EC`/`A`/`IN`/`OM`/`W`/`Tp`/`N` columns transcribed verbatim and
a comment naming the Horizons epoch they were fetched at. Two new `palette.ts`
tints for their `color`.

**Four `SURFACE_FIXED_SITES` rows** — the spec's lat/lon table, `hostId: 'mars'`,
`altitudeM: MESH_ASSETS[<key>].groundOffsetM` (landmine 6, ruling 29).
**Longitude is EAST-positive** (landmine 5).

**Six `ROTATION_ELEMENTS` rows** — `{ kind: 'lookAt', id: 'voyager1', targetId:
'earth' }` and the same for `voyager2`; `{ kind: 'surfaceLocked', id, headingDeg }`
for the four rovers, headings authored and confirmed in Task 15.

**Search aliases** in `bodySearchNames.ts`'s `AUTHORED`: `voyager1` →
`['Voyager 1', 'Voyager']`, `voyager2` → `['Voyager 2', 'Voyager']`, `curiosity`
→ `['Curiosity', 'MSL', 'Mars Science Laboratory']`, `perseverance` →
`['Perseverance', 'Percy', 'Mars 2020']`, `spirit` → `['Spirit', 'MER-A']`,
`opportunity` → `['Opportunity', 'Oppy', 'MER-B']`.

- [x] Test `the Voyager rows reproduce JPL's ephemeris`: through the real
      `deriveBodyStates` at `simDays = 2461294.5`, `|voyager1Pos − sunPos|`
      equals **171.722 au** and `voyager2`'s **143.912 au**, each to 1e-4 au.
      External data, independently computed — the spec's derived-values table.
- [x] Test `a rover turns with Mars`: the angle between `curiosity`'s offset from
      Mars at `t` and at `t + 360/350.89198226` days is under 0.05°, and at a
      quarter of that is within 0.05° of 90°. This is the test that fails on a
      west-positive longitude, a dropped host spin, or the wrong body frame.
- [x] Test `a rover stands on the surface`: `|curiosityPos − marsPos|` equals
      `SCENE_MARS.radiusM + altitudeM` to 1e-6 m.
- [x] Test `every surface-fixed site is lifted by its asset's ground offset`:
      each row's `altitudeM` equals `MESH_ASSETS[body.meshKey].groundOffsetM`.
      An invariant across two independently-edited files.
- [x] The existing `every SCENE_BODIES id resolves a BodyState` test now covers
      all six; it must stay green with no edit.
- [x] Confirm `BODY_SLAB_CAPACITY` is now **27** (2 hostless mesh bodies) — read
      it, do not re-type it.
- [x] **One symbol per file; pass files declare only the pass.**
- [x] `npm test` green (full suite), `npx tsc --noEmit` green. Commit.

---

## Task 12 — fact-sheet rows

**Wave 3**, parallel with Task 11. **Files:**
`data/seeds/planet_facts.seed.json` (modify),
`src/data/bodies/bodyFacts.generated.ts` (regenerate).

Six rows (ruling 7): `wikiTitle` = `Voyager_1`, `Voyager_2`,
`Curiosity_(rover)`, `Perseverance_(rover)`, `Spirit_(rover)`,
`Opportunity_(rover)`, each with a **two-sentence factual** `description` — no
marketing voice, no Douglas Adams register. Each rover's description names the
landing site and says plainly that the model marks where it touched down
(ruling 23). Use the optional display-string fields where they are honest
(`distance`, `dayLength` for the rovers = a sol; `yearLength` for a probe =
"escape trajectory, no orbital period") and omit the rest — the card drops an
absent row.

- [x] Regenerate with `npm run build-planet-facts` and commit the generated file;
      no other row may change.
- [x] No test: `parsePlanetFactsSeed` already fails loudly on a duplicate id or a
      non-string field, and a description is prose.
- [x] **One symbol per file; pass files declare only the pass.**
- [x] `npm test -- planetFacts` green. Commit.

---

## Task 13 — attributions, registry docblock, deploy check

**Wave 4**, depends on Task 10. **Files:** `ATTRIBUTIONS.md`,
`src/data/sources/mesh-body.ts` (docblock only), `docs/DEPLOY.md` (only if the
check below finds a gap).

- [x] Four `ATTRIBUTIONS.md` entries in the existing mesh-asset section's shape
      (`### "<title>" — <author>`, **Use** / **Source** / **Licence** /
      **Credit**), naming NASA 3D Resources, the author, the public-domain status
      under NASA's media-usage guidelines, and what the prebake does to each.
- [x] `MESH_BODY_ENTRY`'s docblock currently says the row is "the whale and the
      basket of petunias". Rewrite it to describe the **category** and state that
      the one checkbox mutes every mesh body together (ruling 21). Do not change
      any field.
- [x] Confirm `docs/DEPLOY.md`'s R2 step covers `public/data/meshes/` as a
      directory (not a file list). Edit only if it does not.
- [x] Confirm the Splash credits paragraph needs no edit: NASA public-domain
      assets carry no attribution obligation, unlike the two CC BY models already
      credited there. State the finding either way.
- [x] **One symbol per file; pass files declare only the pass.**
- [x] Commit.

---

## Task 14 — perf, before and after

**Wave 4**, depends on Task 11. Read `.claude/skills/perf/SKILL.md` first.

- [x] `npm run perf` on the merge-base, then on this branch's HEAD. **In this
      worktree pass `--url http://localhost:<port>`** from _this_ worktree's
      `npm run dev` `Local:` line, or the run silently measures another branch's
      server.
- [x] Report MERGED, PER-LAYER and FLOOR, at a pose that has a Voyager on screen
      and one that has a rover on Mars, plus the existing Earth-orbit pose so the
      slab-capacity widening is visible if it costs anything.
- [x] **A neutral-or-negative measurement HALTS the pipeline.** Report and stop;
      land or park is the user's ruling, not process momentum.
- [x] Commit nothing unless a finding requires a fix.

---

## Task 15 — visual pass

**Wave 4**, depends on 11 and 12. Nothing is attested until the user has looked.

Ask the user to check, per body:

- [x] **Voyager 1** — search "Voyager 1", fly to it. The spacecraft resolves from
      a glint into a mesh on approach; it is **lit, not black** (the constant-
      irradiance ruling); the **high-gain dish points at Earth** — check by
      framing the probe and reading where the dish faces against the Sun's
      direction; the probe does not flicker, jitter or disappear as the camera
      orbits it (the f64/self-hosted-slab path); the caption reads "Voyager 1".
- [x] **Voyager 2** — same, and its attitude differs from Voyager 1's (they are
      in different directions from Earth, so a shared wrong constant shows here).
- [x] **Curiosity** — fly to Mars, then to Curiosity. The rover **stands upright**
      on the surface, wheels touching, not buried and not floating; run the clock
      forward a few hours and it **rides the surface around** rather than
      hovering or sliding; at Martian sunrise the lighting **sweeps across it**
      and it goes dark at night.
- [x] **Perseverance** — upright, correct hemisphere (northern, Jezero) — a
      sign-flipped latitude puts it opposite Curiosity's side.
- [x] **Spirit and Opportunity** — both present, both upright, both the same
      model, on opposite sides of the planet (Gusev 175°E, Meridiani 354°E).
- [x] **Glint handoff** — backing away from each, the mesh hands off to a glint
      with no pop and no double-draw.
- [x] **InfoCard** — each of the six shows its fact sheet and description, and
      the Wikipedia link resolves.
- [x] **Labels & Guides** — the single "Mesh body" checkbox mutes all eight
      captions together (ruling 21).
- [x] Record the user's verdict on each rover's authored `headingDeg` and each
      asset's `bodyFromSource`; a correction is a data edit in Task 11's files,
      not a code change (ruling 30).

**Attested 2026-09-12** (user, on :5176, after the #692 rename merge): visual gate
pass on 7dd897503; wheel re-check after Task 16. Voyager framing accepted as
authored (no `focusDistanceRadii` override). Headings and `bodyFromSource`
accepted as authored — no data corrections. Findings ruled OUT of this PR and
backlogged: rover camera regime (+ atmosphere over the rover), mesh-body
shadows, rover terrain regions. Two unplanned extras landed on the branch from
the pass: Task 16 (camera-relative analytic-sphere depth — rover wheels sat in
or above the ground by an angle-dependent metre) and Task 17 (cancellation-free
ray/sphere roots in the TS and WESL twins).

---

## File structure

**Created**

```
src/@types/scene/PositionDriver.d.ts
src/@types/scene/SurfaceFixedSite.d.ts
src/data/bodies/positionDrivers.ts
src/data/bodies/surfaceFixedSites.ts
src/data/bodies/hostlessMeshBodies.ts
src/data/bodies/makers/probe.ts
src/utils/orbit/perifocalAxesWorld.ts
src/utils/orbit/hyperbolicAnomalyFromMean.ts
src/utils/orbit/hyperbolicPositionMpc.ts
src/utils/orbit/rotationLookAt.ts
src/utils/orbit/rotationSurfaceLocked.ts
src/utils/scene/surfacePointBodyFixed.ts
src/utils/scene/meshBodySlabHostId.ts
tools/meshes/prebake/*.py                      (per source that needs one)
data/raw/meshes/{voyager,curiosity,perseverance,mer}/{<model>,LICENSE,README.md}
public/data/meshes/{voyager,curiosity,perseverance,mer}.{mesh,_albedo.png,_mr.png,_normal.png}
tests/  — mirrors for every new src file above that carries a listed test
```

**Modified**

```
src/@types/scene/RotationElements.d.ts         tagged union, iau-pole arm untouched
src/data/bodies/orientationForBody.ts          + positions param, + kind dispatch
src/data/bodies/rotationElements.ts            + 6 rows
src/data/bodies/orbitalElements.ts             + 2 probe rows
src/data/bodies/sceneMeshBodies.ts             + 6 seeds
src/data/bodies/sceneOrbitConics.ts            default → TRAIL_ELEMENTS
src/data/bodies/palette.ts                     + 2 tints
src/data/bodies/bodySearchNames.ts             + 6 alias rows
src/data/bodies/meshAssets.generated.ts        + groundOffsetM, + 4 rows (generated)
src/data/bodies/bodyFacts.generated.ts         + 6 rows (generated)
src/data/sources/mesh-body.ts                  docblock only
src/services/engine/frame/deriveBodyStates.ts  phase split + surfaceFixed phase
src/services/engine/frame/frameContext.ts      slab candidates + mesh host ids
src/services/engine/frame/frameProgram.ts      BODY_SLAB_CAPACITY 25 → 27
src/services/engine/frame/passes/meshBodiesPass.ts   self-host lighting guard
src/utils/orbit/keplerianEllipse.ts            uses perifocalAxesWorld
src/utils/orbit/keplerianPositionMpc.ts        e > 1 dispatch
src/utils/scene/meshBodiesAttachedTo.ts        groups on meshBodySlabHostId
tools/meshes/buildMeshes.ts                    groundOffsetM
tools/utils/io/meshSources.ts                  + 4 rows
tools/utils/io/rawDataRegistry.ts              + mesh rows
data/seeds/planet_facts.seed.json              + 6 rows
data/raw/meshes/meshes.sha256                  + 4 checksums
ATTRIBUTIONS.md                                + 4 entries
```

**Deleted** (in the design commit, not a task): `docs/backlog/2026-09-10-hyperbolic-kepler-branch.md`,
`docs/backlog/2026-09-10-surface-fixed-position-driver.md`,
`docs/backlog/2026-09-10-rotation-table-tagged-union.md`, and their three index
lines in `docs/BACKLOG.md`.

**Unchanged, deliberately** — the `.mesh` format and its version, `meshFetcher`,
`meshSlotRegistry`, `meshBodyLoadRadius`, `meshBodyRenderer`, the mesh WESL
shaders, `composeMeshMvp`, `bodyStateInHostFrame`, `hostSkyFraction`,
`sunVisibleFraction`, `sceneBodyPartition`, `sceneOccluderBodies`,
`partitionBodiesByPresentation`, `captionFadeRules`, `sceneBodyLabels`,
`extractSelectionRow`, `bodyLikeFraming`, `pivotFraming`, `assetWiring`,
`resolvePickTable`, `Source`/`MESH_BODY_ENTRY` fields, `trailElements`.
A diff that touches any of them has taken a wrong turn.

## Definition of Done

**Deliverable inventory**

- Six `SCENE_MESH_BODIES` rows: `voyager1`, `voyager2`, `curiosity`,
  `perseverance`, `spirit`, `opportunity`.
- Four baked assets in `public/data/meshes/` — `voyager`, `curiosity`,
  `perseverance`, `mer` — **each under 10 MB** including its three PNGs, with the
  measured sizes reported.
- `hyperbolicAnomalyFromMean`, `hyperbolicPositionMpc`, `perifocalAxesWorld`,
  `rotationLookAt`, `rotationSurfaceLocked`, `surfacePointBodyFixed`,
  `meshBodySlabHostId`, `positionDriverById` / `bodyHostId`, `probe` — all
  exported, one per file, each with the test its task lists.
- `BODY_SLAB_CAPACITY` = 27, derived from `HOSTLESS_MESH_BODIES.length`.
- Six fact-sheet rows with `wikiTitle` and a two-sentence factual description.
- Provenance complete: four `data/raw/meshes/<key>/README.md`, the `meshes.*`
  `RAW_DATA` rows, four sha256 entries, four `ATTRIBUTIONS.md` entries, and the
  verbatim Horizons refresh query in the `voyager` README.
- The three consumed backlog items gone — index lines **and** detail files.

**Named observable behaviours** (Task 15's checklist is the script)

- Voyager 1 and 2 each resolve glint → mesh on approach, are lit rather than
  black, hold a dish aimed at Earth, and are stable under camera orbit.
- Curiosity, Perseverance, Spirit and Opportunity each stand upright at their
  site, ride Mars's rotation, and cross the terminator with a sunrise rather
  than a step.
- Perseverance is in the northern hemisphere; Spirit and Opportunity are on
  opposite sides of the planet.
- Each of the six is findable in ⌘K by name and by at least one alias, selects,
  frames, and shows its InfoCard description.
- One "Mesh body" checkbox mutes all eight mesh-body captions.

**Deferral boundary** — the spec's "Out of scope", in full: no hyperbolic trail,
no live rover positions or traverses, no terrain, no inverse-square sunlight, no
surface-aware camera standoff, no instrument articulation, no renderer re-keying
by mesh key, no other spacecraft.

**Gates that are not listed here on purpose** — `npm test`, `npm run typecheck`
and the TODO scan are `/feature-done`'s standing audit, not DoD lines.
