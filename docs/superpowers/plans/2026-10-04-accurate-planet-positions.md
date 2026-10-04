# Accurate planet positions — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development under the
> lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The eight planets match JPL DE (Horizons) to ≤ 1,000 km over 1900–2100, Earth wobbles about
the Earth–Moon barycentre, and every orbit trail stays through its body.

**Architecture:** Each planet's position is today's Keplerian position plus a generated correction
series: a cubic polynomial plus fitted sinusoids, about 17 kB of constants. The correction is
evaluated in `deriveBodyStates`. A one-row pair table subtracts the Moon's reflex from Earth. Orbit
trails anchor on the snapshot body position, so they follow both corrections without needing to know
about either.

**Tech stack:** TypeScript, Vitest, tsx tools, the JPL Horizons API.

**Spec:** `docs/superpowers/specs/2026-10-04-accurate-planet-positions-design.md`

## Global constraints

- Accuracy: ≤ **1,000 km** from Horizons for every planet over **1900-01-01 → 2100-01-01**. The fit
  stops at ≤ **900 km** on its sample grid, and the tool verifies every planet on the dense 1-day grid
  and throws above 1,000 km.
- Outside the span the correction is **frozen at its edge value**: clamp `simDays` to
  `[startJd, endJd]`. No fade and no new setting.
- Horizons query: `EPHEM_TYPE='VECTORS'`, `CENTER='500@10'` (Sun centre), `REF_PLANE='FRAME'`
  (equatorial ICRF), `TIME_TYPE='UT'`, `OUT_UNITS='KM-S'`, `CSV_FORMAT='YES'`, `VEC_TABLE='1'`.
  - Targets: Mercury `199`, Venus `299`, Earth–Moon barycentre `3`, then system barycentres `4`–`8`
    for Mars through Neptune.
  - Fetch 1-day steps in 50-year chunks, retrying each chunk up to 5 times.
- `OBLIQUITY_DEG = 23.4392911`.
- Earth–Moon pair: `secondaryMassFraction = 1 / 82.30057`, the Moon's share of the pair mass.
- `simDays` stays a UTC Julian date. No runtime TDB conversion: the UT query absorbs the offset.
- Conventions: one symbol per `utils/` and `@types/` file, `type` and never `interface`, and pass and
  frame files export only their one symbol.
- Prep (Tasks 1–2) is a **separate PR** on branch `accurate-planets-prep` off `main`. This spec and
  plan are committed there too. Features (Tasks 3–6) go on `accurate-planets`, stacked on the prep
  branch. Never commit on `main`.

## Review focus

1. **Dates outside 1900–2100** (a tour in 1850, a scrub to 2200). Positions stay finite and equal
   Kepler plus the frozen edge correction, with no jump at either boundary. Tests are in Task 3.
2. **A camera parked at an Earth surface site with the clock running.** The site keeps its offset from
   Earth while Earth wobbles. Tested in Task 6.
3. **Moon, Hubble and the easter eggs after the Earth reflex.** Each still sits on its own trail,
   because its trail is centred on the reflexed Earth. Tested in Task 6.
4. **Any element-row edit or frame change without regenerating.** The Horizons check fails loudly
   instead of drifting silently. Tested in Task 6.
5. **Chunk seams in the Horizons fetch.** The duplicated boundary row is dropped exactly once, with
   no gap and no duplicate. Tested in Task 4.

---

## PR 1: prep (`accurate-planets-prep`)

### Task 1: Orbit trails anchor on the snapshot body position (P1)

**Files:** `src/services/engine/frame/passes/orbitTrailsPass.ts:96-109` (modify),
`src/data/bodies/orbitalElements.ts:1-9` (header, modify),
`tests/services/engine/frame/passes/orbitTrailsPass.test.ts` (modify)

**Before → after** (`orbitTrailsPass.ts:105-109`):

```ts
// before: centre = focus + centerOffset   (focus re-read, conic re-derived: a mirror of deriveBodyStates)
// after:  centre = state.positionMpc − keplerianPositionMpc(propagated) + centerOffsetMpc
```

