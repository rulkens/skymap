# Tour — cinematography

Motion grammar. Bridges each stage's `motion` to the engine primitives.
Stage `requires` tags are defined here; the checklist at the bottom is the
engine spec's input.

## The one hard constraint: logarithmic scale

~0.05 → ~6,000 Mpc, 5 orders of magnitude. Lerp raw framing distance and the
first 1% of a leg blows through the local universe while the rest crawls.
Interpolate `logDist = ln(framing distance)` → constant perceived zoom
(uniform decades/sec, the Eames dolly). This is the load-bearing fact.

## Camera model: a path generated from waypoints

The camera flies a spline path **generated from the waypoints** — free to
pull back, swing, bank, and fly past. It is *not* locked to orbiting a fixed
point. Per waypoint the engine resolves a keyframe:

```
CameraKeyframe = {
  focus:   Vec3      // the subject framed / looked at
  logDist: number    // ln(camera→focus distance); scale, splined in log space
  azimuth, elevation // approach angle around the subject (freely authored)
}
eye = focus + dir(azimuth, elevation) · exp(logDist)   // camera position, per frame
```

- `focus` track and `logDist` are **semi-independent**: axial pull = focus
  still + logDist grows; lateral move = focus slides + logDist held.
- Look is toward `focus` by default; a stage may offset it to lead the path
  (look-ahead).
- Implementation substrate is the existing orbit camera (`target=focus`,
  `distance=exp(logDist)`, `yaw/pitch=angle`) — it maps directly, but the
  design treats the camera as free, not orbit-bound.

## Waypoints in, spline out

Author lists **waypoints** (a stage = a waypoint). Engine: (1) resolves each
`focus`+framing → a keyframe; (2) fits a **Catmull-Rom** through the
keyframes (passes through them, no hand tangents); (3) reparam by arc length
in scale space (uniform speed); (4) evaluates per frame → camera.

- **Stop** (`dwell_s>0`): arrive, ease to rest, hold (with drift), show
  text, apply effects.
- **Pass-through** (`dwell_s:0`): a control point that *bends* the path at
  constant speed — turns hops into a flythrough.

## Motion vocabulary (`motion` → `requires`)

| Term | Camera does | tag(s) |
|---|---|---|
| log-dolly | grow/shrink `logDist` along the look axis (the spine) | `log-dolly` |
| local-orbit | slowly advance the approach angle around a held focus | `dwell-drift` |
| dwell-drift | gentle continuous motion at every stop (default, not special) | `dwell-drift` |
| lateral-lean | shift `focus` toward the next subject during a dolly | `lateral-focus` |
| lateral-flythrough | bend through pass-through waypoints at constant speed | `pass-through-spline`, `lateral-focus` |
| lateral-drift | move `focus` laterally at held `logDist` | `lateral-focus` |
| orbit-reveal | wider/slower local-orbit at a structural stop | `dwell-drift` |
| arrival-settle | ease-in at end of travel into a stop | `ease-in-out` |
| look-ahead (opt) | offset look from `focus` toward travel direction | `look-offset` |

The closing return is just an inward `log-dolly` back to the opening
keyframe — no new primitive.

## Easing

- **Stops** ease in *and* out (`easeInOutCubic`) — soft departures are most
  of the cinematic feel.
- **Pass-throughs** hold constant speed (no ease, or it stutters).
- Easing is **per-segment** → a tween *parameter*, not a hardcoded curve.
  (`requires: ease-in-out`)

## Dwell is never frozen

Zero-motion holds read as a bug. Every stop carries a slow drift (a few
degrees of approach angle over the dwell, maybe a slight push-in) — small
enough not to fight the text, enough to feel alive. A dwell *evaluates a
tiny orbit*, it doesn't *wait*. (`requires: dwell-drift`)

## Effects can animate

Cosmic-web wants filaments + density volume to **fade in** as the camera
pulls out — a snap-on glitches. An effect may carry `ramp_s` and tween its
intensity over the leg; without it, toggle instantly (common case).
(`requires: animated-effect` where it ramps)

## Text timing

Stage text (title + narration) is its own layer: fades **in** on settle (not
during travel — reading while moving is uncomfortable), holds, fades **out**
before the next leg. Sets the **dwell floor** — `dwell_s` ≥ comfortable
reading time. (`requires: caption`)

## Primitive checklist (collated `requires` → engine work)

Union of every stage's `requires`. **This is the input to the engine spec.**

| Tag | Engine primitive |
|---|---|
| `log-dolly` | interpolate `logDist` (not raw distance) along the look axis |
| `pass-through-spline` | Catmull-Rom through N keyframes, arc-length reparam |
| `lateral-focus` | spline the `focus` track independent of `logDist` |
| `ease-in-out` | easing as a per-segment tween parameter |
| `dwell-drift` | a dwell that evaluates a slow orbit, not a static wait |
| `animated-effect` | effects with optional `ramp_s` intensity tween |
| `caption` | a label producer rendering the active stage's title + narration |
| `arbitrary-point-focus` | `focus` can be an arbitrary `point(Vec3)` (horizon zoom) |
| `look-offset` | (optional) offset look direction from `focus` for look-ahead |
| `auto-reveal` | none — relies on shipped auto-render (horizon shell, "You are here") |
| `flow-field` | none new — toggles the shipped CF4++ flow layer as an animated effect |

**Driver consequence:** `log-dolly` + `pass-through-spline` + `dwell-drift`
mean the tour subsystem must **own the camera per-frame** — own a global tour
clock and evaluate the spline + dwell-orbit into the camera — not fire
one-shot tweens through `tweenManager`.
