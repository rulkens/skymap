# Accurate moon positions — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development under the
> lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The 11 scene moons match JPL Horizons, relative to their parent, to ≤ 1,000 km over
1900–2100. Every moon stays on its own trail, and each trail stays centred on its parent.

**Architecture:** Each moon gets a generated correction in two channels.
- A mean-anomaly series ΔM(t) is added to the propagated elements before Kepler is solved.
- A small Cartesian residual series is added after, through the same table and evaluator the
  planets use.

Two behaviour-neutral prep refactors land first:
- **P1.** The snapshot carries the propagated elements, so the trail pass stops re-propagating.
- **P2.** The correction table and tools become body-agnostic N-channel series with an explicit
  out-of-span policy.

The satellite rate rows are fixed as well: Saturn moons use longitude periods, and Io's and
Europa's apsis rates are negative.

**Tech stack:** TypeScript, Vitest, tsx tools, the JPL Horizons API.

**Spec:** `docs/superpowers/specs/2026-10-05-accurate-moon-positions-design.md`

## Global constraints

- **Accuracy:** ≤ **1,000 km** from Horizons, moon minus parent centre, for every moon over
  **1900-01-01 → 2100-01-01**.
  - The phase fit stops at **300 km-equivalent** (`|ΔM|·r`), and the Cartesian residual fit stops
    at **900 km**.
  - The tool verifies the shipped (rounded) values on every fetched row and throws above 1,000 km.
- **Out of span:** moons use `outside: 'off'` (zero correction before `startJd` and after
  `endJd`, hard switch, no taper). Planets keep `outside: 'hold'` (clamp to the edge).
- **Horizons query** for moons: `CENTER='500@599'` (Jupiter centre) or `'500@699'` (Saturn
  centre), with `REF_PLANE='FRAME'`, `TIME_TYPE='UT'`, `OUT_UNITS='KM-S'`, `CSV_FORMAT='YES'`,
  `VEC_TABLE='1'`.
  - Targets: Io 501, Europa 502, Ganymede 503, Callisto 504, Mimas 601, Enceladus 602, Tethys
    603, Dione 604, Rhea 605, Titan 606, Iapetus 608.
  - Step ≤ P/16 per moon; 50-year chunks; up to 5 retries per chunk.
- **Number format:** ω at **12 significant digits** (f64); amplitudes and polynomial
  coefficients to 0.1 km for Cartesian, and to 1e-7 rad for ΔM.
- **Planet values are unchanged** by P2. The regenerated planet coefficients must equal today's
  emitted literals.
- **Conventions:**
  - one symbol per `utils/` and `@types/` file; `type`, never `interface`;
  - frame and pass files export only their one symbol (`frameFilePurity` ratchet);
  - any TS file move or rename uses `npm run move-files -- <from> <to>` (`--dry` first), never
    `git mv` plus hand-edited imports; grep for the old path afterwards.
- **Branches:** never commit on `main`.
  - **Prep (Tasks 1–2)** is a separate PR on branch `accurate-moons-prep` off `main`. This spec
    and plan are committed there too.
  - **Feature (Tasks 3–5)** goes on `accurate-moons`, stacked on the prep branch.
  - Stacked PRs get no GitHub CI, so run the local gate (`npm run typecheck`, `npm test`).

## Review focus

1. **A scrub across 2100-01-01 or 1900-01-01.** Moons switch to uncorrected Kepler. Positions
   stay finite and there is no throw. The jump (≤ 160°) is accepted. Tested in Task 3
   (`correctionSeriesAt` off) and Task 5 (a moon at 2100 + 1 day equals its raw Kepler).
2. **Mimas or Titan focused with trails on.** The trail ellipse stays centred on the parent and
   passes through the body. Tested in Task 5 (trail centring).
3. **A planet at a date outside the span after P2.** It still holds its edge value, exactly as
   before. Tested in Task 2 (the `'hold'` test carries over).
4. **An element-row or rate edit without regenerating.** The Horizons fixture test fails loudly.
   Tested in Task 5.
5. **A tiny or negative precession period.** The `0.000` sentinel still yields zero, and a
   negative period yields a negative rate. Tested in Task 3.

---

## PR 1: prep (`accurate-moons-prep`)

### Task 1: The snapshot carries the propagated elements (P1)

