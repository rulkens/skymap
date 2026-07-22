# Celestial-sphere morph toggle ("The Constellation Lie" mode)

**Status:** needs-design (deferred from the constellations feature, grill Q9 —
`docs/grill-sessions/constellations-2026-07-22.md`)

## The idea

A toggle (settings + tour primitive) that morphs every star between its true 3D
position and its projection onto a fixed celestial sphere — collapsing the sky
back to the 2D fiction and releasing it again. With the constellations layer
shipped, the lines make the point unmistakable: figures assemble into their
familiar shapes as the sphere forms, and shear apart as the real distances
return. Ranked the app's most "only this app can do this" moment in
`docs/research/2026-07-19-feature-ideation-clips-to-social.md` (as part of the
"Constellation Lie" / "Great Unfolding" clip ideas).

## Why deferred

- It moves the *stars*, not an overlay: a per-star morph uniform in the star
  shader's hot path (millions of instances; the position math is the vertex
  bottleneck the perf work keeps shaving).
- Needs choreography decisions: morph duration/easing, what the camera does,
  what happens to famous-star bodies (they're scene bodies, not bin points),
  how constellation lines and labels track the morph (their endpoints are baked
  positions in the artifact — they'd need the same morph applied in their
  shader to stay attached).
- Wants tour integration (a driver-table clip source per the animation-runner
  design) more than a bare settings toggle.

## Sketch of the mechanism

Sphere projection is `normalize(positionPc) * R` for a chosen sphere radius R;
a single uniform `morph ∈ [0,1]` lerps between true and projected positions in
the star vertex shader (and identically in the constellation line + label
anchor paths). R choice and whether magnitudes re-normalize during the morph
(apparent brightness is distance-coupled) are the open design questions.

## Prerequisites

- Constellations layer shipped (makes the effect legible).
- Perf headroom check on the star vertex path before adding per-vertex morph
  math (`npm run perf`, NEAR0 scenarios).