The body is now on its trail by construction: any later change to the snapshot position moves the
trail with it. Keep `meanAnomalyRad` as the fade anchor, unchanged.

- [ ] Add the test `trail follows a snapshot position that differs from raw Kepler`. Stub the states
      map so one row's `positionMpc` is the Kepler position plus a 1e6 km vector (converted with
      `SCALE_UNITS.KM_TO_MPC`). Read the packed eye-relative km basis (floats 34..45, written by
      `eyeRelativeOrbitBasisKm`): the body point `C + A·cosE + B·sinE` at the row's propagated E must
      equal the stubbed position, eye-relative in km, to ≤ 1 m. Use km tolerances throughout:
      1e-15 Mpc is 30,000 km.
- [ ] Run that test and confirm it fails against the current code.
- [ ] Implement the after-line. Rewrite the `orbitalElements.ts` header sentence about "a body sitting
      on its own trail is structural" so it names the snapshot anchoring.
- [ ] The comparisons against `keplerianEllipse` (`orbitTrailsPass.test.ts:345-378`, `:511-573`) were
      exact to 18–20 digits. Loosen them to `toBeCloseTo(…, 15)`, or the relative tolerance f64 can
      hold for `(a + b) − b`, and give the reason in one line.
- [ ] `npm test -- orbitTrailsPass`, then commit "Orbit trails anchor on the snapshot body position".

### Task 2: Exact obliquity (P2)

**Files:**
- `src/data/bodies/orbitPlaneFrames.ts:72` (and the header comments at `:25`, `:29`, `:77-78`)
- `src/utils/orbit/rotationLookAt.ts:19`
- `src/data/defaults.ts:138-141`
- `tests/data/bodies/orbitPlaneFrames.test.ts:50-53`
- `tests/data/orientation/orientationFrames.test.ts:54`
- `tests/utils/orbit/propagateElements.test.ts:94`
- `tests/services/engine/frame/earthTerminator.test.ts:17`
- `tests/fixtures/bodyStatesJ2000.json`
- `tests/fixtures/camera/settleGoldenTrace.json`
- `tests/fixtures/camera/driverGoldenTrace.json`
- `tools/perf/perfScenarios.ts:52`

Set `OBLIQUITY_DEG = 23.4392911` and say "IAU J2000 mean obliquity" in its comment. Comments that
say `23.44°` become `23.439°`. Test literals use the exact value; in `orientationFrames.test.ts:54`,
66.56° becomes `90 − 23.4392911`. No new test: this is a constant, and the existing frame tests pin it.

- [ ] Change the constant, comments and test literals.
- [ ] Regenerate `bodyStatesJ2000.json` with a one-off tsx snippet that is not committed. It
      serialises `deriveBodyStates(2451545.0)` for every `ORBITAL_ELEMENTS` id in the fixture's
      existing shape (`positionMpc`, `orientation`, `meanAnomalyRad`), leaves anchors out, and keeps
      the key order. Diff it: only rotated values may change.
- [ ] Re-record the camera traces with `SETTLE_GOLDEN_RECORD=1` and `DRIVER_GOLDEN_RECORD=1`
      (`npm test -- settleGoldenTrace driverGoldenTrace`). The spec rules this. Then run once more
      without the flags.
- [ ] Update `EARTH_TARGET` in `perfScenarios.ts:52` to the new J2000 Earth position, taken from the
      regenerated fixture.
- [ ] `npm run typecheck:fast`, then `npm test -- orbitPlaneFrames orientationFrames propagateElements earthTerminator deriveBodyStates`.
      Commit "Exact J2000 obliquity".

---

## PR 2: feature (`accurate-planets`, stacked on prep)

### Task 3: Correction type and evaluator

**Files:**
- `src/@types/scene/EphemerisCorrection.d.ts` (create)
- `src/utils/orbit/ephemerisCorrectionMpc.ts` (create)
- `tests/utils/orbit/ephemerisCorrectionMpc.test.ts` (create)

**Interfaces, produced:**