**Files:**
- `src/@types/scene/BodyState.d.ts` (modify)
- `src/services/engine/frame/deriveBodyStates.ts` (modify)
- `src/services/engine/frame/passes/orbitTrailsPass.ts:96-145` (modify)
- `tests/fixtures/bodyStatesJ2000.json` (regenerate)
- every test that builds a `BodyState` literal (the `meanAnomalyRad` sweep:
  `git grep -l meanAnomalyRad -- tests`)

**review: yes** (trail anchoring is camera-adjacent maths)

**Contract:**

```ts
// BodyState — replaces `meanAnomalyRad: number`
/** The elements `deriveBodyStates` positioned this body with at the instant (propagated and,
 *  later, corrected). Absent for anchors and surface sites, which have no orbit. */
readonly orbit?: OrbitalElements;
```

- `orbitTrailsPass` reads `states.get(id)!.orbit!` for `keplerianEllipse`, for
  `keplerianPositionMpc` and for the fade anchor (`orbit.meanAnomalyRad`, staging float 16). It no
  longer imports `propagateElements`.
- Every orbit-trail row is an element row, so `orbit` is present. A missing one throws with the id.

**Steps:**
- [x] Sweep `meanAnomalyRad` off `BodyState` and onto `orbit`. Test literals build `orbit` from the
      row's propagated elements, or omit it for anchors. This is a type sweep, so it gets no new
      test.
- [x] Add the test `orbitTrailsPass reads the snapshot orbit, not its own propagation`. Stub one
      row's `state.orbit` with `meanAnomalyRad` shifted by +1 rad from the propagated value, and
      `positionMpc` = focus + `keplerianPositionMpc(stubbedOrbit)`. The packed ellipse centre (eye
      basis C) must equal focus + `centerOffsetMpc`, eye-relative in km, to ≤ 1 m. Staging float 16
      must equal the stubbed M. The test fails on today's code, where the centre moves by the
      chord of a 1 rad shift.
