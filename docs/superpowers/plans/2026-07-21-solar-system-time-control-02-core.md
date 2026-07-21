# Solar-system time control — core plan (02)

> **Spec.** `docs/superpowers/specs/2026-07-21-solar-system-time-control.md` (§2–§5, §7, §8, §11).
> **Grill.** `docs/grill-sessions/solar-system-time-control-2026-07-21.md` (Q1–Q13).
> **Scope.** The CORE engine feature: the sim clock (intent slice + derivation + wake +
> throttled status), the animated ephemeris (planet rates + moon epoch phases + rotation),
> the live-`t` body-state snapshot, the follow camera driver, orbit-trail re-derivation at `t`,
> and the clip-pause seam. URL `t=` and the TimeBar/InfoCard surface are the SEPARATE 03-surface
> plan and are out of scope here.
>
> **Precondition — 01-prep MUST have landed.** This plan assumes Prep A (BodyDef/BodyState split:
> `BodyState` type + `deriveBodyStates(simDays)` evaluated at a fixed `CONST_J2000` epoch, all ~34
> consumers repointed to the per-frame snapshot stashed on `EngineState` **before** the camera
> produce step; `sceneOrbitConics` moon-trail centers made per-frame-capable; `orbitTrailsLayer`'s
> `MAX_ORBIT_EXTENT_MPC` bounded from max apoapsis) and Prep B (`useUrlSync` multi-param seam) are
> both merged. If `deriveBodyStates` does not yet exist, stop — this plan has nothing to point at.
>
> **Delivery.** ONE PR (**#472**), ordered commits, opened as a **draft at the first landed task**.
> Executed via `subagent-driven-development` — a fresh implementer subagent per task, spec + quality
> review between tasks. Contract code only in this plan (types, test names, tables); implementers
> read the current files and write the bodies (see `plan-style.md`). Tests follow `testing.md` —
> behavior over restatements; NO rate-ladder table restatements, NO clamp-boundary tests, NO mirror
> tests (never build the expected value with the source's own formula).
>
> **Two deferred [USER VISUAL GATE] items (user AFK).** Flagged inline at Task 5 (moon epoch-phase
> relocation confirm) and Task 6 (live-now Earth sub-solar-longitude alignment). Both land in code
> behind the gate; the visual confirmation is a later dev-server pass, same gate style as the
> shipped conic-trails body relocation.

---

## Architecture at a glance (read before Task 1)

Three seams carry the feature; keep them un-braided:

1. **Intent (`state/time/`)** — user decisions only: `{ mode, anchor, rateIndex, direction, paused }`.
   No wall-clock ticks in the store. Every intent action **re-anchors** (§2).
2. **Derivation (pure, `src/utils/time/deriveSimDays.ts`)** — `deriveSimDays(time, nowMs): number`
   is a pure function of intent + a passed `nowMs`. It is imported by BOTH the slice reducers (to
   re-anchor) and `runFrame` (per-frame). **There is no stateful `simClock` resource** — unlike
   `cameraClock`, the anchor lives in the store, so there is nothing mutable to track frame-to-frame.
   This is a deliberate simplification of the spec's "simClock.ts mirrors cameraClock" wording:
   the *pure* half is all that's needed; placing it in `utils/time/` (not `services/engine/`) keeps
   `state/` → `utils/` layering clean (a reducer must not import `services/engine`). Flagged for the
   Task 14 entanglement-radar pass to confirm.
3. **Snapshot (`deriveBodyStates(simDays)`, Prep A)** — the single per-frame instant every consumer
   reads. This plan's whole ephemeris change is: make the argument the frame's live `simDays` and
   teach the derive to propagate elements + rotation to `t`.

Sim time is **float64 Julian Date** (JD; carries Gyr magnitudes per Q4). `nowMs` is
`performance.now()`-shaped (same value `runFrame` already threads). The live anchor pairs a wall-clock
JD with a `performance.now()` stamp — see Task 3.

---

## Task 1 — Time intent: `TimeState` type + rate ladder table

**Files:** `src/@types/time/TimeState.d.ts` (new), `src/data/time/rateLadder.ts` (new),
`src/@types/time/RateLadderStep.d.ts` (new), `tests/data/time/rateLadder.test.ts` (new).

**One type per file** (`@types` convention). `TimeState` (from spec §2):

```ts
// src/@types/time/TimeState.d.ts
export type TimeState = {
  readonly mode: 'live' | 'manual';
  /** The (simDays JD at realMs) pairing from which playback integrates. */
  readonly anchor: { readonly simDays: number; readonly realMs: number };
  readonly rateIndex: number; // index into RATE_LADDER
  readonly direction: 1 | -1;
  readonly paused: boolean;
};
```

```ts
// src/@types/time/RateLadderStep.d.ts
export type RateLadderStep = {
  readonly label: string;          // e.g. '1 day/s'
  readonly simSecPerRealSec: number; // e.g. 86_400
};
```

`RATE_LADDER: readonly RateLadderStep[]` — the eight unsigned steps from Q4, ascending:
`1 s/s (1) · 1 min/s (60) · 1 hr/s (3 600) · 1 day/s (86 400) · 1 wk/s (604 800) ·
1 mo/s (2 629 800, Julian month = 365.25/12 d) · 1 yr/s (31 557 600, Julian year) · 10 yr/s`.
Sign is `direction`, not a ladder entry; pause is `TimeState.paused`, not a ladder entry.
Galactic steps (`1 Myr/s`, `1 Gyr/s`) append later — the table is the extension point.

- [ ] Test `each RATE_LADDER step is strictly faster than its predecessor` — assert monotone
      increasing `simSecPerRealSec` (a structural invariant that catches a transcription swap;
      NOT a value restatement — do not assert the literal seconds).
- [ ] Test `every RATE_LADDER label is non-empty and unique`.
- [ ] `npm run typecheck`; commit.

---

## Task 2 — Time intent: the `state/time/` slice, selectors, and store wiring

**Files:** `src/state/time/timeSlice.ts` (new), `src/state/time/selectors.ts` (new),
`src/store/constants.ts` (add `timeRoute = 'time'`), `src/store/rootReducer.ts` (mount),
`tests/state/time/timeSlice.test.ts` (new).

**Re-anchor discipline is THE contract (spec §2, Q5).** Every intent action re-anchors: it captures
`deriveSimDays(currentState, action.payload.nowMs)` as the new `anchor.simDays` with
`anchor.realMs = nowMs`, THEN applies its change. Because the reducer must call `deriveSimDays`, the
slice imports the pure util from Task 3 (`src/utils/time/deriveSimDays.ts`) — a clean `state/` → `utils/`
import. Reducer arg names are `time` / `action` (domain-appropriate; never `s` / `a`).

Action creators (all payloads carry `nowMs`; the caller passes `performance.now()`):

```ts
setRate({ rateIndex: number, nowMs: number })          // manual mode; re-anchor, set rateIndex
setDirection({ direction: 1 | -1, nowMs: number })     // manual mode; re-anchor, set direction
pause({ nowMs: number })                               // re-anchor, paused = true
resume({ nowMs: number })                              // re-anchor, paused = false (mode unchanged)
setSimDays({ simDays: number, nowMs: number })         // manual mode; anchor = { simDays, realMs: nowMs }
goLive({ simDays: number, nowMs: number })             // live mode; anchor = { simDays, realMs: nowMs }, paused = false, direction = 1
```

- `setRate` / `setDirection` / `pause` / `resume` re-anchor from the CURRENT derived simDays so
  playback is continuous across the change (no jump). `setSimDays` / `goLive` set the anchor to an
  externally-supplied simDays (a scrub target or the wall-clock JD) — they still overwrite the anchor,
  which is the re-anchor for a scrub.
- `goLive.simDays` is the wall-clock JD the caller captures (`unixMsToJulianDays(Date.now())`, Task 3);
  live derivation then advances it at rate 1 from `realMs`.
- **Initial state:** live mode. The static `initialState` may seed `anchor` at the J2000 epoch
  (`simDays = 2451545.0`, `realMs = 0`); the engine dispatches one `goLive({ simDays: unixMsToJulianDays(Date.now()), nowMs })`
  at bootstrap so "the map is always true on load" (Q3). (The bootstrap `goLive` dispatch is wired in
  Task 8's runFrame/engine touchpoint — keep it a single well-commented line.)

Selectors: `selectTimeState`, `selectRateStep` (`RATE_LADDER[time.rateIndex]`),
`selectIsManualPlaying` (`mode === 'manual' && !paused`) — the last is read by the wake predicate (Task 9).

- [ ] Test `every intent action leaves derived simDays continuous across the action boundary` —
      the re-anchor discipline pin. For a fixed `nowMs`, build a `TimeState`, compute
      `before = deriveSimDays(state, nowMs)`, apply the reducer with that `nowMs`, compute
      `after = deriveSimDays(nextState, nowMs)`, assert `after ≈ before` (float tolerance). Parameterise
      over `setRate`, `setDirection`, `pause`, `resume` from BOTH a live and a manual starting state.
      (This is the single most important test in the plan — a reducer that forgets to re-anchor jumps time.)
- [ ] Test `pause then resume at a later nowMs does not advance simDays while paused` — pause at `t0`,
      derive at `t1 > t0` (constant), resume at `t1`, derive at `t2 > t1` advances from the paused value.
- [ ] `npm run typecheck && npm test -- time` green; commit.

---

## Task 3 — The pure clock: `deriveSimDays` + JD conversion

**Files:** `src/utils/time/deriveSimDays.ts` (new), `src/utils/time/unixMsToJulianDays.ts` (new),
`tests/utils/time/deriveSimDays.test.ts` (new), `tests/utils/time/unixMsToJulianDays.test.ts` (new).

**One function per file** (`utils` convention). Signatures:

```ts
// src/utils/time/deriveSimDays.ts
export function deriveSimDays(time: TimeState, nowMs: number): number;
// paused  ⇒ anchor.simDays (constant)
// live    ⇒ anchor.simDays + (nowMs − anchor.realMs)/86_400_000   (rate 1, real-time forward)
// manual  ⇒ anchor.simDays + RATE_LADDER[rateIndex].simSecPerRealSec · direction · (nowMs − anchor.realMs)/86_400_000
```

```ts
// src/utils/time/unixMsToJulianDays.ts
export function unixMsToJulianDays(unixMs: number): number; // unixMs/86_400_000 + 2_440_587.5
```

- [ ] Test `paused derivation is constant across nowMs` — paused state, two different `nowMs`, equal.
- [ ] Test `live derivation advances one day per 86_400_000 ms` — hand-computed: `Δ = 86_400_000 ms`
      ⇒ `simDays` increases by exactly 1.
- [ ] Test `manual derivation slope is simSecPerRealSec·direction` — pick the `1 hr/s` step, a
      hand-computed `nowMs` delta, assert the simDays delta equals `3600·ΔrealSec/86400` days; repeat
      with `direction = -1` and assert simDays DECREASES (reverse works).
- [ ] Test `unixMsToJulianDays maps the J2000 epoch instant` — hand-computed: unix ms for
      2000-01-01T12:00:00Z → `2_451_545.0` (independent of the source formula: compute the ms literal
      yourself, assert the JD).
- [ ] `npm test -- deriveSimDays unixMsToJulianDays` green; commit.

---

## Task 4 — Ephemeris: planet element rates + unified linear propagation

**Files:** `src/@types/scene/OrbitalElements.d.ts` (grow), `src/data/bodies/orbitalElements.ts`
(add rate columns to the 8 planet rows + the Moon), `src/utils/orbit/propagateElements.ts` (new),
`tests/utils/orbit/propagateElements.test.ts` (new).

**Approach — one linear propagation path for ALL bodies (planets AND moons).** Rather than a
planet-vs-moon branch in the propagator (a 2-way discriminant that would go 3-way the moment a comet
or a galactic body appears — the un-braid trigger in `simplicity.md`), every animated row carries the
SAME six per-century rate fields, and `propagateElements` is a single affine map. Task 5's satellite
maker converts JPL's period/precession columns INTO these same rate fields, so the propagator never
learns "moon". Flag this unification for the Task 14 radar.

Grow `OrbitalElements` with six **optional** rate fields (optional so a static body — no rates —
propagates to itself):

```ts
readonly semiMajorRateMpcPerCty?: number;      // da/dt   (Mpc per Julian century)
readonly eccentricityRatePerCty?: number;      // de/dt
readonly inclinationRateRadPerCty?: number;    // di/dt   (rad/cy)
readonly ascendingNodeRateRadPerCty?: number;  // dΩ/dt   (rad/cy)
readonly argPeriapsisRateRadPerCty?: number;   // dω/dt = dϖ/dt − dΩ/dt   (rad/cy)
readonly meanAnomalyRateRadPerCty?: number;    // dM/dt = dL/dt − dϖ/dt    (rad/cy)  — the fast mean-motion term
```

```ts
// src/utils/orbit/propagateElements.ts
export function propagateElements(elements: OrbitalElements, simDays: number): OrbitalElements;
// T = (simDays − 2_451_545.0) / 36_525   (Julian centuries since J2000)
// returns a new OrbitalElements with each classical field advanced by its rate·T
// (fields with no rate pass through unchanged); id / parentId / plane / color carry over.
```

**Provenance discipline (JPL SSD "Approximate Positions of the Major Planets", Table 1).** The
implementer transcribing the rates MUST take them from the JPL page and record the raw `dL/dt`,
`dϖ/dt`, `dΩ/dt`, `da/dt`, `de/dt`, `di/dt` values in the row comments, then show the derivation
`dM/dt = dL/dt − dϖ/dt` and `dω/dt = dϖ/dt − dΩ/dt` inline (extending the existing epoch comments,
which already show `ω = ϖ − Ω`, `M = L − ϖ` — see `orbitalElements.ts:107-121`). The Earth and Jupiter
rate columns are already recorded for provenance in the shipped conic-trails spec §7
(`docs/superpowers/specs/completed/2026-07-11-conic-orbit-trails.md:346-390`) — use them to
cross-check units (°/cy, au/cy). Convert °→rad and au→Mpc at the seed site via `degToRad` / `SCALE_UNITS`,
same authoring discipline as the epoch columns. Update the `OrbitalElements` module header
(`OrbitalElements.d.ts:5-9`) and `orbitalElements.ts:36-39` — the "rates deliberately omitted / static
epoch" paragraphs are now false; rewrite them (timeless comment style, no history note).

- [ ] Test `propagateElements at T=0 returns the epoch elements` — `simDays = 2_451_545.0` ⇒ every
      classical field equals the input (a genuine fixed point, not a restatement).
- [ ] Test `Earth mean anomaly advances ~one revolution per year` — propagate Earth by
      `Δ = 365.25` days, assert `M` increased by ≈ `2π` (independent property: Earth's orbital period;
      hand-reasoned, not the source's rate constant).
- [ ] Test `propagate +Δ then −Δ ≈ identity` — propagate to `T+Δ`, then a second `propagateElements`
      is not composable (it's absolute in `simDays`), so instead assert
      `propagate(el, J2000+Δd)` and `propagate(el, J2000−Δd)` are symmetric about the epoch value for
      the linear fields (e.g. `M(+Δ) − M₀ ≈ M₀ − M(−Δ)`).
- [ ] Test `Earth heliocentric position at a known date matches a JPL Horizons reference` —
      one hand-checked Horizons state vector (or heliocentric ecliptic lon/lat + range) for Earth at ONE
      date in 1800–2050, converted to the scene frame, arcminute-class tolerance. Feed
      `keplerianPositionMpc(propagateElements(earth, jd))`. (Record the Horizons query + date in the
      test comment — it is the external contract, per `testing.md` keep-rules.)
- [ ] `npm test -- propagateElements` green; commit.

---

## Task 5 — Ephemeris: moon epoch phases + period/precession columns

**Files:** `src/data/bodies/makers/satellite.ts` (grow the spec + emit rate fields),
`src/data/bodies/orbitalElements.ts` (fill real epoch phases + periods for the 13 non-Moon moons),
`tests/data/bodies/satellite.test.ts` (new or grow).

> **[USER VISUAL GATE — deferred, user AFK]: moon epoch-phase relocation confirm.** Filling real
> `Ω/ω/M` epoch phases (today all placeholder `0` — `satellite.ts:38-42`) **relocates every moon to its
> true J2000 position**, a real visible change (the Galilean line-up moves). Land it behind this gate;
> a later dev-server pass confirms the moons sit where JPL says at live-now. Same gate style as the
> conic-trails body relocation.

Grow the `satellite()` spec (`satellite.ts:24-32`) with the epoch phases + the three period columns,
all from JPL SSD "Planetary Satellite Mean Orbital Parameters" (https://ssd.jpl.nasa.gov/sats/elem/,
verified live 2026-07-21 to carry these for all 14 moons in the Laplace-plane frames our table
already uses):

```ts
satellite(spec: {
  id; parentId; plane; semiMajorKm; eccentricity; inclinationDeg; color;   // existing
  ascendingNodeDeg: number;      // Ω at epoch
  argPeriapsisDeg: number;       // ω at epoch
  meanAnomalyDeg: number;        // M at epoch
  periodDays: number;            // sidereal period P
  apsidalPrecessionYears: number; // Papsis (ω drift)
  nodalPrecessionYears: number;   // Pnode (Ω drift)
}): OrbitalElements
```

The maker converts periods → the SAME per-century rate fields Task 4 defined, so propagation stays one
linear path:

```
meanAnomalyRateRadPerCty  = 2π · 36_525 / periodDays
argPeriapsisRateRadPerCty = +2π · 100 / apsidalPrecessionYears   // prograde: apsis ADVANCES
ascendingNodeRateRadPerCty = −2π · 100 / nodalPrecessionYears    // prograde: node REGRESSES
// a / e / i rates = 0 (mean elements; drift negligible over 1800–2050)
```

**Sign verification is per-body and load-bearing** (spec §3): a retrograde or unusual moon flips a
sign. The implementer MUST verify each moon's precession direction against JPL and record the verified
sign in the row comment. **Fetch the JPL page and record every transcribed value + its provenance in a
comment** — do not transcribe from memory.

- [ ] Test `Io mean-motion rate corresponds to its ~1.769 day period` — from Io's own `periodDays`
      column, assert `meanAnomalyRateRadPerCty` implies a period of ≈ 1.769 d (independent: turns per
      century = `36_525/period`; hand-check the period, not the rate constant).
- [ ] Test `a Galilean moon position matches a JPL Horizons reference at one date` — one moon
      (e.g. Io), one date, hand-checked Horizons Jupiter-relative position, arcminute-class tolerance.
      Feed `keplerianPositionMpc(propagateElements(io, jd))` + Jupiter's propagated world position.
- [ ] Test `propagate a moon +Δ then −Δ is symmetric about the epoch` — as Task 4, for a moon.
- [ ] NO test restating the epoch `Ω/ω/M` or period literals back at the table.
- [ ] `npm test -- satellite` green; commit.

---

## Task 6 — Rotation: restore `W(t) = W₀ + Ẇ·d`

**Files:** `src/@types/scene/RotationElements.d.ts` (grow), `src/data/bodies/rotationElements.ts`
(add `Ẇ` per row + rewrite the "static epoch" header), `src/data/bodies/orientationForBody.ts`
(`orientationForBody(id, simDays)`), `src/utils/orbit/rotationFromIau.ts` (accept a per-time `W`),
`tests/data/bodies/orientationForBody.test.ts` (grow).

Grow `RotationElements` with `readonly spinRateDegPerDay: number` (Ẇ). The 13 textured rows already
record Ẇ in their comments (e.g. Earth `W = 190.147 + 360.9856235·d` — `rotationElements.ts:71`);
promote each commented Ẇ into the field. `orientationForBody(id, simDays)` computes
`W = W₀ + Ẇ·(simDays − 2_451_545.0)` and threads it into `rotationFromIau` (which today bakes from
`primeMeridianDeg` alone — grow it to take a resolved `W` or add the spin before assembling the matrix).
Evaluated inside `deriveBodyStates` (Task 7). Rewrite the `rotationElements.ts:15-22` "static epoch /
Ẇ dropped" paragraph — it is now the live path. (The T-dependent pole terms `α̇/δ̇` stay dropped:
sub-arcminute over 250 yr; note this in the header so it reads as a deliberate omission, not a miss.)

> **[USER VISUAL GATE — deferred, user AFK]: live-now Earth sub-solar-longitude alignment.** At 1×
> live, Earth's texture longitude must line up with the real sub-solar point (the terminator honest).
> A correctness check for the later dev-server pass; land the code behind the gate.

- [ ] Test `Earth prime meridian advances ~360° per sidereal day` — `orientationForBody('earth', jd)`
      vs `orientationForBody('earth', jd + 0.99727)` (sidereal day) differ by ≈ one full rotation about
      the pole (independent property: a sidereal day is one rotation; compare the rotated equinox vector,
      not the raw W formula).
- [ ] Test `a non-textured body is orientation-invariant in simDays` — `orientationForBody('titan', jd)`
      equals identity for any `jd` (Titan carries no rotation row — `rotationElements.ts` set).
- [ ] `npm test -- orientationForBody` green; commit.

---

## Task 7 — Snapshot: `deriveBodyStates(simDays)` propagates to `t` + memoizes

**Files:** `src/services/engine/frame/deriveBodyStates.ts` (Prep A — modify),
`tests/services/engine/frame/deriveBodyStates.test.ts` (grow).

Prep A's `deriveBodyStates(simDays)` already computes the snapshot Map at a fixed epoch and orders
planets-before-moons (one parent hop). This task makes it TIME-VARYING and memoized:

- Each body's position: `keplerianPositionMpc(propagateElements(elements, simDays))` + parent world
  (planets: render origin; moons: the parent's already-derived snapshot position — the existing
  planets-first ordering makes this a single hop).
- `orientation`: `orientationForBody(id, simDays)` (Task 6).
- `meanAnomalyRad` on `BodyState`: the PROPAGATED `M` (from `propagateElements(...).meanAnomalyRad`) —
  this is the orbit-trail falloff anchor (Task 11), so it must be the value at `t`, not epoch.
- **Memoize on `simDays`:** cache the last `(simDays → Map)` result and return it when `simDays` is
  unchanged (paused ⇒ free; the value is bit-identical frame-to-frame). ~22 Kepler solves, µs-scale
  when the cache misses.

- [ ] Test `deriveBodyStates is memoized on simDays` — two calls with the same `simDays` return the
      SAME Map reference; a different `simDays` returns a different reference. (Guards the paused-frame
      free-ride and the "one instant per frame" contract.)
- [ ] Test `a moon's snapshot position rides its propagated parent` — at a `simDays` where Jupiter has
      moved off epoch, Io's snapshot position minus Jupiter's snapshot position equals Io's
      Jupiter-relative propagated position (no draw-vs-pick tearing; the parent hop uses the snapshot,
      not a re-derive).
- [ ] `npm test -- deriveBodyStates` green; commit.

---

## Task 8 — runFrame: derive `simDays` once per frame, feed the snapshot + bootstrap `goLive`

**Files:** `src/services/engine/frame/runFrame.ts` (modify), the engine bootstrap dispatch site
(`engine.ts` / `startLoop.ts` — wherever the first frame's store is first available),
`tests/services/engine/frame/runFrame.test.ts` (grow if a frame-body test exists).

- Right after `clipPlayer.tick(nowMs)` (`runFrame.ts:100`) and BEFORE the camera produce step
  (`runFrame.ts:167`), read the time intent from the store and compute
  `const simDays = deriveSimDays(rootState.time, nowMs)`. (Note `rootState` is currently read at
  `runFrame.ts:151`, just below clipPlayer.tick — hoist the `getState()` or add an early read so
  `simDays` is available before produce.)
- Replace the Prep A `deriveBodyStates(CONST_J2000)` call site with `deriveBodyStates(simDays)` and
  stash the result where the follow driver (Task 12) and the trail layer (Task 11) read it — the SAME
  stash Prep A already established for its snapshot consumers (it is populated before camera produce so
  `earthSurfaceFraming`/`earthFlyout` could read it). Thread `simDays` onto `ctx` (via
  `deriveFrameContext`) so the trail layer and any InfoCard-bound producers see the frame's instant.
- **Bootstrap `goLive`:** dispatch `goLive({ simDays: unixMsToJulianDays(Date.now()), nowMs })` exactly
  ONCE at engine startup so a bare load is live-now (Q3). A one-shot guard (a boolean ref, or gate on
  the initial J2000 sentinel anchor) prevents re-dispatch every frame. Keep it one commented line.

- [ ] Test `runFrame derives simDays before the camera produce step` — with a manual-playing time
      state and a stub follow driver reading the stash, the driver sees the frame's `simDays`-derived
      body position (i.e. the snapshot is populated before `runCameraDrivers`). (If the existing
      runFrame test harness can't reach this, assert the ordering via the stash being non-null at the
      driver's `pose` call.)
- [ ] Manual verification note (no test): confirm `npm run perf` before/after shows the snapshot derive
      is µs-scale (spec §8 perf note) — the implementer records the two numbers in the PR description,
      not a committed test.
- [ ] `npm run typecheck && npm test -- runFrame` green; commit.

---

## Task 8b — Live-position stragglers (prep's deliberate J2000 binds)

**Files:** `src/services/engine/presentation/sceneBodyLabels.ts` (+ the caption pipeline it feeds),
`src/services/engine/wiring/assetWiring.ts` (`bodyPosOf`), `src/data/animation/clips/earthFlyout.ts`
(+ its caller), the `earthSurfaceFraming` saga caller, and their tests.

01-prep deliberately left four consumers bound to J2000-derived positions (its zero-change
constraint — see 01-prep A5/A10). Once Task 8 makes the snapshot live, each must track sim time or it
points at where a body USED to be:

- **`sceneBodyLabels` captions** — built construction-time static in prep. Make the Earth+planet
  caption positions follow the frame snapshot: study the caption/label pipeline first (how world
  positions reach the MSDF layer), then re-derive on `simDays` change only (a handful of captions;
  not per-frame churn while paused). Star captions stay static.
- **`assetWiring.bodyPosOf`** — texture load-radius gating must gate on the body's LIVE position
  (a J2000 gate loads textures for empty space at live-now). Repoint to the live snapshot.
- **`earthFlyout`** — the clip target must be Earth's position at clip start (the clip player froze
  `simDays` — Task 13); read the snapshot at that instant, not a J2000 re-derive.
- **`earthSurfaceFraming` caller** — 01-prep A10 made the signature take a position; flip the saga
  caller from the J2000 value to the live snapshot state.

- [ ] Test `a body caption position tracks the snapshot when simDays changes` — targeted at the
      label-position source, not pixel output.
- [ ] Test `bodyPosOf reflects the live snapshot position` — fixture at a non-J2000 `simDays`.
- [ ] Test `earthFlyout targets the frozen-clock Earth` — clip built with the clock at a
      non-J2000 instant targets that instant's Earth position.
- [ ] `npm run typecheck` + targeted suites green; commit.

---

## Task 9 — Render wake: manual-playing disjunct + live idle tick

**Files:** `src/services/engine/helpers/shouldKeepTicking.ts` (modify),
`tests/services/engine/helpers/shouldKeepTicking.test.ts` (grow), plus the live idle-tick wiring
(study the scheduler first — see below).

Spec §8, Q11. Two behaviors:

1. **Manual, playing ⇒ keep ticking.** Add one disjunct to `shouldKeepTicking` (`shouldKeepTicking.ts:65`):
   `selectIsManualPlaying(s)` (Task 2 selector). This joins the existing `||` chain — same idiom as the
   flow-layer disjunct. Manual + playing = continuous render (the point of playback).
2. **Live 1× ⇒ slow idle tick, NOT the wake set.** Nothing perceptible changes per live frame, so live
   must NOT keep the loop at 60 fps. Instead it requests ~one frame per few seconds so the terminator
   stays honest. **Study how the scheduler requests frames before designing this** — read
   `renderScheduler.ts` and how `requestRender()` / the rAF loop tail in `runFrame` re-schedule
   (`runFrame.ts:439`). Do NOT add a `setInterval` that fights render-on-demand; prefer a scheduler
   affordance (e.g. a "request a frame after N ms" idle timer the live branch arms, cancelled when the
   loop is already busy). The React TimeBar readout ticks on its own timer regardless (surface plan) —
   the idle tick is only for the scene terminator, so a coarse cadence (~2–4 s) is correct.

- [ ] Test `shouldKeepTicking is true when manual and playing` — manual, `!paused` ⇒ true even when
      every other term is false (mirror the flow-layer test shape).
- [ ] Test `shouldKeepTicking is false at live 1× with the scene at rest` — live, not paused, no camera
      motion / fades / in-flight work ⇒ false (live must not pin the loop; the idle tick is the separate
      path, not this predicate).
- [ ] `npm test -- shouldKeepTicking` green; commit. (The idle-tick cadence itself is a dev-server
      observation, not a unit test — note it in the PR.)

---

## Task 10 — Throttled status publication to React

**Files:** `src/utils/throttle/throttleByTime.ts` (new — search first, see below),
`src/state/engine/engineSlice.ts` (add a dedup-on-write time field),
`tests/utils/throttle/throttleByTime.test.ts` (new), `tests/state/engine/engineSlice.test.ts` (grow).

**Search before writing the helper.** Grep `src/utils/` for an existing throttle/rate-limit helper and
REUSE it if one exists (the spec's search-before-writing check said none exists as of 2026-07-21 —
re-confirm). If genuinely absent, add a minimal pure/closure helper:

```ts
// src/utils/throttle/throttleByTime.ts  (one function per file)
export function throttleByTime(minIntervalMs: number): (nowMs: number) => boolean;
// returns a stateful gate: true at most once per minIntervalMs, keyed on the nowMs passed in
// (never reads the wall clock itself — same discipline as the camera clock).
```

The published derived `simDays` is engine-REPORTED observable state (like `engine.scale`), NOT user
intent — so it lands on `engineSlice`, not the `time` intent slice (keeps intent vs observed
un-braided). Add `engineTimeReported(simDays)` with the **dedup-on-write** guard (`engineSlice.ts:95-102`
is the exact pattern): assign only when the published `simDays` changed. In `runFrame`, gate the
dispatch behind a `throttleByTime(~250 ms)` instance so React updates a few Hz, never per-frame. The
TimeBar readout and InfoCard live rows (03-surface) subscribe to this; mode/rate label come from the
`time` intent slice selectors directly.

**03-surface dependency (decide here, not there):** the InfoCard live-distance row (03-surface Task 6)
needs the FOCUSED body's snapshot-derived distance on this publication — a presentational card cannot
read the engine snapshot (store-boundary rule). Publish it alongside `simDays` in the same throttled
dedup dispatch (e.g. `focusedBodyDistanceMpc: number | null`, derived from the frame snapshot when the
focus is a scene body); null when no body focus. Keep it one payload, one throttle gate.

- [ ] Test `throttleByTime gates to at most once per interval` — hand-driven `nowMs` sequence:
      `t=0` true, `t=100` false, `t=250` true (for a 250 ms interval). Independent of any clock.
- [ ] Test `engineTimeReported dedups an unchanged simDays` — dispatch the same `simDays` twice, assert
      the slice reference is unchanged on the second (the `engineScaleChanged` dedup pattern; a real
      re-render guard, not a restatement).
- [ ] `npm test -- throttleByTime engineSlice` green; commit.

---

## Task 11 — Orbit trails re-derive at `t`

**Files:** `src/services/engine/frame/passes/orbitTrailsLayer.ts` (modify),
`src/data/bodies/sceneOrbitConics.ts` (Prep A made moon centers per-frame-capable — convert to a
per-frame builder or delete the static table), `tests/services/engine/frame/orbitTrailsLayer.test.ts`
(grow if present).

Today `orbitTrailsLayer` packs the STATIC `SCENE_ORBIT_CONICS` table (built once from J2000 elements —
`orbitTrailsLayer.ts:138-139`). Make each conic re-derive from the frame's `simDays`:

- Per orbit: `keplerianEllipse(propagateElements(elements, ctx.simDays))` gives the three focus-relative
  conic vectors at `t`; the absolute centre is `parentWorld + centerOffsetMpc`, where `parentWorld` is
  the parent's snapshot position (heliocentric ⇒ render origin; a moon ⇒ its parent's `BodyState`
  position from the frame snapshot — spec §4). The falloff anchor is the **propagated** `meanAnomalyRad`
  (`snapshot.meanAnomalyRad`, Task 7), not the epoch value.
- Keep the per-orbit apparent-size cull/fade and the f64 `composeOrbitConic` seam
  (`orbitTrailsLayer.ts:160`) unchanged — only the source of `centerMpc` / `semiMajorMpc` /
  `semiMinorMpc` / `meanAnomalyRad` moves from the static table to the per-frame derivation. The
  Prep-A `MAX_ORBIT_EXTENT_MPC`-from-apoapsis bound is time-invariant, so the `enabled` gate is untouched.
- The conic vectors change slowly; still derive them every drawn frame (the derivation is cheap and the
  layer only draws inside the near-field gate). No new allocation in the hot loop — reuse the existing
  `staging` buffer; if a per-frame conic scratch is needed, hoist it to a module-level reused array.
- No `.wesl` change is expected (the fragment already reads `meanAnomalyRad` per instance). If a shader
  edit DOES prove necessary, follow the `wesl-shaders` skill — **no backticks in WESL comments** (parse
  error), read `input.pos` from the struct (duplicate `@builtin(position)` fails only at runtime).

- [ ] Test `a moon trail centre rides its propagated parent` — at a `simDays` where the parent has
      moved, the derived Moon conic centre equals Earth's snapshot position + the focus-relative offset
      (not the J2000 centre). Reuse the snapshot from Task 7; do not re-derive with the layer's own math
      (no mirror).
- [ ] `npm run typecheck && npm test -- orbitTrails` green; commit.

---

## Task 12 — Camera follow driver

**Files:** `src/services/engine/camera/cameraDrivers.ts` (add the `followBody` row + its elapsed arm),
`src/@types/engine/state/CameraRuntime.d.ts` + `src/services/engine/camera/cameraClock.ts` (a follow
ease-timer resource — see below), `src/state/selection/watchFocusTweenSaga.ts` (route body targets to
the driver, not the tween), `tests/services/engine/camera/cameraDrivers.test.ts` (grow).

Spec §5, Q7. A new **row** in `buildCameraDrivers` (`cameraDrivers.ts:167`):

```ts
{ id: 'followBody', priority: 70, commitsOnEdge: true, isActive, pose }
// priority 70: between tween (60) and orbitDrag (80). A held drag wins; the follow
// replaces the tween for body targets (so they never both run).
```

- **`isActive(s)`** — the focus resolves to a scene body: `s.selectionRows.focus?.type === 'body'`
  AND that body id is present in the frame snapshot. The snapshot is EngineState, not RootState, so the
  driver closes over `state` (via `buildCameraDrivers(state)` — the `_state` param is already threaded
  for exactly this, `cameraDrivers.ts:167`) and reads the frame stash Prep A/Task 8 populated before
  produce. The `focus` row is RootState.
- **`pose(s, cam, elapsed)`** — target term is ALWAYS the live body snapshot position
  (`bodyStates.get(id).positionMpc`); yaw/pitch/distance stay world-frame (translate-follow). The
  **approach is owned by the driver** (refactor-ground finding: the tween compiles fixed vec3 endpoints
  and cannot track a moving destination). On activation, capture the current pose as `from` and ease the
  OFFSET (distance, and orientation from `from` toward the framing pose
  `bodyLikeFraming(bodyPos, radiusKm, fovYRad)` — reuse `focusFraming`'s body arm math via
  `bodyLikeFraming`) over `FOCUS_TWEEN_MS` with `easeOutCubic` (mirror the tween's ease). After
  saturation, steady-state pose = `{ target: liveBodyPos, yaw/pitch/distance: base }` so a post-drag
  adjustment keeps the body centred.
- **Ease timer:** the driver needs an activation timestamp + captured `from` pose — mirror
  `autoRotateElapsed`/`lastBaseRef` (`cameraClock.ts:84-96`). Add a `followStartMs` + captured-from to
  the `CameraClock` resource (or a sibling `followClock`), reset on the activation edge, and compute the
  follow elapsed in `elapsedForWinner` (`cameraDrivers.ts:93`) alongside the tween/autoRotate arms.
- **Route body focus away from the tween:** `watchFocusTweenSaga` (`watchFocusTweenSaga.ts:95`) currently
  dispatches `startCameraTween` for EVERY row including `body`. Make the `body` arm a no-op (return
  before the `put`) so the follow driver — activated purely by the focus selection — replaces it.
  Non-body rows still tween. (`focusTweenDescriptor`/`focusFraming` stay untouched for those.)
- **Deactivation:** leaving focus (`focus` null / non-body) deactivates the row; `commitsOnEdge: true`
  bakes the last follow pose into `base` so lower drivers resume from where the camera is (no snap-back).

- [ ] Test `followBody pose target equals the body snapshot position while active` — with a body
      focused and a populated snapshot, `pose(...).target` equals `bodyStates.get(id).positionMpc`
      (after approach saturation; the target term is live).
- [ ] Test `followBody deactivates when focus leaves the body` — `isActive` flips false when the focus
      row is null / a galaxy, and `pickWinner` hands off to the next-highest active driver.
- [ ] Test `the follow approach ease converges to the framing offset` — at `elapsed = 0` the pose
      distance ≈ the captured `from` distance; at `elapsed ≥ FOCUS_TWEEN_MS` it ≈ the
      `bodyLikeFraming` framing distance (monotone convergence, hand-reasoned ease-out — not the source
      ease formula mirrored).
- [ ] Test `focusing a body dispatches NO camera tween` — `watchFocusTweenSaga` on a `body` focus ref
      puts no `startCameraTween` (the follow driver owns it); a galaxy focus still does.
- [ ] `npm run typecheck && npm test -- cameraDrivers watchFocusTween` green; commit.

---

## Task 13 — Clips pause/restore the sim clock

**Files:** `src/state/camera/watchClipSaga.ts` (capture-pause on start, restore on end),
`tests/state/camera/watchClipSaga.test.ts` (grow).

Spec §7, Q9. The clip player SETS the clock's mode via the existing re-anchor primitive — no new clock
plumbing. At the `watchClipSaga` seam (`watchClipSaga.ts:53-73`), which already wraps `playClipSeam` in
a `race({ run, stop })`:

- On clip start, BEFORE `call(playClipSeam)`: read `state.time.mode`, then dispatch `pause({ nowMs })`
  (the same re-anchor pause user-pause uses — spec §7). Capture the prior mode.
- On clip END or CANCEL (the `run` arm resolves, or the `stop` arm / `takeLatest` aborts): restore the
  prior mode — `goLive({ simDays: unixMsToJulianDays(Date.now()), nowMs })` if it was live, else
  `resume({ nowMs })` if it was manual. Use a `finally` (or an equivalent race-arm convergence) so the
  restore runs on BOTH the natural-end and the cancellation paths.
- Choreography + `record-tour` stay deterministic (nothing moves during a clip). A later clip *cue* that
  sets a different mode (Q9 option c) is a new `applySceneEffect` verb through this same seam — do not
  build that now.

- [ ] Test `clip start pauses the sim clock` — dispatching `startClip` results in a `pause` action with
      the anchor captured (the clip is now frozen). Assert the dispatched `pause` re-anchors from the
      pre-clip derived simDays (continuity).
- [ ] Test `clip end restores the prior mode` — starting from LIVE, a clip start→end round-trip leaves
      the clock back in live; starting from MANUAL (playing) leaves it manual and unpaused. Cover the
      cancel path (a second `startClip` / `stopClip`) restoring too.
- [ ] `npm test -- watchClipSaga` green; commit.

---

## Task 14 — Entanglement-radar review over the core diff

**Files:** none (review + any follow-up commits it triggers).

Run the `entanglement-radar` skill over the full core diff. Named things to confirm are un-braided,
not just asserted:

- **Intent vs derivation vs observed** — `state/time` (decisions) / `utils/time/deriveSimDays` (pure) /
  `engineSlice.engineTimeReported` (observed) are three surfaces, no mirror. Confirm the "no stateful
  simClock resource" call (Task 3 header) is the simpler artifact, not a hidden coupling.
- **One propagation path** — `propagateElements` is a single linear map for planets AND moons (Task 4/5);
  confirm the satellite maker's period→rate conversion kept the propagator branch-free (no
  planet-vs-moon discriminant that would go 3-way).
- **Snapshot single-writer** — every consumer (renderers, pick, captions, trails, follow driver,
  InfoCard rows) reads the ONE per-frame `deriveBodyStates` snapshot; no consumer re-derives a position
  (the mirror-state braid `simplicity.md` forbids). The follow driver reads the stash, does not re-solve
  Kepler.
- **Re-anchor discipline** — confirm every `time/` reducer re-anchors through the one `deriveSimDays`
  call, not an inlined copy of the formula (a mirror would rot).

- [ ] Apply any un-braiding the radar surfaces (via `/simplify` if it's a real knot) or record an
      explicit "reviewed, no change — because X" in the PR.
- [ ] Full `npm run typecheck && npm test` green; PR #472 ready for review.

---

## Task summary (12 lines)

```
 1  TimeState + RateLadderStep types + RATE_LADDER table (monotone/label invariants)
 2  state/time slice (re-anchor on every action) + selectors + rootReducer/constants wiring
 3  pure deriveSimDays(time, nowMs) + unixMsToJulianDays  (no stateful simClock resource)
 4  planet element rates + unified propagateElements(el, simDays) linear map + Horizons ref test
 5  moon epoch phases + period/precession cols → same rate fields  [VISUAL GATE: moon relocation]
 6  restore rotation W(t)=W₀+Ẇ·d; orientationForBody(id, simDays)  [VISUAL GATE: Earth sub-solar]
 7  deriveBodyStates(simDays) propagates to t + memoizes on simDays
 8  runFrame derives simDays once/frame, feeds snapshot; bootstrap goLive(now)
 8b live-position stragglers: captions, bodyPosOf texture gate, earthFlyout/earthSurfaceFraming
 9  wake: manual-playing disjunct in shouldKeepTicking; live = slow idle tick
10  throttleByTime util + engineTimeReported dedup-on-write status pub (a few Hz)
11  orbit trails re-derive conics from propagated elements at t; moon centres from parent snapshot
12  followBody camera driver (priority 70, driver-owned approach); route body focus off the tween
13  clips capture-pause / restore-prior-mode at the watchClipSaga seam
14  entanglement-radar over the core diff (intent/derivation/observed; one propagation path)
```
