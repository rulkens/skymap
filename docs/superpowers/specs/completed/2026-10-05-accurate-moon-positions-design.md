# Accurate moon positions — design spec

Second child of the Voyager mission-trails brainstorm, after accurate planets (#834/#835). At
the Voyager flybys the app's moons sit 44–166° away from JPL along their orbits (Titan is
2.29M km off; Voyager 1 passed it at 6,490 km). Only Ganymede and Callisto are right. On
2026-10-05 the user ruled that accurate moons ship as their own spec and PR before mission
trails, and that the physical position is the source of truth, as for the planets.

## 1. What this is

The 11 moons in the scene (Io, Europa, Ganymede, Callisto; Mimas, Enceladus, Tethys, Dione,
Rhea, Titan, Iapetus) match JPL Horizons, relative to their parent, to **≤ 1,000 km over
1900–2100**. Three parts:

- **A correction per moon in two channels.**
  - A mean-anomaly series ΔM(t) is added *before* Kepler is solved, so the body stays on its
    own conic.
  - A small Cartesian residual series is added *after*, as for the planets.
  - Both are a cubic plus fitted sinusoids. Measured cost: 216 phase terms plus 110 Cartesian
    terms, about 6.3 kB in total.
- **Correct rate rows.**
  - The seven Saturn moons' `P` is a longitude period: 360/P equals the IAU spin rate to 4
    decimals. They convert through `moonRatesFromSiderealPeriods`.
  - Io's and Europa's apsides regress, so their apsis rate is negative.
  - This fixes the backlog item *moon orbit rate double-counts apsidal precession*, and keeps
    the drift small outside the span, where no correction applies.
- **Correction off outside the span.** A moon's correction is zero before 1900 and after 2100
  (ruled 2026-10-05: hard switch-off, no taper). The planets keep freeze-at-edge. Each row
  states its own policy.

**Measured, 2026-10-05**
- The full report is in the session scratchpad, `moonAccuracyReport.md`.
- Position-only corrections would cost 9.7 kB, and they push the Saturn moon trails 1–2 orbit
  radii off-centre. That is because trails are the conic translated by the correction.
- Even with recalibrated start angles, Mimas stays 0.88 r off-centre, because of its 71-year,
  ~53° libration with Tethys.
- With the phase channel, the worst trail off-centring is 0.058 r (Mimas). Iapetus is
  0.028 r, Titan 0.026 r, and every other moon ≤ 0.012 r.
- Element fixes alone cannot reach 1,000 km. Even the best constant rate and start angle leave
  Mimas 159k, Iapetus 101k and Titan 63k km off.
- A table instead of a series would cost 25–41 MB.