- [x] Regenerate `bodyStatesJ2000.json` (same regen script as #835), then run `npm test`.
- [x] Commit `refactor(bodies): snapshot carries propagated orbit; trails stop re-propagating`.

### Task 2: Body-agnostic correction table and tools (P2)

**Files:**
- Types:
  - create `src/@types/scene/CorrectionSeries.d.ts`
  - modify `src/@types/scene/EphemerisCorrection.d.ts`
- Runtime:
  - `src/utils/orbit/ephemerisCorrectionMpc.ts` → `src/utils/orbit/correctionSeriesAt.ts` (move,
    then rewrite)
  - `src/data/bodies/planetEphemerisCorrections.generated.ts` →
    `src/data/bodies/ephemerisCorrections.generated.ts` (move, regenerated)
  - `src/services/engine/frame/deriveBodyStates.ts` (modify)
- Tools:
  - `tools/bodies/buildPlanetEphemeris.ts` → `tools/bodies/buildEphemerisCorrections.ts`
  - `tools/fetch/fetchHorizonsPlanets.ts` → `tools/fetch/fetchHorizons.ts`
  - create `tools/bodies/horizonsBodies.ts` and `tools/bodies/@types/HorizonsBody.ts`
  - modify `tools/utils/math/fitSinusoidSeries.ts`
  - modify `tools/utils/io/rawDataRegistry.ts`
- Config and docs: `package.json` scripts, `docs/DATA.md`
- Tests (moved or modified):
  - `tests/utils/orbit/ephemerisCorrectionMpc.test.ts` → `correctionSeriesAt.test.ts`
  - `tests/tools/utils/math/fitSinusoidSeries.test.ts`
  - `tests/data/bodies/planetEphemeris.test.ts` → `ephemerisCorrections.test.ts`

Moves first, then edits:

```bash
npm run move-files -- --dry src/utils/orbit/ephemerisCorrectionMpc.ts src/utils/orbit/correctionSeriesAt.ts
npm run move-files -- src/utils/orbit/ephemerisCorrectionMpc.ts src/utils/orbit/correctionSeriesAt.ts
npm run move-files -- src/data/bodies/planetEphemerisCorrections.generated.ts src/data/bodies/ephemerisCorrections.generated.ts
npm run move-files -- tools/bodies/buildPlanetEphemeris.ts tools/bodies/buildEphemerisCorrections.ts
npm run move-files -- tools/fetch/fetchHorizonsPlanets.ts tools/fetch/fetchHorizons.ts
npm run move-files -- tests/data/bodies/planetEphemeris.test.ts tests/data/bodies/ephemerisCorrections.test.ts
```

Then grep for `planetEphemeris`, `PLANET_EPHEMERIS`, `ephemerisCorrectionMpc`, `horizons.planets`,
`fetch-horizons-planets` and `build-planet-ephemeris`. No hits may remain outside `*/completed/`.

**Contract:**

```ts
// src/@types/scene/CorrectionSeries.d.ts
export type CorrectionSeries = {
  readonly startJd: number;                         // UTC JD
  readonly endJd: number;
  /** [τ⁰, τ¹, τ², τ³][channel]; τ = 2(t − startJd)/(endJd − startJd) − 1. */
  readonly poly: readonly [readonly number[], readonly number[], readonly number[], readonly number[]];
  /** Flat per term: ω (rad/day), cos[0..C), sin[0..C); phase ω·(t − startJd). C = poly[0].length. */
  readonly terms: readonly number[];
};

// src/@types/scene/EphemerisCorrection.d.ts
export type EphemerisCorrection = {
  readonly outside: 'hold' | 'off';
  readonly meanAnomalyRad?: CorrectionSeries;   // 1 channel, added to M before Kepler
  readonly positionKm?: CorrectionSeries;       // 3 channels, equatorial km, added after Kepler
};

// src/utils/orbit/correctionSeriesAt.ts
export function correctionSeriesAt(
  s: CorrectionSeries, simDays: number, outside: 'hold' | 'off',
): number[] | undefined;   // 'hold' clamps simDays into the span; 'off' → undefined outside it

// src/data/bodies/ephemerisCorrections.generated.ts
export const EPHEMERIS_CORRECTIONS: Readonly<Record<string, EphemerisCorrection>>;

// tools/bodies/@types/HorizonsBody.ts
export type HorizonsBody = {
  id: string; target: string; centre: string; // e.g. '500@10'
  stepDays: number;                            // raw fetch step
  fitStep: number;                             // every n-th raw row on the fit grid
  outside: 'hold' | 'off';
};

// tools/utils/math/fitSinusoidSeries.ts — N channels in, CorrectionSeries fields out
export function fitSinusoidSeries(
  tJd: Float64Array, residual: readonly Float64Array[], startJd: number, endJd: number,
  stop: number, maxTerms: number,
): Pick<CorrectionSeries, 'poly' | 'terms'>;  // stop compares the channel-vector norm
```

**Wiring:**
- `deriveBodyStates` 1b looks up `EPHEMERIS_CORRECTIONS[el.id]`. When `positionKm` evaluates,
  it adds the result × `SCALE_UNITS.KM_TO_MPC`. ΔM wiring arrives in Task 4.
- Raw data:
  - The registry key `horizons.planets` becomes `horizons`, at path `data/raw/horizons`, with
    one sub-directory per centre: `500@10/` holds the planets.
  - Move the existing local CSVs there by hand (gitignored).
  - The README covers the body table.
- npm scripts: `fetch-horizons` and `build-ephemeris-corrections`.
- `HORIZONS_BODIES` holds only the 8 planet rows in this task, `outside: 'hold'`, with today's
  steps.

**Steps:**
- [x] Do the moves above, then the type and evaluator rewrite. The `'hold'` tests carry over
      unchanged in meaning.
- [x] Add the test `correctionSeriesAt 'off' returns undefined outside the span and the full value
      on its edges`. Check `startJd − 1e-6` and `endJd + 1e-6` → `undefined`, and `startJd` and
      `endJd` → equal to the `'hold'` value.
- [x] Extend the fit helper to N channels. The existing 3-channel test keeps passing. Add a
      1-channel case, `fitSinusoidSeries fits a scalar channel`: a synthetic cubic plus 2
      sinusoids recovered to < 1e-6 of amplitude.
- [x] Re-run `npm run build-ephemeris-corrections`. The planet blocks in the generated file must
      be value-identical to the old file: same ω, poly and amplitude literals, now in
      `{ outside: 'hold', positionKm: {...} }` shape. Check by diffing the numbers.
- [x] `npm test`, especially `ephemerisCorrections.test.ts` (today's planet Horizons check), then
      `npm run typecheck`.
- [x] Commit `refactor(bodies): body-agnostic ephemeris corrections (N-channel series, explicit
      out-of-span policy)`.

---

## PR 2: feature (`accurate-moons`, stacked)

### Task 3: Satellite rate rows (period kind + signed apsis)

**Files:**
- `src/utils/orbit/moonRatesFromPeriods.ts` (modify the header and sentinel)
- `src/data/bodies/makers/satellite.ts` (modify)
- `src/data/bodies/orbitalElements.ts` (modify the 11 satellite rows)
- `tests/utils/orbit/moonRatesFromPeriods.test.ts` and `tests/data/bodies/satellite.test.ts`
  (modify)
- `docs/BACKLOG.md` and `docs/backlog/2026-10-03-moon-orbit-rate-double-counts-apsidal-precession.md`
  (delete the line and the file)

**Contract:**
- `satellite(spec)` gains `periodKind: 'anomalistic' | 'longitude'`. `'longitude'` routes the
  conversion through `moonRatesFromSiderealPeriods`, and `'anomalistic'` through
  `moonRatesFromPeriods`.
- **Saturn moons** (mimas, enceladus, tethys, dione, rhea, titan, iapetus) use `'longitude'`. The
  **Galileans** use `'anomalistic'`.
- `apsidalPrecessionYears` is **signed**: negative means the apsis regresses.
  - Io becomes `-1.333`, Europa `-1.394`.
  - The sentinel compares `Math.abs(period) > MIN_PRECESSION_YEARS`.
  - The rate is `sign(period) · 2π·100/|period|` for the apsis. The node keeps its fixed
    regression sign.
- If `moonRatesFromSiderealPeriods` has a different input shape, the satellite maker adapts to it.
  Its signature does not change.

**Steps:**
- [ ] Add the test `moonRatesFromPeriods: a negative apsidal period gives a negative ω-rate, a
      sub-sentinel one in either sign gives 0`. Check −1.333 → −2π·100/1.333; and −0.005 and
      +0.005 → 0.
- [ ] Add the test `Saturn satellites advance at their IAU spin rate in longitude`. For each Saturn
      moon, (dM + dω + dΩ)/dt in °/day equals 360/P to 1e-9. That is the longitude-rate identity,
      and it fails on today's double count.
- [ ] Add the test `Io's apsis regresses`: its `argPeriapsisRateRadPerCty < 0`.
- [ ] Update the rows, the maker and the helper header. Delete the backlog line and its detail
      file.
- [ ] Commit `fix(bodies): satellite periods read per row (longitude vs anomalistic), Io/Europa
      apsides regress`.

### Task 4: Moon Horizons rows, fit path and the ΔM term

**Files:**
- `tools/bodies/horizonsBodies.ts` (add 11 moon rows)
- `tools/bodies/buildEphemerisCorrections.ts` (moon path)
- `tools/utils/math/meanAnomalyCorrectionTarget.ts` (create) with its test
- `src/data/bodies/ephemerisCorrections.generated.ts` (regenerate)
- `src/services/engine/frame/deriveBodyStates.ts` (ΔM term)
- `docs/DATA.md` (moon centres)

**review: yes** (the generated physics data and the position pipeline)

**Contract:**

```ts
// tools/utils/math/meanAnomalyCorrectionTarget.ts
/** ΔM (rad) that best aligns the app's conic with one Horizons vector: Newton on
 *  |kepler({...propagated, meanAnomalyRad: M + ΔM}) − horizonsKm|, seeded by the in-plane
 *  angle between the two. Unwrapping across samples is the caller's job. */
export function meanAnomalyCorrectionTarget(propagated: OrbitalElements, horizonsKm: Vec3): number;
```

- **Moon rows:** `centre` is `'500@599'` or `'500@699'`, and `outside` is `'off'`.
  - `stepDays` ≤ P/16; `fitStep` gives ≈ P/8 on the fit grid.
  - Mimas P = 0.942 d, so its step is ≈ 0.0589 d.
- **Build, per moon:**
  1. Compute the ΔM target on the fit grid and unwrap it.
  2. Fit 1 channel to 300 km-equivalent (`stop = 300 / r`, with r = the row's semi-major axis
     in km).
  3. Compute the Cartesian residual on the fit grid, using kepler with M corrected by the shipped
     (rounded) ΔM series.
  4. Fit 3 channels to 900 km.
  5. Verify every raw row through the shipped values, with ΔM then position applied as at
     runtime. Throw above 1,000 km.
  6. Print terms per channel and the max km per moon.
- **`deriveBodyStates` 1b order:**
  1. `propagateElements`.
  2. If `meanAnomalyRad` evaluates, then
     `propagated = { ...propagated, meanAnomalyRad: propagated.meanAnomalyRad + ΔM }`.
  3. `focus + keplerianPositionMpc(propagated)`.
  4. Add `positionKm` × KM_TO_MPC.
  5. Subtract the pair reflex.
  6. `orbit = propagated`.
- **Expected result:** about 216 phase terms and 110 Cartesian terms, roughly 16 kB of source.
  Halt and report if the total exceeds 2× that, or if any moon fails verify.

**Steps:**
- [ ] Add the test `meanAnomalyCorrectionTarget recovers a known shift`. Take an eccentric
      (e = 0.2), inclined row. Build `horizonsKm` from the row with M + 0.7 rad, and expect 0.7 to
      1e-9. Repeat with −3.0 rad, to check the seed handles a near-half-orbit shift.
- [ ] Add the moon rows, then run `npm run fetch-horizons` (moons only; it takes a while, so run it
      in the background) and `npm run build-ephemeris-corrections`. Every body must pass verify.
- [ ] Wire ΔM into `deriveBodyStates`.
- [ ] Commit the code, the generated file and the docs:
      `feat(bodies): moons match Horizons (ΔM + residual corrections, 1900–2100)`.

### Task 5: Moon accuracy tests and re-recorded fixtures

**Files:**
- `tests/fixtures/horizonsMoons.json` (create, via a one-off fetch noted in the test header)
- `tests/data/bodies/ephemerisCorrections.test.ts` (extend)
- `tests/services/engine/frame/passes/orbitTrailsPass.test.ts` (extend)
- `tests/fixtures/bodyStatesJ2000.json` and the camera golden traces (re-record)

**Fixture:** 11 moons × 6 dates, parent-centred, UT. The dates are 1979-03-05 12:05 and
1979-07-09 22:29 (the Jupiter flybys), 1980-11-12 23:46 and 1981-08-26 03:24 (the Saturn flybys),
1900-06-01 and 2099-06-01.

**Steps:**
- [ ] Add the test `every moon is within 1,000 km of Horizons (parent-relative) on the fixture
      dates`. Compare `deriveBodyStates` moon − parent against the fixture. The tolerance is
      1,000 km plus the measured barycentre-vs-centre offset for that parent. Measure the offset
      first (≤ ~300 km expected) and state the constant with its reason in the test.
- [ ] Add the test `a moon past 2100 is raw Kepler`. At `endJd + 1`, Titan − Saturn equals
      `keplerianPositionMpc(propagateElements(titanRow, t))` to ≤ 1 m.
- [ ] Add the test `Mimas and Titan trails stay centred on Saturn at the Voyager 1 Saturn flyby`.
      Run the real states through `orbitTrailsPass` (pattern: `orbitTrailsPass.test.ts`, the
      snapshot-offset test). Check two things:
      - the packed ellipse centre, minus Saturn + `centerOffsetMpc(orbit)`, is ≤ 0.06 × the
        semi-major axis;
      - the body point at the orbit's E equals the body position to ≤ 1 m.
- [ ] Re-record `bodyStatesJ2000.json` and the golden traces (`SETTLE_GOLDEN_RECORD=1`,
      `DRIVER_GOLDEN_RECORD=1`) where moon positions moved. Run `npm test` and
      `npm run typecheck`.
- [ ] Commit `test(bodies): moon Horizons accuracy, trail centring, re-recorded fixtures`.

## Definition of Done

- [ ] **Deliverables:**
  - `CorrectionSeries` and the reshaped `EphemerisCorrection`
  - `correctionSeriesAt`
  - `EPHEMERIS_CORRECTIONS` with 8 planet rows (`'hold'`) and 11 moon rows (`'off'`, `meanAnomalyRad`
    plus `positionKm`)
  - `HORIZONS_BODIES`, `fetch-horizons` and `build-ephemeris-corrections`
  - `BodyState.orbit`
  - `satellite` `periodKind` and the signed apsis
- [ ] **Smoke (user, on the dev server):**
  - Set the clock to 1980-11-12 23:46 UT with Saturn focused. Titan is near Voyager 1's
    approach side, and every Saturn-moon trail is centred on Saturn.
  - Set 1979-03-05 at Jupiter. The Galilean trails are centred, and each moon sits on its trail.
  - Scrub across 2100: the moons jump once and keep orbiting, with no NaN or vanishing body.
  - Planets are unchanged.
- [ ] **Out of scope (deferred):**
  - Earth's Moon accuracy.
  - Uranus and Neptune moons (#838 adds rows later).
  - Edge taper.
  - Re-deriving the Saturn J2000 start angles.
  - The five-channel equinoctial alternative.
  - The Voyager mission-trails spec, which comes next.
