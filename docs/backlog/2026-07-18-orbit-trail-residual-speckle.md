# Orbit-trail residual speckle at the edge-on Earth-zoom pose

**Status:** deferred by user decision 2026-07-18 — the dominant noise source
was fixed (PR #448, commit `f00c2df4`), but per-pixel speckle in the flared
stroke band is still visible on hardware at Earth zoom. Rendering polish, not
a correctness blocker.

## What was already fixed (don't re-do)

The trail draws one fullscreen triangle per orbit and reconstructs the conic
per fragment via the narrowed inverse homography `ginv`
(`src/services/gpu/shaders/bodies/orbitTrail/fragment.wesl`). At Earth zoom
the camera lies on Earth's orbit plane, so `G` is near-singular
(condition number ~1e15). Commit `f00c2df4` removed the catastrophic
difference-of-products cancellation in the Sampson gradient by hoisting the
exactly-cancelling numerators to CPU f64 as 2×2 minors of `Ginv`
(`src/utils/camera/composeOrbitConic.ts` returns `{ ginv, minorS, minorT }`;
the fragment's `dsdp`/`dtdp` are now affine). Verified: at the edge-on pose
the old f32 gradient erred ~54 %, the minors path tracks f64 to ~2.5e-5
(`tests/utils/camera/composeOrbitConic.test.ts`). A math-critical review
independently re-derived the algebra and confirmed the k² rescale invariance.

## What remains (ranked suspects from the 2026-07-18 investigation)

The residual speckle survives the gradient fix, so it comes from the other
f32 stages of the per-fragment reconstruction:

1. **`q.z` noise near the horizon line** — `q = ginv · (px, py, 1)` is f32;
   near the horizon `q.z → 0`, so `s = q.x/q.z`, `t = q.y/q.z`, and hence
   `r − 1` carry amplified relative error even with a perfect gradient. The
   Sampson ratio `|r−1|/|gradR|` cancels the blow-up only in exact
   arithmetic.
2. **Newton horizon-rejection threshold flicker** — the refine step
   (`fragment.wesl`, the `rStep`/`REFINE_TOL` discard) recomputes `r` through
   the same ill-conditioned chain and binarizes on a hard threshold; per-pixel
   flips concentrate at the band boundary.
3. **Hard coverage discards as noise binarizers** — `!(dist < STROKE_PX)`
   turns any residual `dist` noise into on/off stipple instead of a smooth
   AA gradient. Softening coverage (write a smooth stroke, drop the hard
   discard) would convert residual noise into faint blur — possibly an
   acceptable visual even without fixing 1–2.

## Fix directions (pick at spec time)

- **Evaluate the conic implicitly in clip space**: pass the conic matrix
  `C = Ginv^T · diag(1,1,−1) · Ginv` (computed in f64, normalized) instead of
  `Ginv`; `p^T C p` and `∇(p^T C p) = 2Cp` need no per-fragment division at
  all — removes the `q.z` amplifier entirely. Bigger shader rewrite; the
  Sampson structure changes.
- **Soften the discards** (suspect 3) — cheap, worth trying first; may
  suffice visually.
- **f32 error-compensated evaluation** (two-sum / Kahan-style on `q`) —
  middle ground, WGSL-verbose.

Reproduce: zoom fully to Earth, orbit until the camera is in Earth's orbit
plane; the blue stroke band flares and stipples (user screenshot in the
2026-07-18 session; `.superpowers/sdd/orbit-trail-speckle-report.md` has the
full pipeline map while the worktree lives).
