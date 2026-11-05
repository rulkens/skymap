# Accurate planet positions — design spec

Child of the Voyager mission-trails brainstorm (2026-09-28 → 2026-10-03). Voyager's flybys
are only as honest as the planets they pass: today's Keplerian planets drift from JPL by
98k km at Jupiter up to 1.6M km at Saturn at the flyby dates, 9–16× the miss distances. On
2026-10-03 the user ruled that **the accurate physical planet position is the source of
truth**, independent of any flyby window, and that it ships as its own spec and PR before the
mission-trails spec.

## 1. What this is

Heliocentric positions of the eight planets match JPL DE (Horizons) to **≤ 1,000 km over
1900–2100**. That is 3% of the closest planet flyby (Voyager 2 at Neptune, ~29,000 km from
centre). Four parts:

- **A correction series per planet**, added on top of today's Keplerian position. It is a
  cubic polynomial plus fitted sinusoids, generated offline from Horizons and shipped as
  constants. All eight planets together take ~590 terms, about 17 kB. A build tool fits it
  and checks it against JPL.
- **Earth wobbles around the Earth–Moon barycentre (EMB).** The `earth` element row already
  describes the EMB, so Earth = EMB − k·(Moon's geocentric offset), with k the Moon's share of
  the pair's mass.
- **Orbit trails follow the corrected body.** Each trail is the same Keplerian conic,
  translated so it passes through the body's snapshot position.
- **Exact obliquity.** `OBLIQUITY_DEG` becomes 23.4392911° instead of the rounded 23.44°.

**Out of scope:**
- Moon accuracy. Moons keep their own element rows.
- Pluto–Charon. That becomes one more pair row later (§6).
- Spacecraft. Mission trails is the next spec and reuses the fetch tool.
- Any runtime TDB time scale.

## 2. Ground preparation

Refactor-ground ran on 2026-10-03. It sent an Explore trace over every reader of a planet's
position and over the trail pass, and ran a greenfield cross-check. The user signed off on the
checkpoint.

| Touchpoint | Verdict | Seam |
|---|---|---|
| Body position (`deriveBodyStates.ts:63-67`) | growth | one added term in the 1b loop; it is the only place positions are composed |
| Orbit trail (`orbitTrailsPass.ts:101-109`) | **bolt-on → P1** | the pass re-propagates each conic and re-folds the focus itself, a mirror of `deriveBodyStates`. The body sits on its trail only because both happen to agree, so adding the correction here would make a second copy |
| Obliquity (`orbitPlaneFrames.ts:72`) | **wrong constant → P2** | the fit is generated against the app's frame, so the constant must be right before the first generation |
| Earth wobble | growth | a new pair table read in the same 1b loop. No focus-graph node: the backlog's invisible-node design is needed only for Pluto's minor moons |
| Synchronous readers at module load (`bodyRegions.ts:29`, `starCatalog/create.ts:63`) | growth | the generated `.ts` is a static import, as with `bodyFacts.generated.ts` |
| Generated data | growth | `tools/bodies/buildPlanetFacts.ts` precedent: banner, prettier, committed output |

**The greenfield cross-check diverged on three points, all resolved by measurement or ruling:**
- **Residual table → fitted series.** A table needs ~140 kB in f32 (Mercury needs a 13-day
  step); the series needs ~17 kB.
- **Sampled trail with a geometric tail → translated conic.** With a translated conic the
  worst case is Saturn: 4 px with the whole orbit 1,000 px wide, and 0.34° tangent error close
  up. Mercury through Earth stay under 0.1 px.
- **Spacecraft in planet-relative legs → rejected.** With accurate planets, heliocentric
  samples are enough. That decision belongs to the mission-trails spec.

**Prep, as a separate PR (ruled 2026-10-04):**

- **P1: trails anchor on the snapshot body.** `orbitTrailsPass` takes
  `centreMpc = state.positionMpc − keplerianPositionMpc(propagated) + centerOffsetMpc` instead
  of `focus + centerOffsetMpc`.
  - This is behaviour-neutral today, apart from f64 rounding.
  - Once this lands, the body sits on its own trail by construction rather than by coincidence.
  - Any later change to a body's position (correction, pair reflex, a moon's parent) moves the
    trail with it.
  - The 18–20-digit trail tests (`orbitTrailsPass.test.ts:345-378`, `:511-573`) move to a
    tolerance that f64 can actually hold.
  - The `orbitalElements.ts` header line about the invariant is rewritten to name the new
    mechanism.
