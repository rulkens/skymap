# Terrain F3c — the terrain raycast and the gesture anchors

Spec: [`2026-09-13-per-planet-terrain-design.md`](../specs/2026-09-13-per-planet-terrain-design.md)
§8.1 (the marcher and its four rulings), §8.3 (the pick row), §12 (the F3c row and its
ground-preparation record).

F3a made the camera floor follow the terrain and deliberately left the _rate_ of descent
on the datum. That half-pair is what this fixes. Today every camera gesture anchors on a
ray/datum-sphere intersection, so over Everest each wheel notch aims at a point ~8.8 km
below the ground in view and the eye slams into the floor instead of easing onto it;
over the Dead Sea it inverts and the last 400 m are crept through. The fix is the
`raycast` row spec §8.1 has always described: march the ray against the height field.

## Packaging and sequence

Two PRs, prep first (user ruling, 2026-09-17):

- **PR 1 — prep.** `HostBody` gains the two bound radii. No behaviour.
- **PR 2 — the feature.** `raycastTerrain` plus the two call sites that route through it.

PR 2 bases off PR 1's branch until it merges. Both off `main`, draft from the first push.

The backlog item this came from — `docs/backlog/2026-09-17-terrain-aware-zoom-anchor.md`
plus its `BACKLOG.md` index line — is deleted in PR 1, per the backlog-hygiene rule: the
spec and this plan are now the source of truth.

## Parallelism and perf

Tasks are sequential; each builds on the last, and the whole diff is small enough that a
second worktree would cost more than it saves.

**The perf gate applies.** `raycastTerrain` runs per tick for the duration of a drag or a
wheel gesture, and each sample re-enters `terrainHeightAt`, which re-does a lon/lat
conversion, a 20-band scan, and a `SurfaceTileId` + `surfaceTilePath` allocation per
level of the ancestor climb (`surfaceTileSubsystem.ts:462-484`). Run `npm run perf`
before F1 and after F2, `--url` on this worktree's port. A neutral or negative result
halts the landing; the user rules on land-vs-park.

If the gate is negative, the fix goes **inside** `surfaceTileSubsystem`, never into the
camera path — a bound sampler handed to the camera was sketched at the ground-prep
checkpoint and rejected for exactly that reason.

## The standing constraint

**The camera path stays free of local state** (user, adamant, 2026-09-17). The marcher is
a pure function of its arguments: no memo, no cache of the last pick, and no warm start
from the previous frame's `t`. `surfaceZoomStep.ts:38` already states this rule for the
staleness test — the zoom owns no state of its own (FW-B) — and this follows it.

The one piece of state in the path is the existing `SurfaceGesture` latch, already ruled
to die at pointerup (Q3). This plan adds **no field to it**: keeping the drag's frozen
sphere (C §2.3) means `anchorRadiusM = |anchorLocalM|` still holds, with the point now on
rock rather than the datum.

---

## PR 1 — prep

### P1: `HostBody` carries the relief shells

The march needs to know where terrain _cannot_ be, to bound its search. Those bounds are
declared static data — `BodySurface.reliefM`, Earth `[-430, 8849]` — and
`outerBoundRadiusM`/`innerBoundRadiusM` already compute them. `bodyRung.host()` holds
`body.surface` in hand, so this is one row each, not plumbing.

**Contract:**

```ts
// src/@types/camera/HostBody.d.ts — beside the existing `radiusM` and `groundRadiusAtM`
/** Terrain cannot lie outside these, whatever has streamed in — `reliefM` is declared
 *  per-body data. The pick marches between them; nothing else may read them as a datum. */
readonly innerBoundRadiusM: number;
readonly outerBoundRadiusM: number;
```

`SurfaceStepCtx` is **not** touched here. It would gain two fields nothing reads until
F2, which is what a deletion audit is for; the ctx field lands in PR 2 beside its first
consumer. Prep stops at the host, whose job is resolving this body's radii for the frame
— it resolves one of the three today.

**Files:** `src/@types/camera/HostBody.d.ts`,
`src/services/engine/camera/rungs/bodyRung.ts` (`host()`), plus every test that
constructs a `HostBody` — the compiler names them.

