# Accurate orbit trails via screen-space conic projection

**Readiness:** needs-design (approach chosen by the user 2026-07-10; needs a spec + plan)
**Area:** Rendering / zoom-to-Earth

## Problem

The zoom-to-Earth debug orbit rings (plan 02 ad-hoc, PR #425) draw perfect
circles as plane-quad SDFs: a unit quad in the orbital plane whose fragment
evaluates `d = |length(p) − 1|` with fwidth AA. Two limitations the user wants
removed:

1. **Not real orbits.** Circles in the ecliptic; no eccentricity, inclination,
   node, or periapsis. The user wants accurate trails from real orbital
   elements (a, e, i, Ω, ω — J2000 mean elements per body).
2. **f32 breakdown at deep zoom.** The fragment works in unit-orbit space;
   f32 carries ~7 significant digits, but at Earth-surface zoom the stroke
   needs the distance field resolved at ~1e-11 of the orbit radius —
   catastrophic cancellation in `length(p) − 1`, visible as a steppy/jittery
   line exactly where the user wants to look. No ellipse-SDF variant in that
   coordinate space fixes this.

## Chosen approach (user-ratified 2026-07-10): screen-space conic

A Keplerian orbit is an exact ellipse in its orbital plane; an ellipse under
perspective projection is still a conic. Per frame, per orbit (CPU, f64 —
same compose-then-narrow philosophy as `composeBodyMvp`):

- Build the orbit's 3×3 conic matrix from the elements + parent position,
  compose through the f64 NEAR0 slab view-projection into **pixel-space**
  conic coefficients, plus the inverse homography (screen → orbit plane).
- Fragment (fullscreen or generous bounding quad, hdr additive): evaluate the
  quadratic at the pixel and use **Sampson distance** for a constant-width AA
  stroke. Pixel coordinates are O(1000) — numerically benign at every zoom;
  the ellipse is mathematically exact, so no tessellation and never a sharp
  segment.
- **Trail brightness** (recency model, user-specified on the circle version):
  back-project the pixel through the inverse homography to orbit-plane
  coords → anomaly; falloff `exp(−k · angle-behind-body)`. For real accuracy
  use **mean anomaly** (Kepler's equal-area speeds — faster fade near
  periapsis); the back-projection is only used for brightness (slowly
  varying), so its own f32 cancellation at deep zoom is harmless.

## Known gotchas (from the design discussion)

- **Behind-camera arc**: the projective image of the conic includes points
  behind the camera; clip via the sign of the back-projection's w.
- **Edge-on degeneracy**: the projected conic degenerates toward a line
  pair/parabola/hyperbola as the orbit plane goes edge-on; Sampson distance
  handles general conics — do not assume ellipse-only coefficients.
- **Elements data**: J2000 mean elements for Earth, Jupiter, Moon (Moon's
  elements are relative to the ecliptic, orbiting Earth). Seed alongside
  `sceneBodies.ts`; verify values against JPL approximate elements before
  spec'ing (feedback: verify external data before spec).

## What it replaces / consumes

- Replaces `orbitRingRenderer` + `shaders/orbitRing/*` + `orbitRingsLayer` +
  `SCENE_ORBITS`/`composeOrbitMvp` (the circle version shipped in PR #425 as
  the interim debug affordance — delete when this lands).
- Consumes `ECLIPTIC_BASIS` (`src/data/bodies/eclipticBasis.ts`), the NEAR0
  f64 slab vp, the (hdr, NEAR0) frame step, and the body seeds.
- Related: the label/ring flicker investigation (same session) may land
  f64-seam fixes in the label path that this feature should stay consistent
  with.