- **P2: exact obliquity.** `OBLIQUITY_DEG = 23.4392911` (IAU 1980 / J2000 mean obliquity).
  - The obliquity literals in tests follow: `orbitPlaneFrames.test.ts:53`,
    `orientationFrames.test.ts:54`, and the comments in `propagateElements.test.ts:94` and
    `earthTerminator.test.ts:17`. So do the `23.44°` comments in `rotationLookAt.ts` and
    `defaults.ts`.
  - The fixture `tests/fixtures/bodyStatesJ2000.json` and the camera golden traces are
    re-recorded, under this ruling, with `SETTLE_GOLDEN_RECORD=1` and `DRIVER_GOLDEN_RECORD=1`.

## 3. Data shapes

```ts
// src/@types/scene/EphemerisCorrection.d.ts — one planet's DE − Kepler correction, km
export type EphemerisCorrection = {
  startJd: number; endJd: number;     // fitted span; outside it the edge value is held
  polyKm: readonly [Vec3, Vec3, Vec3, Vec3]; // cubic in τ = 2(t−start)/(end−start) − 1
  // flat (ω rad/day, cos x,y,z, sin x,y,z) per term; phase measured from startJd
  terms: readonly number[];
};

// src/@types/scene/BarycentricPair.d.ts — the primary's element row describes the pair barycentre
export type BarycentricPair = { primaryId: string; secondaryId: string; secondaryMassFraction: number };

// src/data/bodies/planetEphemerisCorrections.generated.ts   (GENERATED — DO NOT EDIT)
export const PLANET_EPHEMERIS_CORRECTIONS: Readonly<Record<string, EphemerisCorrection>>;

// src/data/bodies/barycentricPairs.ts
export const BARYCENTRIC_PAIRS: readonly BarycentricPair[] =
  [{ primaryId: 'earth', secondaryId: 'moon', secondaryMassFraction: 1 / 82.30057 }];
```

**Frame and time are pinned by construction, not converted at runtime.**
- **Frame.** The fit tool computes `DE − app Kepler` in the app's own equatorial frame, so any
  residual frame bias is absorbed into the correction.
- **Time.** Horizons is fetched with `TIME_TYPE='UT'`, which is verified to be accepted for
  vector tables, so the TDB−UTC gap (~69 s, ~2,000 km at Earth) is absorbed as well. `simDays`
  stays a UTC Julian date.
- **Planet targets.** Mercury and Venus use their planet centres (199, 299). Earth through
  Neptune use their system barycentres (3–8), because the planet-centre wobble caused by moons
  is ≤ 300 km.

## 4. Runtime

- **`src/utils/orbit/ephemerisCorrectionMpc.ts`** —
  `(c: EphemerisCorrection, simDays: number) => Vec3`. It clamps `simDays` to
  `[startJd, endJd]` (the ruled freeze-at-edge), sums the polynomial and the terms in f64 km,
  then converts to Mpc. The conversion happens before the sum joins an au-scale position, as in
  the site-offset precedent at `deriveBodyStates.ts:88-94`.
- **`deriveBodyStates` 1b:**
  `position = focus + kepler(el) + correction(el.id) − pairReflex(el.id)`.
  - `pairReflex` is `secondaryMassFraction · keplerianPositionMpc(propagateElements(secondary))`
    for a primary listed in `BARYCENTRIC_PAIRS`.
  - The secondary's offset is computed inline, because `FOCUS_ORDER` resolves `earth` before
    `moon`.
  - Dependants of `earth` (the Moon, Hubble, the easter eggs, Earth sites) follow the
    reflexed Earth automatically. So Moon = EMB + (1−k)·geo, which is physically right.
