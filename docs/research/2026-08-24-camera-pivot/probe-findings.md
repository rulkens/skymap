# Tilt/look probe findings — feel calibration on the pre-pivot camera (2026-08-24)

Results of the throwaway shift+drag tilt/look probe run on branch
`earth-surface-navigation` (commits `6c428ddd6..04c1d5223`, PR #623). The branch
is expected to close unmerged; this file is the surviving record. Everything
below was measured through the real gesture path (headless drives of
`attachOrbitControls`), not estimated. It confirms and sharpens
[DESIGN-INPUT.md](DESIGN-INPUT.md) §1's state-vector verdict from the
implementation side.

## What the probe shipped (feel reference)

- Tilt sweep: nadir → the ground's limb (80° off nadir at 100 km altitude, 60°
  at 1000 km) → hard pin at ~83° + frame latitude off nadir. Monotone, no
  fold-back, no flip.
- Look-around: horizontal shift+drag rotates heading about the standpoint's
  local vertical, 0.29°/px, at any tilt including while pinned; eye, altitude
  and the sub-eye ground point held to the bit (0.0e+0 km drift).
- Heading-then-tilt composition (KML Z-then-X): tilt swings inside the vertical
  plane the heading chose. Before this ordering, tilting about screen-right
  (frame-pole-derived) dragged ~10° of unwanted heading per 60 px of tilt.

## Defect 1 — fold/flip near the frame pole (fixed in-probe)

The screen basis was `aim × upRef`; carrying the aim across the orientation
frame's pole reversed it — 2.86°/event backwards tilt walk plus a 177°
screen-up jump (end-over-end horizon flip). The existing `PITCH_LIMIT` only
refused within ~1° of the pole, long after the zone was unusable. Probe fix:
refuse any step bringing the aim within 0.1 rad of the pole axis (worst
backwards step 0.00°, worst screen-up jump 2.9°/event = the tilt rate itself).
The 0.1 rad margin is a probe number, measured not derived.

## Defect 2 — the sky ceiling is latitude-dependent (parameterization, unfixable in-probe)

The angular ceiling is set by the pose, not altitude: ~83° + frame latitude off
nadir. Over the frame equator the sky is unreachable (~7° below level); at
frame latitude 45° there are ~39° of open sky above level; at 80°, far more.
No yaw/pitch pose can look through the frame pole — a pose constraint,
independent of any up-vector choice. Cure: a camera-own up reference, i.e. the
pivot.

## Defect 3 — the rendered up ignores the surface normal (parameterization, unfixable in-probe)

The user's on-device verdict ("very buggy — doesn't take the actual normal of
where we stand into account") localized here, NOT in the gesture math: heading
and tilt axes were already exact against the standpoint's real normal. What
rolls is screen-up, which derives from the frame pole. Measured horizon roll at
60° tilt, by frame latitude × azimuth:

- 90° (horizon fully vertical) looking dead east from the frame equator
- 34° over Denmark's latitude
- 0° only looking due frame-north/south

Substituting the standpoint's local vertical as the up reference measures 0.0°
roll in every latitude × azimuth cell (local _north_ is no better than the
pole — only the vertical works, since `lookAt` needs `view × up` horizontal).
Its price: at exact nadir the local vertical IS the view axis (|screen right| →
0 / non-finite at 0° tilt, 1.000000 at 0.1°) — the degenerate point is the pose
surface navigation spends its life in. Bridging it requires **heading held as
camera state**; the incumbent pose (target, yaw, pitch, distance) carries no
roll and the render path never reads one.

## Why none of this can be a probe patch — the three-site invariant

The up basis is today a pure function of frame-global state, and exactly
because of that it is **re-derived independently at three sites**: the frame
loop, the pick-frame context (whose comment states the purity assumption), and
the live render camera (hover/reconcile/debug). A local, pose-dependent up
breaks that assumption and desynchronizes the pick ray from the drawn pixel on
every tilted view. Threading a camera-owned basis through all three IS the
pivot's "camera owns its resolved basis" — there is no smaller diff.

## Residuals measured in the sky regime (stable, for the spec)

- Drag after tilting is not ground-locked: with the pivot ~8800 km off in the
  sky, a 40 px orbit drag cost ~9 km of altitude. Needs the body-relative
  camera.
- Zoom in the sky regime is near-inert (cursor misses the body; one notch ≈
  11 km of distance, altitude unchanged) — benign, not dangerous.
- Everything stayed finite through tilt → zoom → drag → tilt-back; recovery
  clean.

## Net input to the pivot spec

All three defects are the same missing thing. Surface camera state =
**(standpoint on the body, heading, tilt, range)** with the basis resolved
**once** from the standpoint's ENU and carried on the camera rather than
re-derived per consumer:

- heading as state makes nadir continuous (defect 3's degeneracy),
- the ENU basis levels the horizon everywhere (defect 3's roll),
- tilt measured against the local zenith makes the sweep latitude-independent
  (defect 2),

which is DESIGN-INPUT §1's pose-storage verdict arrived at from the opposite
direction: the probe demonstrates the incumbent parameterization failing at
precisely the joints the research predicted.