**Out of scope:**
- Earth's Moon. Its row is not refitted here.
- Uranus and Neptune moons (none in `main`; the Uranus moons draft #838 can add rows later).
- Re-deriving the Saturn J2000 start angles. The rows match JPL's published table, and the
  series absorbs the offset inside the span.
- A fade at the span edges. A moon jumps by up to 160° at 1900 and at 2100.

## 2. Ground preparation

Refactor-ground ran on 2026-10-05: a call-graph trace of every `propagateElements` caller and
the trail pass, plus a greenfield cross-check. The user signed off on the checkpoint (ask RQi2).

| Touchpoint | Verdict | Seam |
|---|---|---|
| Body position (`deriveBodyStates.ts:68-88`) | growth (after P2) | the 1b loop already applies a correction looked up by id; the moon rows become table rows |
| Orbit trail (`orbitTrailsPass.ts:102`) | **bolt-on → P1** | the pass propagates each row again. A ΔM applied in `deriveBodyStates` would make the trail's `kepler(propagated)` disagree with the body by the whole phase shift, so the ellipse would be translated by up to ~2r. The fix would have to be applied twice |
| Correction table, evaluator, tools | **bolt-on → P2** | `PLANET_EPHEMERIS_CORRECTIONS`, `buildPlanetEphemeris`, `fetchHorizonsPlanets` are planet-only and Cartesian-only. Moons would be a second table, a second lookup and a parallel tool |
| Rate rows (`orbitalElements.ts` satellite rows, `moonRatesFromPeriods.ts`) | growth | a per-row period-kind field and a signed apsis period. The `MIN_PRECESSION_YEARS` sentinel compares `Math.abs` |
| Synchronous module-load readers | growth | still one static generated import |

**The greenfield cross-check agreed on the shape.** It proposed:
- one N-channel series type, with each row naming the space it corrects;
- an explicit `outside` field, rather than an out-of-span policy inferred from the body class;
- one fetch tool and one build tool driven by a body table;
- corrections for moons in element space, so their trails need no translation.

**It diverged on one point.** It suggested five equinoctial channels (Δλ, Δk, Δh, Δp, Δq);
we use ΔM plus a Cartesian residual. That choice is measured, and it reuses the existing
evaluator. The five-channel form is unmeasured, and would move Iapetus's 1.5° tilt out of the
residual. Ruled: ΔM plus residual.

**Prep, as a separate PR (ruled 2026-10-05):**

- **P1: the snapshot carries the propagated elements.**
  - `BodyState.meanAnomalyRad` becomes `orbit?: OrbitalElements`: the elements
    `deriveBodyStates` actually used at `simDays`, set for every element row and absent for
    anchors and sites.
  - `orbitTrailsPass` reads `state.orbit` for `keplerianEllipse`, `keplerianPositionMpc` and the
    fade anchor, and stops calling `propagateElements`.
  - This is behaviour-neutral.
  - `tests/fixtures/bodyStatesJ2000.json` is regenerated (the field changes shape), and the
    `orbitTrailsPass` test fixtures build `orbit` instead of `meanAnomalyRad`.
- **P2: a body-agnostic correction table and tools.**
  - The types become the §3 shapes, and `ephemerisCorrectionMpc` becomes
    `correctionSeriesAt(series, simDays, outside) → number[]`, with channels summed in f64.
    `deriveBodyStates` converts km to Mpc.
  - `PLANET_EPHEMERIS_CORRECTIONS` becomes `EPHEMERIS_CORRECTIONS` in
    `ephemerisCorrections.generated.ts`.
  - `buildPlanetEphemeris` becomes `buildEphemerisCorrections`, and `fetchHorizonsPlanets`
    becomes `fetchHorizons`, both driven by one `HORIZONS_BODIES` table
    (`{ id, target, centre, stepDays, outside }`).
  - The raw-data registry key `horizons.planets` becomes `horizons`, with one sub-directory per
    centre. The npm scripts are renamed to match.
  - The planet values are regenerated unchanged (to the last emitted digit), and every row
    gets `outside: 'hold'`.
  - This is behaviour-neutral.

## 3. Data shapes

```ts
// src/@types/scene/CorrectionSeries.d.ts — N channels, cubic in τ plus sinusoids
export type CorrectionSeries = {
  startJd: number; endJd: number;          // fitted span, UTC JD
  poly: readonly (readonly number[])[];    // [τ⁰..τ³][channel], τ = 2(t−start)/(end−start) − 1
  terms: readonly number[];                // flat per term: ω rad/day, cos[ch], sin[ch]; phase ω·(t − startJd)
};

// src/@types/scene/EphemerisCorrection.d.ts — one body's Horizons − model correction
export type EphemerisCorrection = {
  outside: 'hold' | 'off';                 // planets hold the edge value; moons switch off
  meanAnomalyRad?: CorrectionSeries;        // 1 channel; added to M before Kepler (moons)
  positionKm?: CorrectionSeries;            // 3 channels, equatorial; added after Kepler
};

// src/data/bodies/ephemerisCorrections.generated.ts   (GENERATED — DO NOT EDIT)
export const EPHEMERIS_CORRECTIONS: Readonly<Record<string, EphemerisCorrection>>;

// tools/bodies/horizonsBodies.ts
export const HORIZONS_BODIES: readonly HorizonsBody[] = [
  { id: 'mercury', target: '199', centre: '500@10',  stepDays: 2,  outside: 'hold' },
  // … the other planets as today …
  { id: 'io',      target: '501', centre: '500@599', stepDays: …,  outside: 'off' },
  { id: 'titan',   target: '606', centre: '500@699', stepDays: …,  outside: 'off' },
  // … all 11 moons; stepDays keeps ≥ 8 samples per orbit (Mimas P = 0.94 d)
];

// orbitalElements.ts satellite rows gain:
periodKind: 'anomalistic' | 'longitude';   // Saturn moons 'longitude'; Galileans 'anomalistic'
apsidalPrecessionYears: -1.333,             // Io (signed: negative = regressing); Europa likewise
```

**Frame, time and centre are pinned by construction.**
- **Frame.** Moon targets are fetched relative to their parent's *centre* (`500@599`,
  `500@699`), with `REF_PLANE='FRAME'` and `TIME_TYPE='UT'`.