- **Cost:** about 590 sinusoid evaluations per new `simDays`, a few µs. The existing one-deep
  memo makes paused frames free. Trails add nothing, because P1 reads the snapshot.

## 5. Tools

- **`tools/fetch/fetchHorizonsPlanets.ts`** (`npm run fetch-horizons-planets`).
  - Fetches 1-day equatorial heliocentric vectors, 1900–2100, in 50-year chunks with retry.
  - Writes them to `data/raw/horizons/planets/<naif>.csv`.
  - The output is gitignored, registered in `rawDataRegistry.ts` with a README next to it
    that records the exact API query.
- **`tools/bodies/buildPlanetEphemeris.ts`** (`npm run build-planet-ephemeris`).
  - Subtracts the app's Kepler position using the `src/` propagation, imported as
    `buildPlanetFacts` imports `src` types.
  - Fits each planet greedily: cubic polynomial, then sinusoids. Each frequency is the
    zero-padded FFT peak of the remaining residual, and a Gram–Schmidt step refits all
    coefficients exactly by least squares.
  - Stops once a planet is ≤ 900 km, leaving margin.
  - **Verifies every planet on the dense 1-day grid** and throws above 1,000 km.
  - Writes the generated file with a banner plus prettier.
  - Helpers go one function per file under `tools/utils/math/` (`fft.ts`,
    `fitSinusoidSeries.ts`).
- **Regeneration rule:** any edit to a planet's element row or to the frame requires
  re-running the build tool. The test in §7 fails until it is re-run.

## 6. Docs and backlog

- `scenePlanets.ts:3`: rewrite the stale "positions via keplerianPositionMpc" header.
- `docs/backlog/2026-08-16-barycentric-orbit-pairs.md`: note that the pair table now exists.
  Pluto's wobble becomes one `BARYCENTRIC_PAIRS` row; the minor moons still need the invisible
  node. The BACKLOG line stays and its clause is updated.
- `docs/DATA.md`: add a Horizons fetch entry.
- `orbitReachByRegion` gets no margin for the correction. ≤ 8M km is negligible against
  Pluto's ~50 au reach. Recorded here, not backlogged.

## 7. Tests

- **`tests/data/bodies/planetEphemeris.test.ts`.**
  - Fixture: a committed Horizons fixture, `tests/fixtures/horizonsPlanets.json`, with 6 dates
    × 8 planets, UT, equatorial.
  - `deriveBodyStates` must be ≤ 1,000 km from each fixture vector.
  - It fails if anyone edits a planet's elements or the frame without regenerating.
  - Earth is checked against Horizons 399 (Earth centre) to ≤ 1,000 km plus the Moon-model
    error. The tolerance is stated in the test after measurement.
- **`ephemerisCorrectionMpc.test.ts`:** a clamped date returns exactly the edge value
  (freeze), with continuity across `startJd` and `endJd`.
- **Pair reflex:**
  - Earth–Moon distance is unchanged.
  - The EMB, computed as (1−k)·Earth + k·Moon, equals the old Earth position.
- **Re-recorded:**
  - `tests/fixtures/bodyStatesJ2000.json`
  - the camera golden traces
  - `tools/perf/perfScenarios.ts:52` `EARTH_TARGET`
  - the 2024-04-08 eclipse test keeps its 2° tolerance, and should tighten.

## 8. PR sequence

1. **Prep PR** (separate, ruled): P1 and P2, each its own commit. They are behaviour-neutral
   except for the obliquity.
2. **Feature PR**, built on top of it:
   - fetch tool and raw-registry entry
   - fit tool and helpers
   - generated corrections
   - pair table and the `deriveBodyStates` term
   - tests, docs and backlog edits
