# Shell Transitions — crossfading between scales

**Status:** Design. Builds directly on [`00-scale-architecture.md`](00-scale-architecture.md).
**Required for:** Every shell handoff in the tour, plus any free-fly traversal that crosses a boundary.
**Related:** [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md) (boundary table), [`../vision/01-narrative-script.md`](../vision/01-narrative-script.md) (transition timing).

## 1. Goal

The cosmic zoom is a **continuous visual story**. The user should feel they are pulling back through one connected universe, not paging through nine slideshows. Hard cuts would shatter that: a frame of only shell 3 followed by a frame of only shell 4 reads as a scene change, not a zoom-out.

The transition system's job is therefore narrow but absolute:

- **No hard cuts.** Every boundary is crossed via a temporal blend during which both shells render with alphas summing to 1.
- **No popping.** Sub-elements (orbits, dust lanes, X-ray halos) ride the shell's overall fade rather than appearing on their own schedule.
- **No flash of black.** The space between two shells must never resolve to background colour.
- **Perceptible.** During a fast camera move the band must be wide enough that the user actually sees the blend; during a slow approach a narrower band gives a crisper handoff.

The mechanism is a single function — `fadeAlphaAt()` — evaluated per-shell, per-frame, against the camera's current absolute position and smoothed log-distance velocity. Everything else (the orchestrator, the per-shell render passes, the asset slots) consumes the alpha and acts on it.

## 2. The fadeAlpha math

Each shell `N` has up to two boundaries: an **inner boundary** at distance `D_in` (where shell `N-1` takes over) and an **outer boundary** at distance `D_out` (where shell `N+1` takes over). Distance is the Euclidean distance from the camera's `absolutePos` to the shell's anchor in heliocentric Mpc — the same quantity `cameraScale.shellOrigin` snaps to (see [`00-scale-architecture.md`](00-scale-architecture.md) §"Floating origin in detail").

Around each boundary we define a **band** of half-width `W/2` in log-space, because shell scales themselves are log-spaced. All blending math runs in log-space; the band spans `[log10(D) - W/2, log10(D) + W/2]`.

For a single boundary at log-distance `b` with band half-width `h`, the **handoff fraction** at log-distance `x` is:

```ts
type LogDistance = number; // log10(distance in Mpc), an f64 scalar

// 0 when fully on the inner side, 1 when fully on the outer side.
function handoff(x: LogDistance, b: LogDistance, h: LogDistance): number {
  const t = (x - (b - h)) / (2 * h);   // 0 at inner edge, 1 at outer edge
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);          // smoothstep
}
```

Smoothstep (`3t² − 2t³`) is the right curve here: linear blends produce a perceptible brightness bump at the band centre because both shells render at 0.5 each and the eye does not sum to 1 linearly. Smoothstep's S-curve compensates by spending more "time" near 0 and 1 and less in the middle, producing apparently constant total luminance. Higher-order curves (`smootherstep`, sinusoidal) add CPU cost for a difference no test viewer has been able to spot.

A shell's `fadeAlpha` is the **product of its outer-edge keep-fraction and its inner-edge keep-fraction**:

```ts
function fadeAlphaAt(shell: ShellDef, scale: CameraScale): number {
  const x = Math.log10(distanceToAnchor(scale.absolutePos, shell.anchor));
  const innerKeep = shell.D_in === null
    ? 1
    : handoff(x, Math.log10(shell.D_in), shell.bandHalfWidth_in);
  const outerKeep = shell.D_out === null
    ? 1
    : 1 - handoff(x, Math.log10(shell.D_out), shell.bandHalfWidth_out);
  return innerKeep * outerKeep;
}
```

The innermost shell (Solar System) has `D_in = null`; the outermost (Observable Universe) has `D_out = null`. By construction:

- Outside both bands, exactly one shell has `fadeAlpha = 1`.
- Inside a single band, exactly two adjacent shells have non-zero `fadeAlpha` and they sum to 1 (because `handoff(x, b, h) + (1 - handoff(x, b, h)) = 1` and only the two shells that share that boundary are affected).
- Three-shell overlap is **forbidden**: bands are sized so adjacent boundaries' bands do not touch. We assert this at unit-test time.

Below is the alpha curve at the shell-3 / shell-4 boundary (`D = 0.1 Mpc`, `W = ±0.20 dex`). Distance is on the x-axis, log-spaced.

