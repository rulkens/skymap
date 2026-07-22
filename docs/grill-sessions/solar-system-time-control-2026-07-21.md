# Grill Session: Solar-System Time Control — 2026-07-21

Source: user request in worktree `solar-system-time-control` — "the current state of the planets is fixed right now. I'd like time control built in… animate time (speed, set date), so we can investigate the state of the solar system at a specific time and date."

Goal: turn the frozen-at-J2000 solar-system layer into a time-controlled one — a clock with speed/date UI, propagating body positions and rotations, camera tracking of moving bodies, and URL shareability of moments. No backlog item existed for this; the codebase pre-cut the extension points (`orbitalElements.ts` and `rotationElements.ts` both name "a future animated ephemeris / rotating planet" as the deliberate YAGNI seam).

Pre-grill codebase facts (scouted, `file:line` evidence in the session): positions come from real J2000 mean Keplerian elements for 8 planets + 14 moons (`src/data/bodies/orbitalElements.ts`), evaluated once at module load into a static `positionMpc`; JPL's element *rates* were recorded in the shipped spec but deliberately omitted from code. Orbit trails derive analytically from the same table (3 constant conic vectors + mean-anomaly brightness falloff). `focusTweenDescriptor.ts` snapshots the body position once — no follow mechanism. The only engine clock is the camera/clip clock (`cameraClock.ts`), fed `nowMs` from the loop. Earth does not spin (`orientationForBody.ts` bakes a static IAU orientation, `Ẇ` dropped).

---

## Q1: Accuracy class and date range

**The question:** What accuracy must "investigate the state of the solar system at a date" deliver, and over what range? This is the root decision — it picks the ephemeris math, and moons/rotation/trails inherit it.

**Considerations:**

- **Option A (mean elements + secular rates, Kepler propagation):** add JPL's rate columns (da/dt, dM/dt, …) to the existing elements table, propagate linearly, solve Kepler per frame — exactly the extension point the code named. Arcminute-class for planets over ~1800–2050 AD (JPL Standish table; extended variant covers 3000 BC–3000 AD at lower accuracy). Good for planet configurations, conjunctions, retrograde loops, moon dances. Not good for eclipse shadows / occultation timing. Earth's Moon is the crudest body (fast precession; mean elements drift visibly within years) — accepted for v1, ELP-lite noted as follow-up.
- **Option B (full analytic theory, VSOP87 + ELP):** arcsecond-accurate over millennia, but thousands of coefficients, a library-or-port decision, big complexity jump.
- **Option C (sampled JPL Horizons data):** perfect accuracy but a data-pipeline artifact per time range — clashes with free scrubbing to any date.

**Decision:** Option A. It's the pre-cut extension point (table-column addition, not a new subsystem), and the feature's verb is "investigate/animate," not "predict eclipses." Range: 1800–2050 primary, degrade gracefully outside.

## Q2: Axial rotation in scope?

**The question:** Does time control animate axial rotation (spin + terminator), or orbital positions only? `rotationElements.ts` dropped `Ẇ·d` with a comment naming its restoration as "the single named extension point for an animated, rotating planet."

**Considerations:**

- **Option A (positions only):** smaller diff, but at the speeds where moon orbits are interesting (hours/s) a frozen Jupiter looks broken next to whirling Galileans, and "state at a date" is wrong on its face — the hemisphere facing the Sun is part of the state.
- **Option B (positions + rotation):** restore `Ẇ·d` (+ small T-dependent pole terms if trivial) in `orientationForBody.ts`. One multiply-add per body; the sweeping terminator and Jupiter's ~10 h spin are the most visible payoff of time control, and the photoreal-Earth work (city lights, terminator) gains value.

**Decision:** Option B, in v1. Nearly free mathematically; without it the feature demos badly. Accepted consequence: at 1× nothing visibly moves, so the interesting default speeds are faster than real time (see Q4/Q10).

## Q3: Default resting state — live now?