- **Parent position.** The app positions a moon on its parent's row, which is the system
  barycentre. The barycentre-to-centre offset is ≤ ~300 km (Titan's pull on Saturn), well
  inside the budget; the fit absorbs only what it sees.
- **Frequency digits.** ω is emitted at 12 significant digits. The phase error reaches ~30 km
  at Iapetus by 2100, which the verify step counts. ω stays f64, because ω·dt reaches ~1.5e7
  rad.

## 4. Runtime

- **`src/utils/orbit/correctionSeriesAt.ts`.**
  - `(s: CorrectionSeries, simDays: number, outside) => number[] | undefined`.
  - With `'hold'` it clamps `simDays` to the span. With `'off'` it returns `undefined` outside
    `[startJd, endJd]`.
  - It sums the polynomial and the terms per channel in f64.
- **`deriveBodyStates` 1b, per element row:**
  1. `propagated = propagateElements(el, simDays)`.
  2. If a `meanAnomalyRad` correction applies,
     `propagated = { ...propagated, meanAnomalyRad: propagated.meanAnomalyRad + ΔM }`.
  3. `position = focus + kepler(propagated) + positionKm·KM_TO_MPC − pairReflex`.
  4. `orbit = propagated` goes into the snapshot (P1).

  The trail then reads the corrected `orbit`, so the trail centre moves only by the Cartesian
  residual (≤ 0.058 r).
- **Cost.** About 330 more sinusoids per new `simDays`, a few µs, behind the existing one-deep
  memo.

## 5. Tools

- **`fetchHorizons`** (`npm run fetch-horizons`).
  - Iterates `HORIZONS_BODIES` over 1900–2100 in 50-year chunks with retry.
  - Moon rows are fetched at a fine step (≤ P/16; Mimas ≈ 1.4 h). Raw output for moons is ~4.7M
    rows in total, gitignored, with the README recording the queries.
- **`buildEphemerisCorrections`** (`npm run build-ephemeris-corrections`).
  - **Planets:** unchanged — a Cartesian fit against the app's own Kepler.
  - **Moons:**
    1. Fit the ΔM target on the fit grid. Each sample is the Newton argmin of
       `|app(M + ΔM) − Horizons|`, with the angle unwrapped. Fit the phase to 300 km-equivalent
       (`|ΔM|·r`).
    2. Fit a Cartesian series to the remaining residual, stopping at 900 km.
  - **Verify every body** on its full Horizons grid through the shipped (rounded) values, and
    throw above 1,000 km.
  - Fitting helpers stay in `tools/utils/math/`. `fitSinusoidSeries` takes N channels, so the
    same helper fits 1 or 3.
- **Regeneration rule:** any edit to an element row, a rate field or the frame requires a
  re-run. The §7 fixture test fails until it is re-run.

## 6. Docs and backlog

- Delete `docs/backlog/2026-10-03-moon-orbit-rate-double-counts-apsidal-precession.md` and its
  `BACKLOG.md` line in the feature PR.
- `moonRatesFromPeriods.ts` header: replace "every moon is prograde, so +apsis" with the signed
  period, and point Saturn's longitude periods at `moonRatesFromSiderealPeriods`.
- `docs/DATA.md`: the Horizons entry covers the body table and the moon centres.

## 7. Tests

- **`tests/data/bodies/ephemerisCorrections.test.ts`** (extends today's planet test).
  - Fixture: `tests/fixtures/horizonsMoons.json`, with 6 dates × 11 moons, parent-centred, UT.
  - `deriveBodyStates` moon − parent must be ≤ 1,000 km from each fixture vector, plus the
    measured barycentre offset, which the test states.
  - The Voyager flyby dates are among the 6 dates.
- **`correctionSeriesAt.test.ts`:**
  - `'hold'` returns exactly the edge value outside the span.
  - `'off'` returns `undefined` outside the span, and the full value at `startJd` and `endJd`.
- **Trail centring:** for Mimas and Titan at a flyby date, the trail ellipse centre lies within
  0.06 r of the parent position. This pins P1 together with the phase channel.
- **Rate rows:** Saturn moons' `360/P` matches the IAU spin rate, and Io's ω-rate is negative.
  Each pin fails on its own bug.
- **Re-recorded:** `bodyStatesJ2000.json`, and the camera golden traces where a moon is in frame.

## 8. PR sequence

1. **Prep PR** (separate, ruled 2026-10-05): P1 and P2, each its own commit, both
   behaviour-neutral.
2. **Feature PR**, built on top of it:
   - rate rows and the sign fix
   - moon `HORIZONS_BODIES` rows and the fetch
   - the moon fit path in the build tool
   - generated corrections
   - the ΔM term in `deriveBodyStates`
   - tests, fixtures, docs and the backlog deletion

Stacked PRs get no GitHub CI (`ci.yml` triggers only on base `main`), so run the local gate.
