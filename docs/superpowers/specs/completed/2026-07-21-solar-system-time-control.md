# Solar-system time control — design

> **Status.** Drafted 2026-07-21 against the grill session
> `docs/grill-sessions/solar-system-time-control-2026-07-21.md` (13 ratified
> decisions, cited as Q1–Q13 below) and the refactor-ground checkpoint
> (user-ratified 2026-07-21). Written **against the post-prep architecture**
> (§Ground preparation): Prep A (BodyDef/BodyState split) and Prep B
> (useUrlSync param seam) land as their own PRs first.
> **Worktree.** `solar-system-time-control`.

## 1. What we're building

The solar-system layer is frozen at J2000 — the planets are in *wrong*
positions for today's date. This feature adds a **sim clock** with a UI: play
time at named rates (forward and reverse), set an exact date, and snap back to
"now". Bodies orbit, planets spin, the terminator sweeps, moons dance; the
camera can stay locked on a moving body; a shared URL reproduces a moment.

### Goals

- **The map is always true** (Q3): with no interaction and no URL time, sim
  time is *live wall-clock* — planets, moon phase, and Earth's terminator match
  the real sky on load, and stay matched.
- Animated Keplerian positions for the 8 planets + 14 moons from mean elements
  **+ rates**, arcminute-class over 1800–2050 (Q1).
- Axial rotation restored (`Ẇ·d`) for the 13 textured bodies (Q2).
- Signed discrete rate ladder, `1 s/s … 10 yr/s`, forward and reverse (Q4).
- Camera **translate-follow** of a focused moving body (Q7).
- `t=<ISO>` URL param for manual-mode moments; restore = paused (Q8).
- A dedicated **TimeBar** component (Q10); InfoCard time-dependent rows update
  live (Q12).

### Non-goals (deferred, named)