**The question:** With no time in the URL and no interaction, what is sim time? (Today's frozen J2000 means planets are in *wrong* positions for 2026.)

**Considerations:**

- **Option A (live "now" at 1×):** sim time = wall clock, advancing at 1×. Skymap is always *true* — planets, moon phase, terminator match the real sky on load. Motion at 1× is imperceptible; only wrinkle is render-on-demand (resolved in Q11). The ticking date readout self-demonstrates that time control exists.
- **Option B (paused at "now"):** simpler for the scheduler, but time drifts stale during a session and "live" becomes a discoverable mode.
- **Option C (paused at J2000):** status quo; wrong-on-its-face once we can do better.

**Decision:** Option A. "The map is always true" makes the whole product more credible. Setting a date/scrubbing enters manual time; a "now" button snaps back to live. Engine-side, live is just `anchor + 1×·elapsed` — same code path as any rate, not a special case.

## Q4: Speed-control model

**The question:** Discrete rate ladder or continuous log slider? Is reverse in scope? Useful speeds span ~9 orders of magnitude (Earth spin ≈ min/s … Neptune orbit ≈ yr/s).

**Considerations:**

- **Option A (discrete named-step ladder):** `1 s/s · 1 min/s · 1 hr/s · 1 day/s · 1 wk/s · 1 mo/s · 1 yr/s · 10 yr/s`, each available negative. Stellarium/SpaceEngine convergent design. Every state legible ("1 day/s"), steps map to keyboard shortcuts, state is index + sign. Cap ±10 yr/s crosses the 250-year validity window in 25 s.
- **Option B (continuous log slider):** smoother scrubbing but unlovely readouts, mid-scale values never wanted, more UI for no capability.

**Decision:** Option A with reverse (propagation is symmetric — negative Δt just works; "back up, I missed the transit" is a core gesture). Pause is its own state, not rate=0.

**Future-extension constraint recorded (user):** the clock may later extend to galactic scales — flow fields moving galaxies, "simulate the big bang." Therefore the clock is **domain-agnostic**: sim time as float64 Julian-date-like days (handles Gyr magnitudes), the rate ladder an extensible data table (`1 Myr/s`, `1 Gyr/s` append later), and validity windows belong to *consumers* (planetary ephemeris owns 1800–2050; a future flow-field integrator owns its own), never to the clock. The clock runs unbounded; layers degrade individually.

## Q5: Clock ownership

**The question:** Where does the clock live — Redux-ticked time, or intent in RTK with per-frame derivation in the engine?

**Considerations:**

- **Option A (intent in RTK, integration in engine):** slice stores only user decisions: `{ mode: 'live' | 'manual', anchor: { simDays, realMs }, rateStep, direction, paused }`. Anchor changes only on user actions. Per frame the engine derives `simDays = anchor.simDays + rate × (nowMs − anchor.realMs)` — zero per-frame dispatches. UI readout subscribes to a throttled status publication (singleton-overlay status-store convention). Mirrors the camera-intent slice's pose-derived-per-frame architecture.
- **Option B (per-frame `timeTick` dispatch):** canonical time in the store, but 60 dispatches/s through the reducer/selector graph is what the architecture exists to avoid, and it fights render-on-demand.

**Decision:** Option A. Reducer discipline flagged: every intent action (pause, rate change, set-date, "now") **re-anchors** — captures current simDays as the new anchor — or time jumps. This makes scrubbing, pausing, and URL restoration the same operation: "set anchor."

## Q6: Per-frame BodyState snapshot

**The question:** Today the static bodies table is both identity ("Io, radius X, parent Jupiter") and state ("Io is at P"). With time those diverge — one derived snapshot all consumers repoint to, or each consumer evaluates the ephemeris itself?

**Considerations:**

- **Option A (one snapshot per frame):** engine computes `bodyStates: Map<bodyId, { positionMpc, orientation, meanAnomaly }>` once per frame (memoized while paused) — planets first, then moons (one parent hop). All consumers (body renderers, pick, captions, orbit-trail uniforms, camera follow, InfoCard) read it. Every consumer sees the same instant (no draw-vs-pick tearing); Kepler cost (~22 solves, µs) paid once.
- **Option B (each consumer calls `positionAtTime`):** no new structure, but intra-frame `t` divergence, N× Kepler solves, and "who moved the planet" becomes unanswerable — the mirror-state braid shape the simplicity conventions kill.

**Decision:** Option A — and it is the feature's refactor-ground headline: a **prep PR** splits BodyDef from BodyState, repointing today's consumers to a snapshot still computed at fixed J2000 (zero visual change); the feature then just makes `t` variable. Also hosts the future galactic extension (a flow-field layer contributes its own state under the same clock). Orbit trails follow mechanically: conic vectors re-derive from elements at `t`, moon-trail centers ride the parent's snapshot position, falloff anchor tracks animated mean anomaly.

## Q7: Camera follow frame

**The question:** What does "focused on a moving body" mean for the camera? Today `focusTweenDescriptor` snapshots the target once.

**Considerations:**

- **Option A (translate-follow, inertial orientation):** target re-derives from the snapshot each frame; yaw/pitch/distance stay world-frame. Body stays centered, star background holds still, terminator/parent wheel slowly. Orbit controls keep their exact semantics — you orbit a point that moves.
- **Option B (co-rotating follow, hold Sun–body geometry):** lit face stays put, stars sweep. Prettier for "watch the seasons" but changes orbit-control semantics, needs an unwind story, and at high rates the whirling background is nauseating.

**Decision:** Option A for v1, implemented as a **follow driver** in the camera-intent driver table: while `focus = body-X`, the target source is `bodyStates[X].position`, not a stored point. Accepted consequences: the focus tween flies toward a moving destination (re-resolve inside the tween each frame); Option B stays open as a future "surface lock" toggle.

## Q8: URL encoding of time

**The question:** What does the hash encode about time, and when is it written? (`useUrlSync` owns `#focus=<id>` today.)

**Considerations:**

- Live mode: **no time param** — a bare URL means "now" and stays true forever.
- Manual mode: **`t=<ISO date-time>`** joins the hash (`#focus=body-jupiter&t=2026-11-03T18:00Z`); opening it restores manual mode **paused** at that instant — a shared link is a *moment/specimen*, the recipient presses play themselves. Rate/direction stay out (ephemeral gestures, parser surface for nothing).
- Write timing: hash written **only on anchor changes** (set-date, pause, rate change, "now") — no 60 Hz churn. Honesty gap: copying while playing shares the stale anchor; resolved by Q5's pause-re-anchors — **pausing crystallizes the current moment into the anchor and URL**. Documented as "pause, then share" rather than adding a per-second hash writer.

**Decision:** the whole shape as proposed (user: "yes").

## Q9: Sim time during tour clips

**The question:** Two clocks now exist (sim clock + clip clock, "player owns scene/clock"); the grand tour was choreographed against a static scene. What happens during clips?

**Considerations:**

- **Option A (clips pause sim time):** clip start freezes the sim clock (anchor re-capture, same primitive as user-pause); clip end restores the prior mode. Choreography deterministic; recorded tours reproducible. Cost: nothing moves during the tour — acceptable, no current beat depends on motion.
- **Option B (sim time keeps running):** beat framing becomes rate-dependent; `record-tour` stops being reproducible.
- **Option C (clips own sim time as a cue channel):** a beat says "set date X, rate 1 hr/s" and choreographs against motion (the Galilean-dance beat writes itself). Right long-term; an authoring-vocabulary extension, not a v1 need.

**Decision:** Option A for v1, **implemented as "the clip player sets the clock's mode"** so Option C later reuses the same seam. Matches the suspended-bridge precedent (fades/camera bridge suspend during clips).

## Q10: Time UI placement and composition

**The question:** Where do the controls live — StatusBar, SettingsPanel, or a dedicated bar? Contents implied by earlier decisions: ticking date-time readout, play/pause, rate stepper through the signed ladder, "now" button, exact date entry.

**Considerations:**

- **Option A (StatusBar cluster):** initially recommended, then withdrawn on inspection — `StatusBar.tsx`'s documented charter is **"only render when something is wrong"** (error/synthetic-fallback only; a healthy-status echo was deliberately deleted as noise). A persistent ticking instrument would invert that philosophy. User's instinct flagged this.
- **Option B (SettingsPanel section):** wrong register — a live instrument, not a preference; burying play/pause kills the feature.
- **Option C (dedicated TimeBar):** its own chrome region; honest fit for an interactive instrument, a different species from wrong-only StatusBar and passive ScaleBar.

**Decision:** Option C — new `src/components/TimeBar/` (create-component conventions): date-time readout (click → date picker popover), reverse/pause-play/forward steppers with rate label, "now" button shown/lit only in manual mode. In live mode it can collapse to just the ticking readout (controls reveal on hover/tap) so the default screen stays clean. Reads the throttled clock status pub; dispatches intent actions; zero engine coupling. Exact placement = dev-server visual-pass decision, not spec. Keyboard shortcuts ride `useKeyboardShortcuts` (proposed `[`/`]` slower/faster, `\` pause, `Shift+N` now — settle at spec time against the taken map; don't block on the shortcuts-saga backlog item). Mobile gets buttons; no gestures in v1.

## Q11: Render-loop wake rules

**The question:** Render-on-demand re-schedules only while `autoRotate || tween || input || in-flight images || recent-fade`. Does time playing join the wake set — and does live-1× count as animation?

**Decision (recommended, user: "great"):** playing at any **manual** rate joins the wake set (continuous rendering is the point). **Live 1× does not** — at 0.004°/s nothing perceptible changes; live mode instead schedules a slow idle tick (~1 frame per few seconds keeps terminator/readout honest; the React readout ticks on its own timer regardless). Preserves battery-friendly idle. Perf context noted: solar-system NEAR0 is already vertex-bound at 60% (backlog `2026-07-21-perf-harness-findings`), so continuous rendering while playing makes that item more relevant.

## Q12: InfoCard behavior while time plays

**The question:** Selection itself is settled (selection stores a body id; halo + pick read the per-frame snapshot, so a selected moving body stays haloed/clickable for free). But card *content* is now time-dependent (Earth–Jupiter distance swings visibly at 1 mo/s).

**Considerations:**

- **Option A (live-updating rows):** time-dependent rows re-derive from the same throttled clock/status publication as the TimeBar (~few Hz). Static identity rows untouched. The card becomes an instrument — watch Jupiter's distance shrink toward opposition — precisely the "investigate" use case.
- **Option B (frozen at selection time):** cheaper, but the card lies within seconds at any interesting rate; "re-select to refresh" is a bug report waiting.

**Decision:** Option A, with the discipline that the card subscribes to the *throttled* publication (never per-frame), and derived values read from the snapshot (same instant as the scene), per Q6's single-source rule.

## Q13: Delivery sequencing

**Decision (proposed, user: "yes"):**

1. **Verify external data first** (verify-external-data-before-spec): planets' rates from JPL's Standish table are known good; the **moons' rates are the risk** — confirm JPL satellite elements provide mean motions + precession rates for all 14 moons in a form consistent with our elements table. A moon that doesn't move is the feature failing at its most visible point (the Galilean dance). ~Half-day check, before the spec.
2. **`refactor-ground` run** (convention gates the spec on it); expected headline = Q6 prep PR: BodyDef/BodyState snapshot at fixed J2000, zero visual change, repointing renderers/pick/captions/trails/focus.
3. **Spec** `docs/superpowers/specs/2026-07-21-solar-system-time-control.md` carrying these decisions + Ground-preparation section. Explicit non-goals: co-rotating surface lock, clip time-cues, galactic/flow-field time, ELP-grade Moon accuracy, scrubber timeline, mobile gestures.
4. **Plans, likely two** after the prep PR: **core** (clock intent slice + throttled status pub, element rates + propagation, animated snapshot, rotation `Ẇ`, follow driver, trail uniforms, wake rules) and **surface** (TimeBar, date picker, URL `t=`, InfoCard live rows, clip-pause wiring, shortcuts). Executed via subagent-driven-development; draft PR at first task.