```
alpha
1.00 ┤━━━━━━━━━━┓                              ┏━━━━━━━━━━ shell 4
                ┃                              ┃
0.75 ┤          ┗┓                          ┏━┛
                 ┗┓                        ┏┛
0.50 ┤            ┗┓ ────────  band ────  ┏┛
                   ┗┓                    ┏┛
0.25 ┤              ┗┓                  ┏┛
                     ┗┓                ┏┛
0.00 ┤  shell 3       ┗━━━━━━━━━━━━━━━━┛       ━━━━━━━━━━
     └─────────────────────────────────────────────────────▶ log10(D)
       0.06 Mpc   D_in=0.10 Mpc   0.16 Mpc      distance from anchor
```

Both curves are smoothstep mirrors of each other; their sum is exactly 1 across the band.

## 3. Per-boundary band tuning

Bands are wider where the user expects a softer transition (subtle structural change, e.g. Local Sheet → Virgo) and narrower where high visual contrast benefits from a crisp handoff (e.g. Solar System → Stellar Neighborhood, where the Sun-as-dot reveal is the punchline).

`W` is in **dex** (orders of magnitude in distance). A `W = 0.30` band centred at `D = 100 Mpc` covers ~50–200 Mpc. We lean toward small numbers because the boundaries themselves are 1.5–2 dex apart and bands wider than ~0.4 dex risk leaking into the next boundary.

| Boundary | `D_center` | `W` (dex) | Band linear range | Rationale |
|----------|------------|-----------|-------------------|-----------|
| 1 → 2 | 200 AU = 9.7 × 10⁻¹⁰ Mpc | 0.20 | 130–310 AU | Crisp punchline: Sun shrinks to a single bright dot at the moment stars appear. Narrow band keeps the moment readable. |
| 2 → 3 | 200 pc = 6.5 × 10⁻⁵ Mpc | 0.30 | 130–310 pc | Wider: the Milky Way disk fades up gradually as a diffuse glow before crystallising. The viewer should not see exactly when stars become galaxy. |
| 3 → 4 | 100 kpc = 0.1 Mpc | 0.20 | 65–155 kpc | Tighter: leaving the MW halo and seeing M31 swim into frame is a clear narrative beat; we want it crisp. |
| 4 → 5 | 5 Mpc | 0.30 | 2.5–10 Mpc | Wider: the Local Group dwarfs scatter into the broader sheet; conceptually no sharp boundary in the data. |
| 5 → 6 | 30 Mpc | 0.30 | 15–60 Mpc | Wider: galaxy distribution is genuinely continuous across this scale; only the introduction of the X-ray halos signals shell 6. |
| 6 → 7 | 250 Mpc | 0.35 | 110–565 Mpc | Widest: the Laniakea volumetric DM field needs runway to fade up; rendered as a soft glow rather than a hard sphere. |
| 7 → 8 | 1000 Mpc | 0.30 | 500–2000 Mpc | Wider: cosmic-web filaments densify gradually as we pull back from Laniakea. |
| 8 → 9 | 5000 Mpc | 0.20 | 3.2–7.9 Gpc | Tighter: CMB sphere is the final reveal; want a defined moment when "the sky" becomes "the wall of light." |

These are starting values. Workflow: implement, watch the tour at several playback speeds, adjust the 2–3 boundaries that read poorly. Asymmetric bands (different inner/outer half-widths around the same `D`) are supported by the type but unused in v1; we may need them if a shell's outer fade competes with its inner reveal beat.

## 4. Render order during a transition

When two shells are simultaneously active (`fadeAlpha > 0.001` for both), the orchestrator renders **back-to-front** by shell index: outer (larger number) first, inner (smaller number) second. This matches the painter's-algorithm composite from [`00-scale-architecture.md`](00-scale-architecture.md) §"Shell composition order" — the cosmic web sits behind the Local Group, never in front.

Concretely, for a frame in the 3↔4 band:

```ts
// In runFrame.ts, after CameraScale is updated:
const active: Array<{ shell: ShellDef; alpha: number }> = [];
for (const shell of allShells) {
  const a = fadeAlphaAt(shell, scale);
  if (a > 0.001) active.push({ shell, alpha: a });
}
// Sort outer-first (descending shell index).
active.sort((a, b) => b.shell.id - a.shell.id);

for (const { shell, alpha } of active) {
  const renderer = registry.get(shell.id);
  renderer.render(pass, { ...ctx, fadeAlpha: alpha });
}
```

Each shell renderer multiplies its per-pixel output alpha by the `fadeAlpha` it receives. With `srcAlpha, oneMinusSrcAlpha` blending and `fadeAlpha` values that sum to 1, the composite resolves to constant total opacity — for opaque content, the screen never passes through a translucent intermediate state.