```ts
export type EphemerisCorrection = {
  startJd: number;
  endJd: number; // fitted span (UTC JD); outside it the edge value is held
  polyKm: readonly [Vec3, Vec3, Vec3, Vec3]; // coefficients of τ⁰..τ³, τ = 2(t − startJd)/(endJd − startJd) − 1
  terms: readonly number[]; // flat, 7 per term: ω (rad/day), cos x,y,z (km), sin x,y,z (km); phase ω·(t − startJd)
};
export function ephemerisCorrectionMpc(c: EphemerisCorrection, simDays: number): Vec3;
```

Sum in f64 km, then multiply by `SCALE_UNITS.KM_TO_MPC`.

- [ ] Test `evaluates polynomial and terms at a known instant`: a hand-built two-term correction,
      checked against values worked out by hand.
- [ ] Test `holds the edge value outside the span`: `simDays` 100 years before `startJd` returns
      exactly (`toEqual`) the value at `startJd`, and likewise at `endJd`.
- [ ] Test `is continuous across both span edges`: evaluations at edge ± 1e-6 day differ by < 1 m.
- [ ] Implement, `npm test -- ephemerisCorrectionMpc`, then commit "Ephemeris correction evaluator".

### Task 4: Horizons planet fetcher

**Files:**
- `tools/parsers/horizonsVectorsCsv.ts` (create)
- `tests/tools/parsers/horizonsVectorsCsv.test.ts` (create)
- `tools/fetch/fetchHorizonsPlanets.ts` (create)
- `tools/utils/io/rawDataRegistry.ts` (add `horizons.planets` and `horizons.planets.readme`, using the
  entry shape at `:17-25`)
- `data/raw/horizons/planets/README.md` (create, committed; it records the exact query in Global
  constraints)
- `package.json` (add `"fetch-horizons-planets": "tsx tools/fetch/fetchHorizonsPlanets.ts"`)
- `docs/DATA.md` (add a Horizons entry wherever the fetchers are listed)

**Interfaces, produced:**

```ts
export type HorizonsVectorRow = { jd: number; xKm: number; yKm: number; zKm: number };
export function parseHorizonsVectorsCsv(result: string): HorizonsVectorRow[]; // rows between $$SOE/$$EOE
```

The output goes to `data/raw/horizons/planets/<naif>.csv` with the columns `jd,x_km,y_km,z_km`,
written through `rawDataPath('horizons.planets')`. Chunks are concatenated and a row whose `jd` is ≤
the previous row's is dropped (Review focus 5).

- [ ] Test `parses the SOE/EOE block of a Horizons vectors result`: use a trimmed real response
      pasted as a string literal, three rows.
- [ ] Test `concatenating two chunks drops the shared boundary row once`, through a small exported
      merge step, or by asserting the fetcher's `mergeChunks` if you extract it. Keep it
      one-symbol-per-file if extracted.
- [ ] Implement the parser and the fetcher, which writes all eight CSVs. Announce the download size
      before running it: 8 × ~3 MB.
- [ ] Run `npm run fetch-horizons-planets`. Commit "Horizons planet fetcher", without the gitignored
      CSVs.

### Task 5: Fit tool and generated corrections · `review: yes`

**Files:**
- `tools/utils/math/fft.ts` (create)
- `tools/utils/math/fitSinusoidSeries.ts` (create)
- `tests/tools/utils/math/fft.test.ts` (create)
- `tests/tools/utils/math/fitSinusoidSeries.test.ts` (create)
- `tools/bodies/buildPlanetEphemeris.ts` (create, using the `tools/bodies/buildPlanetFacts.ts`
  template: banner, prettier, CLI guard)
- `src/data/bodies/planetEphemerisCorrections.generated.ts` (generated)
- `package.json` (add `"build-planet-ephemeris": "tsx tools/bodies/buildPlanetEphemeris.ts"`)

**Interfaces, produced:**

```ts
export function fft(re: Float64Array, im: Float64Array): void; // in-place radix-2, length a power of two
export type FitResult = { polyKm: [Vec3, Vec3, Vec3, Vec3]; terms: number[]; maxErrKm: number };
export function fitSinusoidSeries(tJd: Float64Array, residualKm: [Float64Array, Float64Array, Float64Array],
  startJd: number, endJd: number, stopKm: number, maxTerms: number): FitResult;
export const PLANET_EPHEMERIS_CORRECTIONS: Readonly<Record<string, EphemerisCorrection>>; // keys: planet ids
```