**Test:** one, on `bodyRung.host()`: the two radii equal
`outerBoundRadiusM(body.surface)` / `innerBoundRadiusM(body.surface)` and bracket
`radiusM`. It can fail — a swapped pair compiles and type-checks clean, and would make
the march search between the wrong shells.

Also in this PR: delete the backlog index line and detail file named above.

---

## PR 2 — the feature

### F1: `raycastTerrain` — the marcher

`review: yes` — this is the whole feature's correctness, and its failure modes (a missed
bracket, a wrong first crossing, marching from below) are silent wrong answers rather
than crashes.

**Contract:**

```ts
// src/utils/camera/raycastTerrain.ts — one symbol, pure
/**
 * The first point where `ray` meets the displaced terrain, body-fixed metres, or `null`
 * if it misses the relief shell entirely. `null` means MISS, never "gave up": an
 * exhausted budget answers with its best bracket.
 */
export function raycastTerrain(
  ray: BodyLocalRay,
  innerRadiusM: number,
  outerRadiusM: number,
  groundRadiusAtM: GroundRadiusLookup,
  toleranceM: number,
): SurfacePick | null;
```

Returns the existing `SurfacePick` (`pointM` + `incidence`), so the call sites keep their
shape and `pickOnBody` stays as the datum fallback on a miss.

The algorithm, per spec §8.1:

- Bracket with `raySphereRoots` against both shells. No outer hit, or both roots behind
  the eye → `null`. `t0 = max(0, first outer root)`. `t1 =` the first inner root if one
  exists — terrain cannot be below the inner shell — else the _second_ outer root.
- Signed field `f(t) = |p(t)| − groundRadiusAtM(p(t))`. Note `groundRadiusAtM` ignores its
  argument's magnitude by contract (`GroundRadiusLookup.d.ts:3-5`), so no normalize is
  needed per sample.
- **Eye below terrain** (`f(t0) < 0`) is reachable, not defensive: the floor stands on the
  17×17 grid while the shader draws 129², so the eye can be inside the drawn surface.
  Marching from there finds the exit face on the far side of the mountain. Answer the
  eye's own nadir ground point instead.
- Step `clamp(f(t) / closingRate, minStepM, remaining)` where
  `closingRate = max(ε, −(e·d + t) / |p(t)|)`. A fixed step is not viable: a grazing
  chord between the shells is ~670 km on Earth.
- Cap the step at `(t1 − t0) / SAMPLE_BUDGET` so lateral advance is bounded without
  reading the grid spacing. This is the v1 compromise for grazing rays; the
  spacing-aware cap (one grid cell per sample) is the follow-up if the eye-check shows
  misses at the limb, and it would need a second lookup on `HostBody`.
- First `+ → −` crossing, then bisection to `toleranceM`, iteration cap ~24. Budget
  exhausted → best bracket so far, never `null`.

`SAMPLE_BUDGET`, the bisection cap and `minStepM` are named constants in
`src/data/camera/` — named even though single-use, per the standing rule.

**Test** (`tests/utils/camera/raycastTerrain.test.ts`), each able to fail on a real bug:

- **Flat field** (`groundRadiusAtM` ≡ datum): the hit matches `raySphereRoots`' analytic
  answer within tolerance, for a near-nadir ray and a 60°-incidence ray. Catches sign and
  bracket errors. Build the expectation from the analytic root, not from a recorded value.
- **A ridge between the eye and the far side**: a field with one raised band; a ray
  crossing it must hit the near face, not the ground beyond. Catches "first crossing"
  becoming "any crossing". Seed the ridge so it is wider than the step cap — a fixture
  that also happens to test the cap tests neither thing.
- **Eye below terrain**: `f(t0) < 0` answers the nadir ground point, not an exit-face hit
  kilometres away.
- **Miss**: a ray above the outer shell returns `null`; a ray aimed away from the body
  returns `null` rather than a behind-the-eye root.
- **Tolerance is honoured**: `|f(hit)| <= toleranceM` for a field with a steep slope.

Mutation-verify each: break the sign of `f`, drop the bisection, remove the
below-terrain branch, and confirm the matching test fails.

### F2: route the zoom pick and the drag latch

