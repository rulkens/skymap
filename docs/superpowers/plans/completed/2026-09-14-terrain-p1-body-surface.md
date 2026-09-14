# P1 — the `BodySurface` split

**Spec:** [`docs/superpowers/specs/2026-09-13-per-planet-terrain-design.md`](../../specs/2026-09-13-per-planet-terrain-design.md)
— §3.1 (ideal shape), §3.3 joints 8 + 9, §3.4a (why the name dies), §3.5 P1, §3.7
(the promoted adjacent finding), §8.3 (the per-purpose routing table, which is this
plan's map).

**Status:** ready to execute. Own PR, lands before P6 / F1–F4.

## Goal

`CelestialBody.radiusM` becomes `surface: BodySurface` — a datum plus a relief
interval — and every read site picks the bound its purpose needs. The name
`radiusM` ceases to exist on the body arms, so the compiler, not a reviewer, is
what enumerates the sites.

**The rendered picture must be pixel-identical to `main`.** `reliefM` is `[0, 0]`
for every body in P1, so datum = inner bound = outer bound and all three collapse
onto today's number. The one intended behaviour change is the promoted adjacent
finding (§3.7): `surfaceFloorM` starts honouring per-body `standoffRadii`, which
roughly doubles the camera's descent floor at Sgr A\* (~12.7 Gm → ~25.4 Gm) and
brings it into agreement with `pivotFraming`'s zoom floor, which has honoured the
override all along. `sceneSgrAStar.ts:43-44` already documents 2 r_s as the intended
descent floor; today only half the engine believes it.

## Architecture

Three currencies, one stored record:

```ts
// src/@types/scene/BodySurface.d.ts                                        NEW
export type BodySurface = {
  readonly datumRadiusM: number; // the sphere tiles and heights are defined against
  readonly reliefM: readonly [number, number]; // [min, max] vs datum
};
```

- **Stored:** `datumRadiusM`, `reliefM`.
- **Derived, never stored** (§3.1), one function per file:
  `outerBoundRadiusM(surface)` = `datumRadiusM + reliefM[1]`;
  `innerBoundRadiusM(surface)` = `datumRadiusM + reliefM[0]`.
  There is deliberately **no** `datumRadiusM` accessor — it is a field, and a
  passthrough reader would be a proxy surface.
- `MeshBody` is untouched; it keeps `boundingRadiusM`, and
  `bodyFootprintRadiusM` keeps its `isMeshBody` branch.

Over-estimating is safe for extents (outer); under-estimating is safe for occluders
and for an atmosphere's ground (inner); band arithmetic and the drawn analytic
sphere are datum. §8.3 is the authority on which is which; §"Census" below resolves
it site by site.

## Tech stack

TypeScript, no new runtime dependency. Mechanical moves/renames go through
`npm run refactor` / `npm run move-files` (never `git mv`, never hand-edited import
paths). `npm run typecheck:fast` (tsgo) is the inner loop; `npm run typecheck`
(`tsc`) is the gate.

## Global constraints

Conventions the implementer must follow — subagents do not load project skills, so
they are spelled out here:

- **One symbol per file** in `src/utils/` and `src/@types/`; the filename is the
  exported symbol's name. Deep relative imports, no barrels, no `index.ts`.
- **`type` aliases, never `interface`.**
- **Comments explain _why_, never _what_.** Module header ≤ 10 lines; comment lines
  ≤ half the file's code lines. A currency choice at a site is exactly the kind of
  thing a one-line comment earns its place recording — "inner: an occluder must
  under-occlude" — but do not annotate all 45 of them; annotate the ones a reader
  would otherwise re-derive.
- **Frame/pass-file purity.** Any file under `src/services/engine/frame/` —
  including `timing/` and `passes/` — exports the ONE symbol it is named for and
  nothing else. Helpers go to `src/utils/`, constants to `src/data/`.
  `tests/services/engine/frame/frameFilePurity.test.ts` enforces this and its
  allow-list only ever shrinks. This plan touches `earthPass.ts`,
  `planetsPass.ts`, `texturedBodiesPass.ts`, `ringsPass.ts`, `cloudShellPass.ts`,
  `meshBodiesPass.ts`, `starSpheresPass.ts`, `sceneOccluderBodies.ts`,
  `atmosphereDrawList.ts`, `bodyTextureLoadRadius.ts`, `deriveBodyStates.ts`,
  `partitionStarsByResolution.ts`, `runFrame.ts` — do not park a helper in any of
  them.
- **File moves:** `npm run move-files -- <from> <to>` (add `--dry` first). Batch
  with `-- --manifest <moves.json>`.
- **Git:** never `git add -A` — stage the files you touched. No `Co-Authored-By`
  trailers. Commit messages in the repo's `type(scope): summary` style, e.g.
  `refactor(scene): route body extent reads through outerBoundRadiusM`.
- **`npm run format`** over touched files only.

### The red window

Tasks 2–6 are a deliberately red window inside one PR: once Task 2 deletes
`radiusM` from the body arms, neither `tsc` nor the suite is green until Task 6
closes the last site. Use the typecheck error list as the worklist:

```
npm run typecheck:fast 2>&1 | rg "radiusM" | wc -l
```

Record that count at the end of Task 2, and require it to fall monotonically at
every subsequent task, reaching 0 at Task 6. Do not start Task 7 while it is
non-zero. (tsgo is a pinned dev build; confirm any surprising error against
`npm run typecheck` before acting on it.)

---

## Census — every `CelestialBody.radiusM` read, by hub and purpose

The raw identifier `radiusM` has 219 hits in `src/` across 119 files and 264 in
`tests/`, but most are a **different** field: `SelectionRow`'s star arm
(`SelectionRow.d.ts:48`, stamped with the nominal solar radius, unrelated to any
body), `MeshBody.boundingRadiusM`, the occluder/sphere descriptor structural types
(`selectOccluderSpheresKm.ts:17`, `subjectOccludedByBodies.ts:15`,
`starSphereRangeM.ts:19`, `sceneOccluderBodies.ts:28`, `visibleSlabBodies.ts:93`,
`frameContext.ts:170`, `slabs.ts:203`), the `radiusM` uniform field in
`earthSurfaceTileLayout.ts` / `io.wesl`, and scalar **parameters** named `radiusM`
threaded through the camera and slab helpers. **None of those change.** Scalar
parameter names stay as they are — renaming them is churn the compiler does not
need.

What changes: the 4 declarations, the write sites, and the **45 direct reads**
below.

### Declarations and write sites

| file:line                                         | change                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/@types/scene/EarthBody.d.ts:20`              | `radiusM` → `surface: BodySurface`; header prose updated (it names `radiusM` three times) |
| `src/@types/scene/PlanetBody.d.ts:20`             | same; header names `EarthBody.radiusM`                                                    |
| `src/@types/scene/StarBody.d.ts:24`               | same                                                                                      |
| `src/@types/scene/AnchorPointBody.d.ts:21`        | same; `:26` prose ("a multiple of `radiusM`") and `standoffRadii`'s doc at `:22-23`       |
| `src/@types/scene/CelestialBody.d.ts:1`           | header prose — "every arm with a ground `radiusM`" → a ground `surface`                   |
| `src/@types/scene/BodySpec.d.ts:12`               | authored maker input: `radiusM` → `datumRadiusM` (see ruling R1)                          |
| `src/data/bodies/makers/heliocentricPlanet.ts:21` | builds `surface: { datumRadiusM: spec.datumRadiusM, reliefM: [0, 0] }`                    |
| `src/data/bodies/makers/satelliteBody.ts:20`      | same                                                                                      |
| `src/data/bodies/makers/star.ts:36`               | same, off `row.radiusSolar × SOLAR_RADIUS_KM`                                             |
| `src/data/bodies/sceneEarth.ts:21`                | literal                                                                                   |
| `src/data/bodies/sceneSgrAStar.ts:42`             | literal, off `schwarzschildRadiusM(…)`                                                    |
| `src/data/bodies/sceneSStars.ts:36`               | literal, off `radiusSolar`                                                                |
| `src/data/bodies/scenePlanets.ts:18-78`           | 20 authored rows — key rename only (`radiusM:` → `datumRadiusM:`), values untouched       |

### Reads → currency

**OUTER** — `outerBoundRadiusM(body.surface)`. Extent, framing, near plane, LOD,
caption em; over-estimating is safe. 6 direct sites.

| file:line                                                | purpose                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| `src/utils/scene/bodyFootprintRadiusM.ts:13`             | **the hub** — 11 downstream callers change nothing (see below) |
| `src/services/engine/frame/bodyTextureLoadRadius.ts:19`  | texture demand radius                                          |
| `src/services/engine/frame/atmosphereDrawList.ts:60`     | apparent-diameter gate                                         |
| `src/services/engine/frame/passes/meshBodiesPass.ts:102` | `hostSkyFraction` — the host's solid angle as a fill           |
| `src/data/animation/clips/earthFlyout.ts:57`             | clip framing distances in Earth radii                          |
| `src/data/animation/clips/makers/makeEarthLoop.ts:25`    | same                                                           |

`bodyFootprintRadiusM` is the single most valuable line in this diff: its 11
callers — `selectionHaloTable.ts:101`, `partitionBodiesByPresentation.ts:103`,
`sceneBodyLabels.ts:170`, `bodyDrawRadiusM.ts:18`, `visibleSlabBodies.ts:89`,
`bodyGlintsPass.ts:249` and `:443`, `slabs.ts:169`, `bodyHomePose.ts:77`,
`cameraDrivers.ts:144`, `focusFraming.ts:116` — all already speak "extent" and are
correct by construction once the hub returns the outer bound. Do not touch them.

**DATUM** — `body.surface.datumRadiusM`. Band arithmetic, the drawn analytic
sphere, tile geometry, site placement. 31 direct sites.

| file:line                                                                           | purpose                                         |
| ----------------------------------------------------------------------------------- | ----------------------------------------------- |
| `src/services/engine/camera/regimeArmFor.ts:45`                                     | `hOverR` regime band                            |
| `src/services/engine/camera/nearestBodyHR.ts:31`                                    | `hOverR`                                        |
| `src/services/engine/camera/approachTiltedPose.ts:58`                               | `hOverR`                                        |
| `src/utils/camera/cameraDofAnglesOf.ts:68`                                          | `hOverR`                                        |
| `src/utils/camera/cameraDebugSnapshotOf.ts:82`                                      | altitude readout (F3 wants `bestHeightM`)       |
| `src/services/engine/camera/poseFrameConversion.ts:163`                             | `toWorldArm` sphere + descent floor             |
| `src/services/engine/camera/replayInput.ts:133`                                     | `SurfaceStepCtx.bodyRadiusM` → pick, hr, floor  |
| `src/services/engine/camera/pivotRadiusMpc.ts:24` and `:52`                         | orbit-pivot radius (Mpc), camera framing        |
| `src/state/camera/watchFlyToLonLatSaga.ts:53` and `:59`                             | eye-to-ground range, `lonLatFocusPose`          |
| `src/services/engine/frame/passes/earthPass.ts:146`                                 | drawn sphere + the `cutSurfaceTiles` radius     |
| `src/services/engine/frame/passes/planetsPass.ts:107, :111, :150`                   | mvp / cam-local / draw                          |
| `src/services/engine/frame/passes/texturedBodiesPass.ts:76, :117, :128, :138, :139` | km convert, mvp, cam-local, altitude², camRelVp |
| `src/services/engine/frame/passes/ringsPass.ts:158, :163`                           | cam-local, `planetRadiusRatio`                  |
| `src/services/engine/frame/passes/starSpheresPass.ts:119, :169`                     | star sphere radius                              |
| `src/services/engine/frame/partitionStarsByResolution.ts:81`                        | apparent-size promotion                         |
| `src/services/engine/frame/passes/cloudShellPass.ts:123, :136, :179`                | deck radius + fade (see ruling R3)              |
| `src/services/engine/frame/deriveBodyStates.ts:82` (+ `:84`)                        | surface-fixed site placement                    |
| `src/data/bodies/orbitalElements.ts:51`                                             | mesh-body semi-major = R + 400 km               |
| `src/components/InfoCard/BodyDetailCard/BodyDetailCard.tsx:142`                     | printed radius — the datum is the mean radius   |

The drawn analytic sphere is the **datum** sphere: tiles displace off the datum, so
the mvp scale and the sphere the fragment's view cosine is built from must both be
the datum, and they must be the same number (`texturedBodiesPass.ts:33` and
`planetsPass.ts:110` both already record that pairing). §7.4's base-globe shrink to
`datumRadiusM + reliefM[0]` is **F2**, not P1 — with `reliefM = [0, 0]` the two are
the same value today, so leaving it at datum here is not a deferred bug.

**INNER** — `innerBoundRadiusM(body.surface)`. Occluders must under-occlude; an
atmosphere's ground must never be above a peak. 8 direct sites.

| file:line                                                                 | purpose                                  |
| ------------------------------------------------------------------------- | ---------------------------------------- |
| `src/data/bodies/atmosphereParams.ts:28`                                  | `seededRadiusKm` → `planetRadiusKm`      |
| `src/data/bodies/atmosphereParams.ts:29`                                  | `EARTH_RADIUS_KM` → `planetRadiusKm`/top |
| `src/services/engine/frame/sceneOccluderBodies.ts:41, :44, :58, :70, :75` | trail/caption/glint occluders            |
| `src/services/engine/frame/passes/meshBodiesPass.ts:86`                   | `sunVisibleFraction` host umbra          |

§2's caveat applies to the atmosphere rows only in F3+: the inner bound is the
correct atmosphere ground radius **once** the composite is depth-aware. With
`reliefM = [0, 0]` it is today's number exactly, so P1 neither fixes nor breaks
that; the routing is what P1 lands.

**COLLISION** — `datumRadiusM`, then `standoffRadii`. Task 5. `ceilingHeightM` is
F3 and does **not** appear in this PR.

### Test-side sites

264 `radiusM` hits across 76 test files, 78 of them object-literal writes. The
majority are descriptor literals that do not change. The compiler is the list;
Task 6 works it down. Known clusters: `tests/services/engine/frame/slabs.test.ts`
(27), `tests/utils/scene/cutSurfaceTiles.test.ts` (18),
`tests/services/engine/frame/visibleSlabBodies.test.ts` (16),
`tests/services/engine/frame/passes/*.test.ts`,
`tests/services/engine/camera/poseFrameConversion.test.ts`,
`tests/helpers/camera/makeCameraSimHarness.ts`.

### Rulings (do not re-decide)

- **R1 — `BodySpec.radiusM` → `datumRadiusM`.** The maker input is the authored
  seed; leaving it named `radiusM` keeps the ambiguous name alive one hop from the
  body it constructs, which is exactly what §3.4a buys the compiler error to
  prevent. The seed authors a **datum**; `reliefM` is compiled data (§3.4e), never
  authored per body, and never enters `BodySpec`.
- **R2 — the InfoCard prints `datumRadiusM`, now and later.** §8.3 originally
  routed the printed radius to `BODY_FACTS`, but `bodyFacts.generated.ts` carries
  no radius field and no rows for Sgr A\*, the Sun or the S-stars — which the card
  prints via `!isMeshBody(seed)`. The datum _is_ the body's mean radius, i.e. the
  number the card means; the spec's §8.3 row was amended alongside this plan.
  Byte-identical output.
- **R3 — the cloud deck stays a ratio in P1.** §8.3's re-expression as altitude
  above the outer bound is F3. `cloudShellPass` picks **datum** now, with a
  one-line comment saying so and naming F3.
- **R4 — no `flatSurface(r)` convenience constructor.** Six src literals and the
  test fixtures write `{ datumRadiusM, reliefM: [0, 0] }` inline. A helper would
  become a permanent "relief is zero" crutch that F1 then has to unpick.

---

## Task 1 — `BodySurface` + the two derived bounds

**Files:** `src/@types/scene/BodySurface.d.ts` (new),
`src/utils/scene/outerBoundRadiusM.ts` (new),
`src/utils/scene/innerBoundRadiusM.ts` (new),
`tests/utils/scene/outerBoundRadiusM.test.ts` (new),
`tests/utils/scene/innerBoundRadiusM.test.ts` (new).

**Contract:**

```ts
export type BodySurface = {
  readonly datumRadiusM: number;
  readonly reliefM: readonly [number, number];
};

export function outerBoundRadiusM(surface: BodySurface): number; // datum + reliefM[1]
export function innerBoundRadiusM(surface: BodySurface): number; // datum + reliefM[0]
```

- [x] Add the type. Header ≤ 10 lines; record **why** relief is an interval and not
      a scalar (the two bounds round in opposite directions — spec §8.3) and that
      the bounds are derived, never stored.
- [x] Add both helpers, one symbol per file.
- [x] Test `outerBoundRadiusM adds the relief maximum to the datum` —
      `{ datumRadiusM: 100, reliefM: [-5, 10] }` → `110`.
- [x] Test `innerBoundRadiusM adds the relief minimum to the datum` — same input →
      `95`.
      Both expectations are hand-computed and the relief interval is deliberately
      asymmetric, so a swapped tuple index fails. This is the one real bug that can
      hide in a one-line body, and no other test or compiler check catches it
      (`testing.md`, "behavioral tests of pure functions with hand-computed
      expectations"). Two files because of one-symbol-per-file; two assertions
      total, no more.
- [x] `npm test -- outerBoundRadiusM innerBoundRadiusM`; `npm run typecheck:fast`
      still green — nothing consumes the type yet.
- [x] Commit.

## Task 2 — flip the arms, the seeds and the makers (opens the red window)

**Files:** the four arm `.d.ts` files, `CelestialBody.d.ts` (prose),
`BodySpec.d.ts`, the three makers, `sceneEarth.ts`, `sceneSgrAStar.ts`,
`sceneSStars.ts`, `scenePlanets.ts`.

- [x] Replace `readonly radiusM: number` with `readonly surface: BodySurface` on
      `EarthBody`, `PlanetBody`, `StarBody`, `AnchorPointBody`. Fix the header prose
      in each (all four name `radiusM`), plus `CelestialBody.d.ts:1`.
      `SceneBody.d.ts:8` already routes extent readers through
      `bodyFootprintRadiusM` and never names the field — leave it.
- [x] Rename `BodySpec.radiusM` → `datumRadiusM` (R1) and update the 20 rows in
      `scenePlanets.ts`. This is a property rename inside authored data — hand-edit
      is fine here, `npm run refactor -- rename` targets exported symbols, not
      fields.
- [x] Makers and literals build `surface: { datumRadiusM: …, reliefM: [0, 0] }`.
      Add ONE comment, at `BodySurface`'s definition or in `heliocentricPlanet`,
      recording that `[0, 0]` is P1's placeholder and F1 compiles real extremes
      from the height grid (§3.4e) — not one comment per seed.
- [x] `npm run typecheck:fast 2>&1 | rg radiusM | wc -l` → record the number in the
      commit body. This is the worklist size for Tasks 3–6.
- [x] Commit (`refactor(scene): CelestialBody carries a surface, not a radius`).

## Task 3 — the outer-bound group

**Files:** `bodyFootprintRadiusM.ts`, `bodyTextureLoadRadius.ts`,
`atmosphereDrawList.ts`, `meshBodiesPass.ts:102`, `earthFlyout.ts`,
`makeEarthLoop.ts`. Frame/pass purity applies to the two pass/frame files.

- [x] Point each at `outerBoundRadiusM(body.surface)` per the census.
- [x] `bodyFootprintRadiusM`'s header currently says extent readers "may not take
      `CelestialBody.radiusM`" — rewrite it to name the outer bound and why
      over-estimating is the safe direction. Its 11 callers stay untouched.
- [x] Error count strictly down. Commit.

## Task 4 — the inner-bound group

**Files:** `atmosphereParams.ts:28-29`, `sceneOccluderBodies.ts:41/44/58/70/75`,
`meshBodiesPass.ts:86`.

- [x] Point each at `innerBoundRadiusM(body.surface)`.
- [x] `sceneOccluderBodies.ts:10`'s header says radii are "the bare `radiusM`" —
      rewrite: an occluder must **under**-occlude, hence the inner bound.
- [x] One comment at `atmosphereParams.ts:26-27`'s existing metres→km boundary note
      recording that the ground radius is the inner bound, and that §2's depth-aware
      composite is what makes it correct once relief is non-zero.
- [x] Error count strictly down. Commit.

## Task 5 — the datum group, and `surfaceFloorM` honours `standoffRadii`

Two commits, one task — the mechanical routing first, then the one behaviour change,
so the behaviour change is reviewable on its own.

### 5a — datum routing

**Files:** the 31 datum sites in the census (camera arm, the draw passes,
`cloudShellPass`, `deriveBodyStates`, `orbitalElements`, `BodyDetailCard`).

- [x] Point each at `body.surface.datumRadiusM`.
- [x] Comment only where the choice is non-obvious: the drawn sphere is the datum
      sphere and F2 shrinks the base globe to the inner bound (§7.4);
      `cloudShellPass` picks datum and F3 re-expresses the deck as an altitude
      (R3); `cameraDebugSnapshotOf`'s altitude readout wants `bestHeightM` in F3.
- [x] Frame/pass purity applies to every pass file in this group.
- [x] Commit.

### 5b — the descent floor honours the override (§3.7)

**Files:** `src/utils/scene/bodyStandoffRadii.ts` (new),
`src/utils/camera/surfaceFloorM.ts`, `src/utils/camera/flooredBodyPose.ts`,
`src/utils/camera/anchoredZoomStep.ts`, `src/utils/camera/surfaceZoomStep.ts`,
`src/utils/camera/settledZoomPose.ts`, `src/services/camera/surfaceStep.ts`
(`SurfaceStepCtx`), `src/services/engine/camera/replayInput.ts:130-133`,
`src/services/engine/camera/poseFrameConversion.ts` (`toWorldArm`,
`resolveWorldArm`), `src/services/engine/camera/pivotRadiusMpc.ts:55-58`.

**Contract:**

```ts
// src/utils/scene/bodyStandoffRadii.ts
export function bodyStandoffRadii(body: SceneBody): number;
// the body's override where it has one, else clampDistance's SURFACE_STANDOFF_RADII

// src/utils/camera/surfaceFloorM.ts
export function surfaceFloorM(datumRadiusM: number, standoffRadii: number): number;
```

- [x] Extract `bodyStandoffRadii`. `pivotFraming` (`pivotRadiusMpc.ts:55-58`)
      currently inlines the `'standoffRadii' in body && typeof … === 'number'`
      widening dance; collapse it onto the new helper so there is one home for the
      fallback. Keep the `typeof` guard's rationale comment — `in` alone widens the
      absent arms to `unknown`, which is the landmine.
- [x] `surfaceFloorM` takes the standoff **explicitly, with no default**. A default
      parameter would let a call site silently keep today's bug.
- [x] Thread the standoff to the three callers: `SurfaceStepCtx` gains a
      `standoffRadii` field (filled at `replayInput.ts:130`, which already resolves
      the body); `toWorldArm` gains a parameter (filled at `resolveWorldArm:163`,
      which already resolves the body); `flooredBodyPose`, `anchoredZoomStep` and
      their pass-through callers `surfaceZoomStep` / `settledZoomPose` gain one
      too. Nothing else in that scalar thread changes — `bodyRadiusM` stays the
      datum and keeps its name.
- [x] Replace `tests/utils/camera/surfaceFloorM.test.ts`'s single existing
      assertion (`surfaceFloorM(r) / r === SURFACE_STANDOFF_RADII` — a constant
      restatement whose currency this task changes) with: - `bodyStandoffRadii falls back to the shared constant for a body with no
    override` — a body arm without the field returns `SURFACE_STANDOFF_RADII`.
      The `in` + `typeof` widening this replaces is genuinely easy to get wrong. - `the descent floor at Sgr A* matches pivotFraming's zoom floor` — assert
      `surfaceFloorM(SGR_A_STAR.surface.datumRadiusM, bodyStandoffRadii(SGR_A_STAR)) *
    SCALE_UNITS.M_TO_MPC` equals `pivotFraming(<sgr body row>).floorMpc`. This
      is the disagreement §3.7 names, it is the whole point of the change, and it
      fails the moment either side stops reading the override.
      No test asserting `radiusM` is gone (the compiler owns that), no runtime type
      test.
- [x] `npm test -- surfaceFloorM pivotRadiusMpc surfaceStep poseFrameConversion`.
- [x] Commit (`fix(camera): the descent floor honours per-body standoffRadii`).

## Task 6 — sweep the long tail; close the red window

**Files:** whatever `npm run typecheck:fast` still names, `src/` and `tests/` both.
Expect the bulk to be test fixtures.

- [x] Work the error list to zero. Every remaining src site is one of the census
      buckets — if one is not, stop and rule on its currency explicitly in the
      commit body rather than guessing.
- [x] Test fixtures: replace `radiusM: X` with
      `surface: { datumRadiusM: X, reliefM: [0, 0] }` in body fixtures only. Leave
      descriptor literals (occluder spheres, slab rows, `SelectionRow` star arms,
      `boundingRadiusM`) alone — if the compiler is not complaining, it is not a
      body. Where a file has many fixtures, a file-local const is fine; no shared
      fixture factory (R4).
- [x] Any existing assertion that changes **currency** (rather than just shape)
      gets called out in the commit body — there should be none, since all three
      bounds are equal in P1.
- [x] `npm run typecheck` (`tsc`, the gate) and the full suite green.
- [x] Commit.

## Task 7 — visual verification

No code. The picture must be identical; this is the only way to know.

- [x] `npm run dev` in this worktree (leave the existing server running; use its own
      port). Compare against `main` at four poses: Earth from ~2 R⊕ (limb +
      atmosphere + cloud deck), Earth surface-camera at ~1 km (Søndermarken tiles),
      Mars mid-approach, and the Moon against Earth (occlusion + glints).
- [x] Check specifically: atmosphere limb thickness, cloud-shell standoff,
      orbit-trail occlusion behind a planet, body glints, a pick on a body's limb,
      InfoCard's printed radius, the scale bar.
- [x] Ask the user to confirm the four poses; record the attestation in the PR body.
      Do not self-attest a visual pass.

## Task 8 — docs

- [x] `docs/RENDERER.md:35` says a new opaque body occludes trails for free if it
      lands in a partition "as a sphere with a bare `radiusM`" — update to the inner
      bound and name why (occluders under-occlude).
- [x] Grep `docs/` for other `radiusM` prose; `docs/DATA.md` has none as of writing
      — confirm, and skip the edit rather than inventing one.
- [x] In the spec, mark §3.3 joints **8** ("surface as bounds + field") as landed by
      P1 for the bounds half — the field half (`SurfaceHeightField`) is F3 — and
      leave joint **9** ("a ground-height query") open: P1 rebuilds
      `surfaceFloorM`'s joint but adds no height query. One clause each in the
      table's blocker column, or a status line under it; do not rewrite the table.
- [x] `docs/BACKLOG.md` needs no edit — the three items this work consumes were
      already deleted with the spec (`2026-09-13`), and
      `2026-09-12-rover-surface-camera-regime.md` correctly stays.
- [x] Commit (`docs(terrain): P1 landed — bounds routing, joint 8`).

---

## Definition of Done

### Deliverable inventory

- `src/@types/scene/BodySurface.d.ts` exporting `BodySurface`.
- `src/utils/scene/outerBoundRadiusM.ts`, `src/utils/scene/innerBoundRadiusM.ts`,
  `src/utils/scene/bodyStandoffRadii.ts` — one symbol each, one test file each
  where Tasks 1 and 5b specify one.
- `EarthBody`, `PlanetBody`, `StarBody`, `AnchorPointBody` carry `surface`;
  `radiusM` does not appear on any of them, nor on `BodySpec`. `MeshBody` and its
  `boundingRadiusM` are untouched.
- `surfaceFloorM(datumRadiusM, standoffRadii)` — two required parameters, no
  default.
- All 45 census read sites resolved to the currency the table names.

### Named observable behaviours (manual smoke, Task 7)

Against `main`, at four poses:

- **Identical:** Earth/Mars/Moon framing and apparent size; the atmosphere limb
  and its thickness; the cloud shell's standoff and descent fade; orbit-trail
  occlusion behind a planet; body glints and their pick classes; a limb pick on
  Earth; the surface camera's horizon at 1 km over Søndermarken; the InfoCard's
  printed radius; the scale bar's readout.
- **Changed, once, deliberately:** the camera's descent floor at Sgr A\* moves from
  ~1.0000024 r_s to 2.0 r_s — ~12.7 Gm to ~25.4 Gm — so the closest approach is
  half as close and now agrees with the zoom floor `pivotFraming` has always used.
  No other body has a `standoffRadii` override with a surface, so no other floor
  moves.

### Deferral boundary — NOT in this PR

`ceilingHeightM`, `bestHeightM`, `boundsM`, `raycast` and the whole
`SurfaceHeightField` (F3) · height-field picking, still `raySphereRoots` on the
datum (F3) · the cloud deck as an altitude above the outer bound (F3) · the
compiled 64×32 min/max grid and any non-zero `reliefM` (F1) · the base globe
shrunk to `datumRadiusM + reliefM[0]` (F2) · the terrain-aware horizon cap in
`cutSurfaceTiles` (F3) ·
procedural vertex-shader patch geometry (P6, its own PR) · everything about
tiles, products, manifests and the bake (P2–P5, F1).