**Method.** The spike is `planetSeriesFit.mts` in the brainstorm scratchpad; it measured ~590 terms.
1. Fit the cubic in τ first.
2. Then loop:
   - take the FFT of the residual, zero-padded ×8, with power summed over x, y and z;
   - find the peak and refine it parabolically;
   - add a cos column and a sin column;
   - Gram–Schmidt each new column against the kept ones, which makes it an exact least-squares refit;
   - stop when the max 3D error is ≤ `stopKm`.
3. Recover the coefficients of the original basis from the orthogonal one. Keep R, or refit by normal
   equations once at the end, so the generated `terms` are plain (ω, cos, sin) amplitudes.
4. The tool computes the residual as `Horizons − keplerianPositionMpc(propagateElements(row, jd))`.
   It converts km with the same `MPC_TO_KM` the app uses, imports the `src/` modules directly, and
   uses the app's own element rows.

**Sample steps (days) for fitting:** Mercury 2, Venus 4, Earth 4, Mars 6, Jupiter through Neptune 10.
The tool then **verifies on every 1-day row** with `ephemerisCorrectionMpc` (from Task 3) and throws
if any planet exceeds 1,000 km. That way the shipped evaluator is exactly what gets verified.

- [ ] Test `fft finds a pure sinusoid's bin`: N = 64, a sinusoid in bin 5, and the power peaks at k = 5.
- [ ] Test `fitSinusoidSeries recovers a synthetic two-term signal`: a cubic plus two sinusoids at
      non-bin frequencies. With `stopKm` 1, it should use ≤ 4 terms, and evaluating the result through
      `ephemerisCorrectionMpc` reproduces the signal to ≤ 1 km.
- [ ] Implement, then run `npm run build-planet-ephemeris`. Report each planet's term count and
      verified max error; expect ~35–180 terms and a total of ~17 kB of numbers.
- [ ] Commit "Planet ephemeris fit tool + generated corrections".

### Task 6: Wire corrections and the Earth–Moon pair into `deriveBodyStates` · `review: yes`

**Files:**
- `src/@types/scene/BarycentricPair.d.ts` (create)
- `src/data/bodies/barycentricPairs.ts` (create)
- `src/services/engine/frame/deriveBodyStates.ts:60-68` (modify; the header gains one clause)
- `src/data/bodies/scenePlanets.ts:3` (fix the stale "via keplerianPositionMpc" header)
- `tests/fixtures/horizonsPlanets.json` (create)
- `tests/data/bodies/planetEphemeris.test.ts` (create)
- `tests/services/engine/frame/deriveBodyStates.test.ts` (modify)
- `tests/fixtures/bodyStatesJ2000.json`
- `tests/fixtures/camera/{settle,driver}GoldenTrace.json`
- `tools/perf/perfScenarios.ts:52`
- `docs/backlog/2026-08-16-barycentric-orbit-pairs.md`
- `docs/BACKLOG.md` (the "Barycentric orbit pairs" line)

**Interfaces:**

```ts
export type BarycentricPair = { primaryId: string; secondaryId: string; secondaryMassFraction: number };
export const BARYCENTRIC_PAIRS: readonly BarycentricPair[]; // [{ primaryId: 'earth', secondaryId: 'moon', secondaryMassFraction: 1 / 82.30057 }]
```

**1b loop, after this task:**
`position = focus + kepler(el) + correction(el.id) − k · kepler(propagate(secondaryRow))`.
- `correction` is `ephemerisCorrectionMpc(PLANET_EPHEMERIS_CORRECTIONS[el.id], simDays)` when a
  correction exists, and zero otherwise.
- The reflex term applies only when `el.id` is a pair's `primaryId`.
- The secondary row comes from `ORBITAL_ELEMENTS` and is propagated inline, because `FOCUS_ORDER`
  resolves `earth` before `moon`.
- Resolve pair and correction lookups into id-keyed maps at module load, beside `FOCUS_ORDER`, never
  per frame.