**Files:** `src/utils/camera/surfaceZoomStep.ts` (the `pickOnBody` call at :59),
`src/utils/camera/latchSurfaceGesture.ts` (:20, and the nadir fallback at :25-31),
`src/services/camera/surfaceStep.ts` (`SurfaceStepCtx` gains the two bound radii here,
beside their first consumer), `src/services/engine/camera/rungs/bodyRung.ts` (`step()`
passes them from the host).

Both sites call `raycastTerrain` and fall back to `pickOnBody` against the datum on
`null` — "always answer something" is camera-feel policy and stays at the call site, not
in the marcher.

`toleranceM` comes from metres-per-pixel at the ray's range, which `surfaceStep` can
compute from `viewportPx`, `fovYRad` and the eye altitude it already holds. Bisecting
tighter than a pixel is work that cannot be seen; bisecting tighter than the local grid
spacing is false precision (3 m at Copenhagen, 270 m at Everest, 16.7 km over the Dead
Sea — the CPU reads the 17×17 header grid, §8.4, never the drawn 129²).

Unchanged, and each for a stated reason: `draggedSurfacePose` and `anchoredDragRotation`
inherit through `gesture.anchorRadiusM`; `poseFrameConversion`'s arm range and the h/R
band arithmetic stay on the datum per §8.3.

**Test:** the latch over a peak stores `anchorRadiusM > datumRadiusM` and
`anchorRadiusM === |anchorLocalM|`; the zoom anchor over the same peak sits above the
datum. Both fail today and would fail again if a future change reverted either site to
`pickOnBody`.

---

## Definition of Done

- [x] `npm test` green; `npm run typecheck` clean. — 8772 tests / 1307 files, typecheck
      clean on both projects, at `ffcde125b`.
- [x] `npm run perf` run before F1 and after F2, same URL, result recorded here.
      **The GPU harness holds a fixed pose and never drags or wheels, so it cannot reach
      the gesture path at all** — its numbers do not close this gate on their own, and a
      first run against a freshly-started Vite server reads ~2x slow. A-B-A-B across two
      servers (scratch worktree at the pre-F2 commit, `node_modules` + `public/data`
      symlinked): before 34.0 / 33.9 / 37.2 (mean 35.0), after 33.8 / 37.8 / 38.5 (mean
      36.7). Within-arm spread ~3.3 ms exceeds the 1.7 ms gap, so the result is noise.
      The measurement that does bite is a lookup count: **2 field lookups near-nadir, 2
      at 60°, 47 grazing**, hard ceiling `SAMPLE_BUDGET`(64) + bisection cap(24) = **≤88
      per pick, once per gesture tick**.
- [x] Every new test mutation-verified. — the two `raycastTerrain` cases repaired in
      `f7c043a30` were (sign flip; bisection→false position). The F1/F2-era cases are
      **not independently attested**: ticked on the user's ruling, 2026-09-18.
- [x] No new `TODO`/`FIXME` without an owner and a date. — zero markers on the branch.
- [x] The backlog item's index line **and** detail file are gone (PR 1).
- [x] Spec §8.1/§8.3/§12 match what shipped.
- [x] `deletion-audit` run once, at `/feature-done` on PR 2. — ~265 LOC found; the
      safe-now bin landed as `ffcde125b` (net −7). The needs-ruling bin was put to the
      user and **declined in full, 2026-09-18**: the Mars presets keep their copied
      coordinates, `raycastStepCapHeadroom` stays a second knob, and the five
      `raycast*.ts` constant files stay five files.
- [x] Eye-check by the user, on these poses: a wheel descent onto Everest (the steps
      should shorten as the summit nears, not slam); a descent to the Dead Sea (no crawl
      through the last 400 m); a drag starting on a summit and crossing a valley (the
      ground must not slide under the cursor); a drag latched near the limb.
      Attested 2026-09-18, plus the pick marker on both Earth and Mars. One bug surfaced
      and was deferred by the user: orbit trails draw through terrain at the Dead Sea —
      `docs/backlog/2026-09-18-orbit-trails-draw-through-terrain.md`.
- [x] No local state added to the camera path. — verified file by file: no module-level
      mutable binding in `raycastTerrain`, `terrainPickAt`, `latchSurfaceGesture`,
      `surfacePickToleranceM`, `surfaceStep` or `terrainPickMarkerPass`.
