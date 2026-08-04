# Orbit-trail residual speckle at the edge-on Earth-zoom pose

**Status:** deferred by user decision 2026-07-18 — the dominant noise source
was fixed (PR #448, commit `f00c2df4`), but per-pixel speckle in the flared
stroke band is still visible on hardware at Earth zoom. Rendering polish, not
a correctness blocker.

## What was already fixed (don't re-do)

The trail draws a screen-space ribbon impostor per orbit and reconstructs the
conic per fragment via the narrowed inverse homography `ginv`
(`src/services/gpu/shaders/bodies/orbitTrail/fragment.wesl`). At Earth zoom
the camera lies on Earth's orbit plane, so `G` is near-singular
(condition number ~1e15). Commit `f00c2df4` removed the catastrophic
difference-of-products cancellation in the Sampson gradient by hoisting the
exactly-cancelling numerators to CPU f64 as 2×2 minors of `Ginv`. That hoist
was itself replaced 2026-07-31: the fragment now measures the gradient
empirically with screen-space derivatives (`dpdx`/`dpdy` of `r = uLen/z`)
instead, and `composeOrbitConic` returns `{ ginv, clipBasis }` — the minors
are gone entirely. Verified on real hardware at the edge-on Earth pose and at
two even more extreme poses (S-stars at the galactic centre, Neptune seen
from Earth).

**Note (2026-07-31):** the derivative gradient is the same numeric family as
the minors it replaced — the residual speckle below may already be gone.
Re-check on hardware at the next visual pass before continuing to carry this
item.

**Re-checked 2026-08-01** (visible-arc redesign visual pass): the family
survives as dashed/dotted rendering on near-edge-on trails — two dashed
orbits at the solar-system pose, seen from within their own plane. User
verdict: accepted over the perf win; still polish, not a blocker.

## What remains (ranked suspects from the 2026-07-18 investigation)

The residual speckle survives the gradient fix, so it comes from the other
f32 stages of the per-fragment reconstruction. **Note (2026-08-01):** this
attribution is unverified against the project's "multiple sufficient causes"
rule — the ribbon-impostor branch introduced a second sufficient cause with
an identical symptom: the fixed 96-segment ribbon can under-cover a strongly
foreshortened (near-edge-on) trail, where a segment's curve deviates from its
chord by more than `halfWidth`. Rule this out FIRST — it is far cheaper to
test than 1-3 below: raise `SEGMENTS`/`RIBBON_SEGMENTS` to 384 and look; if
the dashes move or vanish, it is coverage, not numerics, and suspects 1-3 are
aimed at the wrong subsystem.

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
- **Interpolated-varying stroke** (the visible-arc redesign's unbuilt third
  dial, 2026-08-01): the CPU already clips each orbit to its visible E-arc
  and the ribbon vertices already know their exact E and signed pixel offset
  from the curve — pass those as varyings and derive stroke distance and
  Kepler phase by interpolation instead of per-fragment back-projection. The
  ill-conditioned `ginv` chain leaves the fragment entirely; accuracy then
  rests on sample density (pairs naturally with adaptive-in-curvature
  sampling, the unbuilt second dial). Biggest rewrite, strongest fix.
- **f32 error-compensated evaluation** (two-sum / Kahan-style on `q`) — ruled
  out 2026-07-31: hardware-proven DEAD on this toolchain, Dawn/Metal
  fast-math breaks the error-free transformations it depends on (see
  `docs/references/orbit-trail-fragment-math.md`).

Reproduce: zoom fully to Earth, orbit until the camera is in Earth's orbit
plane; the blue stroke band flares and stipples (user screenshot in the
2026-07-18 session; `.superpowers/sdd/orbit-trail-speckle-report.md` has the
full pipeline map while the worktree lives).