**Fixture.** `tests/fixtures/horizonsPlanets.json` uses the Global constraints query, except with
target `399` (Earth centre) for Earth.
- Dates: 1900-06-01, 1979-03-05, 1980-11-12, 1986-01-24, 1989-08-25 and 2099-06-01 (Voyager flybys
  plus both ends).
- Shape: `{ [id]: { [jd]: [xKm, yKm, zKm] } }`.
- The test header records the query URL.

- [ ] Test `every planet is within 1,000 km of Horizons at the fixture dates`, from `deriveBodyStates`
      positions. Earth is compared with Horizons `399` and gets its own tolerance: measure the max,
      round up to the next 500 km, and write the measured number in a one-line comment, since it
      includes the app Moon's error. This test is Review focus 4.
- [ ] Test `Earth–Moon reflex keeps the barycentre and the separation`. At three dates, with
      k = 1/82.30057, (1−k)·Earth + k·Moon equals the corrected EMB (Earth-row Kepler plus the
      correction) to ≤ 1 m. Moon − Earth equals the Moon's raw Kepler offset to ≤ 1 m.
- [ ] Test `an Earth surface site keeps its offset from the wobbling Earth` (Review focus 2): a site
      hosted on `earth` minus Earth's position is independent of the reflex. Compare with the site
      offset computed from `sitePointBodyFixed` and Earth's orientation.
- [ ] Test `Moon, Hubble and Saturn sit on their trails at a non-J2000 date` (Review focus 3): drive
      `orbitTrailsPass` packing at a 1989 date. Each body's position lies on its packed conic at its
      propagated E, to ≤ 1 m, reading the eye-relative km basis as Task 1's test does.
- [ ] Implement the pair table and the 1b term. Fix the `scenePlanets.ts:3` header.
- [ ] Regenerate `bodyStatesJ2000.json` with Task 2's one-off snippet. Re-record the golden traces
      with the record flags, then rerun without them. Update `EARTH_TARGET`.
- [ ] Backlog: in the detail file, add that `BARYCENTRIC_PAIRS` exists, so Pluto's wobble is one row,
      while the minor moons still need the invisible node. Update the BACKLOG line's clause to match.
- [ ] `npm run typecheck:fast`, then `npm test -- planetEphemeris deriveBodyStates orbitTrailsPass`.
      Commit "Accurate planet positions: corrections + Earth–Moon pair".

---

## Dispatch grouping (controller)

| PR | Dispatch | Tasks | Model |
|---|---|---|---|
| 1 | A, or inline (< 50 lines of source) | 1, 2 | Sonnet |
| 2 | B | 3, 4, 5 (the tool chain; Task 5 has `review: yes`) | Opus |
| 2 | C | 6 (`review: yes`) | Opus |

Ask at plan start: parallelism, and whether to run the perf gate. Recommended: no perf gate, because
the per-frame cost is about 590 sinusoids per new `simDays` and trails add nothing.

## Definition of done

**Deliverables:**
- `PLANET_EPHEMERIS_CORRECTIONS` (generated)
- `ephemerisCorrectionMpc`
- `BARYCENTRIC_PAIRS`
- `npm run fetch-horizons-planets` and `npm run build-planet-ephemeris`
- `OBLIQUITY_DEG = 23.4392911`
- trails anchored on the snapshot

**Manual smoke** (the user looks; the dev server stays running):
- The clock set to 1980-11-12: Saturn is where Horizons puts it, and the inspector's position
  matches JPL to within ~1,000 km.
- Zoom close to Saturn and Jupiter with time running fast: each stays on its trail.
- Park at Earth with a 1-day/s clock: the Earth–Moon wobble is visible against the trail, and the
  Moon stays on its trail.
- Set the clock to 1850 and to 2200: the planets are finite, there is no jump as the clock crosses
  1900 and 2100, and the trails are intact.

**Out of scope (deferral boundary):**
- moon accuracy
- the Pluto–Charon pair row and Pluto's minor moons
- spacecraft and Voyager (the mission-trails spec is next)
- runtime TDB conversion
- any margin in `orbitReachByRegion`