- Co-rotating "surface lock" camera frame (Q7's option b).
- Clip time-cues — a beat setting date/rate is a later `applySceneEffect` verb
  row; v1 clips only pause/restore the clock (Q9).
- Galactic-scale time (flow-field galaxy motion, big-bang) — the clock is
  *shaped* for it (§2) but no galactic consumer ships now.
- ELP-grade accuracy for Earth's Moon; eclipse/occultation-precision anywhere.
- Scrubber timeline UI, mobile gestures, star proper motion.

## 2. The clock — domain-agnostic, intent-anchored

The clock knows nothing about planets (Q4 note: future galactic consumers).
Sim time is **float64 days** (Julian-date-like; carries Gyr magnitudes).
Validity windows belong to consumers — the planetary ephemeris owns 1800–2050
and degrades gracefully outside; the clock itself is unbounded.

### Intent state (RTK, `state/time/`) — Q5

```ts
// src/@types/time/TimeState.d.ts (one type per file; sketch)
export type TimeState = {
  readonly mode: 'live' | 'manual';
  /** The pairing (simDays at realMs) from which playback integrates. */
  readonly anchor: { readonly simDays: number; readonly realMs: number };
  readonly rateIndex: number; // index into RATE_LADDER
  readonly direction: 1 | -1;
  readonly paused: boolean;
};
```

- **Every intent action re-anchors** (Q5): `setDate`, `setRate`, `pause`,
  `resume`, `goLive` all capture the current derived `simDays` as the new
  anchor before applying their change. Scrubbing, pausing, and URL restoration
  are all the same operation — "set anchor". A reducer that forgets to
  re-anchor causes a time jump; the timeSlice tests pin this.
- `RATE_LADDER` is a data table in `src/data/time/rateLadder.ts`
  (`{ label: '1 day/s', simSecPerRealSec: 86_400 }`, …); galactic steps append
  later. Pause is its own flag, not a ladder entry (Q4).

### Per-frame derivation (engine) — Q5

`services/engine/time/simClock.ts` mirrors the `cameraClock` idiom: pure
functions taking `nowMs`, never reading the wall clock.
`deriveSimDays(intent, nowMs)` = `anchor.simDays + rate·direction·(nowMs −
anchor.realMs)` (paused ⇒ anchor.simDays; live ⇒ rate 1). Called once per
frame in `runFrame` right after `clipPlayer.tick` (`runFrame.ts:~100`), before
camera produce — everything downstream that frame sees one `simDays`.

### Status publication — Q5/Q12

React never subscribes per-frame. A **throttled** publication (a few Hz)
carries the derived `simDays` to the TimeBar readout and InfoCard live rows —
the `engineScaleChanged` dedup-on-write pattern plus an actual time gate (new
small `utils/` throttle helper; search-before-writing checked: none exists).

## 3. Ephemeris — mean elements + rates (Q1)

### Planets

`ORBITAL_ELEMENTS` planet rows grow the six Standish rate columns
(°/cy, au/cy): `dL, da, de, di, dNode, dPeri` — JPL SSD "Approximate
Positions", Table 1, already partially transcribed with rates in the shipped
conic-trails spec §7 (verified 2026-07-11; source re-verified 2026-07-21).
Propagation at `t` (centuries since J2000): element(t) = element₀ + rate·t,
then `ω = ϖ − Ω`, `M = L − ϖ` (same derivation the epoch seeding uses,
now evaluated per frame), Kepler solve via the existing
`eccentricAnomalyFromMean`.

### Moons — data verified 2026-07-21

JPL SSD "Planetary Satellite Mean Orbital Parameters"
(<https://ssd.jpl.nasa.gov/sats/elem/>, fetched live) covers all 14 moons
with epoch elements plus **sidereal period `P` (days), apsidal precession
period `Papsis` (yr), nodal precession period `Pnode` (yr)**, in the frames
our table already uses (Laplace plane for regular moons, ecliptic for the
Moon). Propagation: `M(t) = M₀ + (360°/P)·Δt`, `ω(t) = ω₀ ± 360°·Δt/Papsis`,
`Ω(t) = Ω₀ ∓ 360°·Δt/Pnode` — **sign conventions verified per body at
transcription** (prograde: apsis advances, node regresses).

**Epoch-phase re-transcription (required).** The 13 non-Moon satellite rows
carry placeholder `Ω = ω = M = 0` (`makers/satellite.ts` — phase deliberately
unmodelled for the static scene). The `satellite()` spec grows
`ascendingNodeDeg / argPeriapsisDeg / meanAnomalyDeg` + the three period
columns, transcribed from the same JPL page. This **relocates every moon to
its true epoch phase** — a real visual change, gated on a user visual confirm
in the plan (same gate style as the conic-trails body relocation).

### Rotation (Q2)

`rotationElements.ts` restores the IAU spin term: `W(t) = W₀ + Ẇ·d` (+ the
T-dependent pole terms where trivially available). `orientationForBody`
becomes `orientationForBody(id, simDays)`, evaluated inside the snapshot
derive (§4). At 1× live, Earth's texture longitude must line up with the real
sub-solar point — a correctness check in the plan's visual gate.

### Validity

1800–2050 primary; outside, the linear rates simply extrapolate (graceful
degradation, Q1). No clamping anywhere — the clock is unbounded (§2).

## 4. BodyState snapshot (Q6) — post-prep architecture

Prep A (§Ground preparation) has already split identity from state:

```ts
// src/@types/scene/BodyState.d.ts
export type BodyState = {
  readonly positionMpc: Vec3;
  readonly orientation: Mat3;
  readonly meanAnomalyRad: number; // orbit-trail falloff anchor
};
// services/engine/frame/deriveBodyStates.ts
deriveBodyStates(simDays): ReadonlyMap<BodyId, BodyState>;
```

- Computed **once per frame**, memoized on `simDays` (paused ⇒ free).
  Planets first, then moons (one parent hop). ~22 Kepler solves, µs-scale.
- The feature diff here is exactly: the prep-frozen `CONST_J2000` argument
  becomes the frame's derived `simDays`, and the derive gains the rate
  propagation of §3.
- **All consumers read the snapshot** — renderers, pick, captions, orbit-trail
  uniforms (conic vectors re-derive from elements at `t`; moon-trail centers
  ride the parent's snapshot position; falloff anchor = snapshot
  `meanAnomalyRad`), selection/framing, InfoCard-bound rows. One instant per
  frame; no draw-vs-pick tearing.
- Stars (`SCENE_STARS`) are **not** in the snapshot — no orbital elements,
  static positions (non-goal: proper motion).

## 5. Camera follow (Q7)

A new **row** in the camera driver table (`cameraDrivers.ts` — priority gaps
are left for insertion by design):

- `{ id: 'followBody', priority: 70 }` — above tween (60), below orbitDrag
  (80): user drag wins while held; the one-shot focus tween never fights the
  follow driver because follow *replaces* the tween for body targets (below).
- Active while the focused focusable resolves to a scene body. `pose` reads
  `bodyStates.get(bodyId).positionMpc` live each frame as the orbit target;
  yaw/pitch/distance remain world-frame (translate-follow).
- **The approach is owned by the driver, not the tween** (refactor-ground
  finding: tween endpoints are compiled as fixed vec3s — `evaluateClip`'s
  WeakMap-cached `from→to` — and cannot track a moving destination). On focus,
  the follow driver eases its *offset* (distance/orientation from current pose
  toward the framing pose) over the approach duration while the target term is
  always the live body position. Ease math mirrors the tween's ease-out;
  `focusTweenDescriptor` stays untouched for non-body targets.
- Leaving focus deactivates the row; lower-priority drivers resume.

## 6. URL (Q8) — post-Prep-B architecture

Prep B generalized `useUrlSync` into a multi-param seam (`&`-separated,
per-param sources). The feature adds the `t` param source:

- **Live mode ⇒ no `t` param.** A bare URL means "now", forever.
- **Manual mode ⇒ `t=<ISO 8601 UTC>`** (e.g.
  `#focus=body-jupiter&t=2026-11-03T18:00Z`). Restore: manual mode, **paused**
  at that instant (a shared link is a specimen).
- Written only on **anchor changes** — no per-frame hash churn. Because pause
  re-anchors (§2), *pausing crystallizes the on-screen moment into the URL*;
  "pause, then share" is the documented gesture. Rate/direction are not
  encoded.

## 7. Clips (Q9)

The clip player **sets the clock's mode**: on clip start, capture-and-pause
(same re-anchor primitive as user pause, engine-side at the
`clipPlayer`/`watchClipSaga` seam); on clip end, restore the prior mode (live
resumes live). Choreography and `record-tour` output stay deterministic. The
seam is mode-setting — a later clip *cue* that sets a different mode (Q9's
option c) is a new `applySceneEffect` verb row through the same seam, not new
plumbing.

## 8. Render wake (Q11)

One new disjunct in `shouldKeepTicking` (the established per-subsystem idiom):
**manual mode, playing** keeps the loop ticking. **Live 1× does not** — nothing
perceptible changes per frame; live mode instead requests a slow idle tick
(~one frame per few seconds keeps the terminator honest; the TimeBar readout
ticks on its own React timer regardless). Battery-friendly idle is preserved.

Perf note: playing means continuous rendering; the solar-system pose is
already vertex-bound (backlog `2026-07-21-perf-harness-findings`). Measure
with `npm run perf` before/after; the snapshot derive itself is µs-scale.

## 9. UI surface

### TimeBar (Q10)

New `src/components/TimeBar/` (create-component conventions; one component
per file, module CSS): date-time readout (click → exact date/time entry
popover) · reverse step · play/pause · forward step · current rate label ·
"now" button (shown/lit only in manual mode). In live mode the bar collapses
to the ticking readout; controls reveal on hover/tap. Reads the throttled
status pub; dispatches `time/` intent actions; zero engine imports.
Placement (corner, clearances vs InfoCard/ScaleBar) is a dev-server visual
pass, not spec'd. Keyboard: proposed `[` / `]` slower/faster, `\`
play/pause, `Shift+N` now — settled at plan time against the taken-key map;
independent of the shortcuts-saga backlog item.

### InfoCard (Q12)

Time-dependent rows (distance, apparent magnitude, phase) re-derive from the
throttled publication; values read from the snapshot (§4), never recomputed
independently. Identity rows unchanged.

## 10. Ground preparation

Refactor-ground checkpoint ratified 2026-07-21. Two prep PRs, each landing
before the feature with zero visual/behavior change:

- **Prep A — BodyDef/BodyState split.** Introduce `BodyState` +
  `deriveBodyStates` evaluated at a `CONST_J2000` epoch; repoint all ~34
  consumer files (~60 read sites) off the module-load-baked
  `positionMpc`/`orientation`. Fix the four time-hostile sites:
  `sceneOrbitConics.ts:43-46` (moon-trail centers baked from the parent's
  load-time position → per-frame-capable derivation),
  `orbitTrailsLayer.ts:71-77` (`MAX_ORBIT_EXTENT_MPC` module const from conic
  centers → bound from max apoapsis, which is time-invariant),
  `earthFlyout.ts:58` + `earthSurfaceFraming.ts:48` (direct `SCENE_EARTH`
  reads → snapshot lookup). Stars stay static. Tests move to fixtures over
  the map.
- **Prep B — useUrlSync param seam.** Generalize the single-param
  `focus=`-regex parser/writer into `&`-separated param parse/compose with
  per-param sources; `focus` becomes the first source. No new params yet.

Adjacent (not prep): `foregroundMaxDistance.ts:71` "authored origin-relative"
comment wording folded into Prep A's touched files; the throttle helper is a
feature-diff `utils/` addition.

## 11. Testing (what can break)

Per `testing.md` — behavior, not restatements:

- **Propagation math:** position at J2000+Δ against an independently computed
  reference (e.g. a hand-checked Horizons value for one planet + one moon at
  one date); reverse symmetry (propagate +Δ then −Δ ≈ identity); moon phase
  re-transcription spot-check (Io's period ≈ 1.769 d from its own columns).
- **Re-anchor discipline:** every `time/` reducer action leaves derived
  `simDays(nowMs)` continuous (no jump) across the action boundary.
- **simClock:** paused ⇒ constant; live ⇒ slope 1; manual ⇒ slope
  rate·direction.
- **Follow driver:** pose target equals the body's snapshot position while
  active; deactivation hands off to lower priority; approach ease converges to
  framing offset.
- **URL:** parse/compose round-trip for `focus` + `t` (and absence of `t` in
  live mode); restore lands paused-manual at the encoded instant.
- **Clip interaction:** clip start pauses (anchor captured), end restores
  prior mode.
- Not tested: rate-ladder table restatements, TimeBar render snapshots,
  clamp boundaries.

## 12. Delivery

1. **Prep A PR**, then **Prep B PR** (order free; A is the big one).
2. **Core plan** — clock (slice + simClock + wake + status pub), ephemeris
   (rates + moon re-transcription + rotation), snapshot goes live-`t`, follow
   driver, trail uniforms, clip pause. Visual gates: moon-phase relocation;
   live-now Earth sub-solar alignment.
3. **Surface plan** — TimeBar, date entry, URL `t=`, InfoCard live rows,
   shortcuts.
   Both via subagent-driven-development; draft PR at first task.

## References

- Grill transcript: `docs/grill-sessions/solar-system-time-control-2026-07-21.md`.
- Shipped conic-trails spec (§7 element provenance incl. planet rates):
  `docs/superpowers/specs/completed/2026-07-11-conic-orbit-trails.md`.
- JPL SSD approximate planetary elements
  <https://ssd.jpl.nasa.gov/planets/approx_pos.html>; satellite mean elements
  <https://ssd.jpl.nasa.gov/sats/elem/> (both verified 2026-07-21).
- Conventions: `plan-style.md`, `testing.md`, `simplicity.md`.