For shells with multiple sub-passes (shell 4: galaxies → dwarfs → MW disk → labels), `fadeAlpha` is applied at the **shell level**, not per sub-pass. Sub-passes still composite in their own internal order; only the final shell output is alpha-scaled.

## 5. Depth handling during transitions

Per [`00-scale-architecture.md`](00-scale-architecture.md) §"Depth precision: per-shell projection matrices", every shell carries its own near/far planes and writes to its own depth attachment. During a transition each shell writes to its own depth buffer; nothing is shared. The colour composite ignores depth on the inner-shell side and assumes the outer shell is always behind.

This is **strictly wrong** for inter-shell occlusion — e.g., the Milky Way disk should occlude the cosmic web behind it during the 3↔4 transition. The architecture spec explicitly defers this:

> **Open question 1 (Inter-shell occlusion):** RECOMMENDATION — skip in v1; rely on alpha to imply ordering. Revisit if it looks wrong.

We follow that recommendation. Reasoning:

- The inner shell is always rendered "in front" via painter's order, so even without a depth resolve it wins where it draws opaque pixels.
- Where the inner shell draws **partial alpha** (band's middle), the outer shell shows through in proportion. This is geometrically incorrect but visually reads as a soft dissolve, which is what we want.
- A correct resolve would require both shells projecting into a shared log-depth target, with a per-pixel min-z resolve at composite. The bookkeeping cost is real; the visual win at our viewing distances is small.

Escape hatch if playtests flag a transition where alpha-only looks wrong: add a screen-space log-depth buffer at composite time and reject back-shell pixels where the front shell's log-depth wins. We expect to need this only for 3↔4 (MW disk against cosmic web) and possibly 7↔8.

## 6. Camera-velocity-aware band widening

A static camera sitting at the band's geometric centre sees a 50/50 blend — correct. A camera **traversing** the band quickly may pass through the entire band in a single frame, seeing only one frame of blend — effectively a hard cut. Fix: widen the band proportionally to the camera's log-distance velocity.

We track the smoothed log-distance speed:

```ts
type CameraVelocityState = {
  lastLogDistance: number;
  lastTimestampMs: number;
  smoothedLogSpeed: number; // dex / second, EMA over ~200ms
};

function updateLogSpeed(state: CameraVelocityState, scale: CameraScale, nowMs: number): void {
  const x = Math.log10(distanceToAnchor(scale.absolutePos, scale.shellOrigin));
  const dt = Math.max(0.001, (nowMs - state.lastTimestampMs) / 1000);
  const instantSpeed = Math.abs(x - state.lastLogDistance) / dt;
  // EMA with τ ≈ 0.2s: alpha = 1 - exp(-dt/τ)
  const a = 1 - Math.exp(-dt / 0.2);
  state.smoothedLogSpeed = a * instantSpeed + (1 - a) * state.smoothedLogSpeed;
  state.lastLogDistance = x;
  state.lastTimestampMs = nowMs;
}
```

The effective band half-width then becomes:

```ts
function effectiveBandHalfWidth(base: number, logSpeed: number): number {
  // Guarantee the band spans at least 4 frames at 60 fps at the current speed.
  // 4 frames @ 60fps = 0.0667s. Speed is dex/s. So minimum band = logSpeed * 0.0667.
  // Band half-width is half of band width.
  const minHalfWidth = logSpeed * 0.0667 / 2;
  return Math.max(base, minHalfWidth);
}
```

At tour-cruise speeds (~17 dex over 90 s ≈ 0.19 dex/s), the minimum half-width is ~0.0063 dex — far smaller than any baseline `W/2`, so widening is a no-op and §3 governs. During keyboard fast-forward (stretch-goal: `→` skips to next shell) speeds of 5–10 dex/s are plausible; the band balloons to ~0.3 dex half-width, keeping the transition visible across ~3–4 frames.

The smoothed log-speed (not instantaneous) prevents a single high-velocity frame from snapping the band wide and back, which would itself flicker. The EMA with τ ≈ 0.2s lets the band expand and contract gracefully.

Widening is **clamped** to `2× base`. Beyond that the band overlaps the next boundary, violating the "no three-shell overlap" invariant. For wider intent (extreme fast-forward to the outermost shell) the right answer is to **skip intermediate shells**, which is a tour-control concern, not transition math.

## 7. Pre-fetch implications

A shell renders meaningfully only when its data slot (per [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md) §"Per-shell data lifecycle") is `READY` or `ACTIVE`. The transition system must therefore **coordinate with the asset slots** so a shell doesn't start fading in before its data is on the GPU.

Protocol:

1. Orchestrator computes `fadeAlphaAt` for every shell each frame.
2. For any shell where `fadeAlphaAt > 0` AND `slot.state !== READY && slot.state !== ACTIVE`, **do not render that shell** and **cap the adjacent shell's `fadeAlpha` at 1** so the visible side stays opaque.
3. Orchestrator emits `shellRequested(shellId)`; the asset-slot subsystem escalates that shell's load priority.
4. Once the slot transitions to `READY`, the next frame evaluates `fadeAlphaAt` normally and the transition begins from wherever the camera currently sits.

A missing inner shell during a fast inward zoom causes the outer shell to "hold" until the inner is ready, then snap into the band — itself a hard cut. Mitigations:

- **Preload window.** When the camera enters any shell, both neighbours (inner and outer) are requested immediately. By the time the camera approaches a boundary, the next shell has had the duration of the current shell (6–11 s of tour time) to load.
- **Tour-time prefetch.** Per [`../shells/00-shell-overview.md`](../shells/00-shell-overview.md): "When the user clicks 'Take the tour,' every shell's data starts loading concurrently." Tour mode therefore degenerates this to a non-issue; only free-fly across an unloaded boundary can hit the snap.
- **Loading freeze.** If a shell is really not ready at the boundary, the camera pauses (auto-tour) or holds outside the band (free-fly) and a soft "loading…" indicator appears. The user never sees a half-rendered shell.

The asset-slot spec lives at `../implementation/06-asset-slots.md` (TBD); its prefetch API must accept a `priority: number` and a `requestedBy: 'orchestrator' | 'tour' | 'user'` discriminant so the orchestrator can jump the queue.

## 8. Edge cases

**Camera reverses direction mid-transition.** Smoothstep is symmetric and `fadeAlpha` is a pure function of position (plus direction-agnostic smoothed velocity). Reversing in the middle of a band is a no-op for the math; the user sees the transition reverse smoothly. No special handling.

**Pause during transition.** Tour pause sets velocity to zero. Smoothed `logSpeed` decays with τ ≈ 0.2s, so within ~600 ms the band shrinks to baseline. Visible alpha can shift by a few percent during contraction. Tiny effect; if it ever reads as "the image is breathing," lock band width on pause until resume.

**Extreme zoom-out from inner shell directly to shell 9 (keyboard fast-forward).** A "skip to outermost" key teleports `absolutePos` from inner-shell distance to ~10 Gpc in one frame. The naive smoothed speed computes `(17 dex) / (16 ms) ≈ 1000 dex/s` for one frame, which post-smoothing widens every band past its clamp. Correct behaviour:

- Detect teleport (instantaneous `|Δx| > 1 dex`) and **bypass velocity widening** for that frame; use baseline bands only.
- Render only the destination shell, even though traversed shells nominally have non-zero `fadeAlpha`.
- Fade the destination in over a fixed 300 ms regardless of camera velocity.

This is a separate teleport code path, gated by a state flag set by whatever controller initiated the jump. The transition math itself stays clean.

**Numerical pathology near `D = 0`.** `log10(0)` is undefined; the camera can sit exactly at the Sun. Clamp `D` to `1e-15 Mpc` (~30 km) before taking the log. At that floor the camera is deep inside shell 1, so `fadeAlphaAt` returns 1 for shell 1 and ~0 for everything else.

**Anchor disagreement.** Each shell uses its own anchor (Sun, LG barycenter, M87, origin), so "distance to the boundary" depends on which shell's anchor we measure from. We **always evaluate `fadeAlphaAt` for shell N using shell N's anchor**. The boundary `D_in` of shell N and the `D_out` of shell N-1 are measured from different anchors and may disagree numerically (e.g., the 3↔4 boundary measured from the Galactic centre vs the LG barycenter differs by ~0.4 Mpc). The asymmetry is invisible because the band is narrow on a log scale and the anchors are stable.

## 9. Test criteria

Automated (Vitest, in `tests/services/engine/scale/shellTransitions.test.ts`):

- For every adjacent pair `(N, N+1)` and every `x` in a 1000-point sweep across the band, `fadeAlpha(N, x) + fadeAlpha(N+1, x) === 1` within 1e-6.
- For every `x` outside any band, exactly one shell has `fadeAlpha > 0` and its value is exactly 1.
- For every `x`, the number of shells with `fadeAlpha > 0` is at most 2 (the no-three-shell-overlap invariant).
- Smoothstep boundary continuity: `d(fadeAlpha)/dx` is finite everywhere; first derivative at the band edges is zero (smoothstep property).
- Velocity-widened band: a band-half-width call with `logSpeed = 10 dex/s` returns `min(2 * base, 0.333)`.
- Teleport handling: a single-frame `|Δx| = 5 dex` bypasses velocity widening on the next call.

Visual (manual, recorded as a 60-fps capture and reviewed frame-by-frame):

- Run the full tour at 1× speed; for each transition, find the median frame in the band and confirm both shells are visibly contributing.
- Run the tour at 5× speed; confirm bands widen and no transition resolves to a single-frame cut.
- Free-fly outward through the 6↔7 boundary at three speeds (slow drag, fast scroll, hold-key); confirm no frame shows a black background between Virgo's X-ray glow and Laniakea's volumetric field.
- Pause the tour at the geometric centre of the 4↔5 band; confirm the rendered image is stable (no breathing) for 5 s.
- Hit the (future) "skip to CMB" key during shell 3; confirm the destination shell fades in over 300 ms with no transient outer shells flashing.

An automated "no flash of black" check is also feasible: in CI, render to an offscreen canvas at every band centre at three velocities and assert no pixel is darker than `(5, 5, 5)`. This guards the "summed alpha = 1" invariant against future renderer regressions (e.g., a shell that forgets to multiply its output by `fadeAlpha`).

## 10. Open questions

1. **Should the band be camera-direction-aware?** A camera moving inward through the 4↔5 boundary is ramping shell 4 up and shell 5 down; a camera moving outward is ramping shell 4 down and shell 5 up. The math handles both symmetrically, but a director might want an *asymmetric* band — e.g., shell 5 fades in earlier when zooming out, so the user sees the wider context before the inner shell disappears. **RECOMMENDATION:** symmetric in v1; add a `bandSkewOnApproach` parameter to `ShellDef` if playtests reveal a specific transition that wants it.

2. **Per-shell renderer cost during fade.** A shell with `fadeAlpha = 0.01` still costs a full render pass. For sub-millisecond passes (shells 1–3) this is fine; for the volumetric Laniakea pass (shell 7) it could be 4–8 ms wasted. Should we cull at `fadeAlpha < 0.05` and accept the small popping risk, or render and accept the cost? **RECOMMENDATION:** profile after Laniakea ships; default to rendering through 0.001.

3. **Three-shell overlap.** Our band-width tuning assumes adjacent boundaries' bands don't touch. The 6↔7 band (W = 0.35) and 7↔8 band (W = 0.30) sandwich shell 7's log-centre at log10(500 Mpc) = 2.7; the 6↔7 outer edge sits at log10(250) + 0.175 = 2.57, the 7↔8 inner edge at log10(1000) − 0.15 = 2.85. Margin: 0.28 dex. Comfortable. But if velocity widening pushes both bands out simultaneously they could overlap. **RECOMMENDATION:** assert in dev-builds; in production, clamp band widths so no overlap can occur.

4. **Interaction with reverse-Z depth.** The `00-scale-architecture.md` spec mandates reverse-Z for depth precision. Each shell's projection matrix flips its near/far semantics. The transition math doesn't care (it works in distance, not NDC), but the per-shell composite to the colour attachment must use a depth-test mode that doesn't accidentally clip the back shell on top of the front. Confirm during implementation. Not expected to be an issue.

5. **Tour scrubber.** If we expose a tour-timeline scrubber (drag to skip to T+0:42), the camera position can jump arbitrarily. This is the same problem as keyboard fast-forward; the teleport edge case (§8) handles it. But the scrubber may also enable *rewinding*, which the velocity smoothing handles correctly. Just flagging that scrubber UX implies the teleport path is exercised in real-user sessions.

---

## Files this design touches

New:

```
src/services/engine/scale/
  shellTransitions.ts         — fadeAlphaAt, handoff, smoothstep
  shellTransitionsCamera.ts   — CameraVelocityState, updateLogSpeed, effectiveBandHalfWidth
src/data/
  shellBoundaries.ts          — D_center and W per boundary (the table in §3)
tests/services/engine/scale/
  shellTransitions.test.ts    — unit tests per §9
```

Modified:

```
src/services/engine/runFrame.ts — orchestration loop consumes fadeAlphaAt per shell
src/data/shellDefinitions.ts    — adds D_in, D_out, anchor per shell
src/@types/                     — ShellDef gains bandHalfWidth_in, bandHalfWidth_out
```

The asset-slot integration (§7) will land alongside `../implementation/06-asset-slots.md`; the orchestrator stub will simply not render unready shells until that spec is in place.
