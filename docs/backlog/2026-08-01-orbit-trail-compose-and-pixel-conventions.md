# `composeOrbitConic` braids three jobs, and the ribbon measures pixels two ways

Two entanglement-radar findings from the orbit-trail ribbon-impostor work
(2026-08-01), both deliberately left unfixed on that branch: neither is a
correctness bug today, and both are refactors whose blast radius exceeds what a
perf branch should carry.

## 1. One function, three separable jobs

`src/utils/camera/composeOrbitConic.ts` does three things braided by a shared
intermediate (`clipXYW`):

- projects the orbit's `(C, A, B)` basis into clip space — consumed by the
  **vertex** stage to trace the ribbon;
- computes the visible eccentric-anomaly arc `[eStart, eSpan]` — consumed by the
  **layer** (to cull) and the vertex stage (to sample);
- inverts the pixel homography into `ginv` — consumed only by the **fragment**
  stage.

Consequences worth fixing, in order:

- **Wasted work on culled orbits.** `orbitTrailsLayer` calls the whole function,
  then culls on `arc[1] <= 0`. An orbit entirely behind the camera has already
  paid an f64 3×3 inverse plus a nine-entry renormalize by the time the cull
  fires. The visible-arc test is a few trig calls and could gate the rest.
- **The three consumers are three different stages** with different precision
  requirements (the f64 hoist matters for `ginv`; the clip basis is fine in f32).
  One function returning a bag of three unrelated things hides that.

Direction: `projectOrbitClipBasis` / `visibleArcOfClipBasis` /
`invertOrbitHomography`, with the layer calling the first two, culling, and only
then calling the third. Keep the f64 seam exactly where it is — the reason it
exists is documented in the module header and is load-bearing.

## 2. Two pixel conventions that happen to agree

- `composeOrbitConic`'s viewport matrix `V` produces **framebuffer** pixels:
  origin top-left, y down. That is what the fragment's `@builtin(position)`
  gives, which is why the fragment consumes `ginv` with no flip.
- `vertex.wesl`'s `clipToPixel` produces **centre-origin, y-up** pixels.

The ribbon is correct only because every quantity the vertex stage derives from
those pixels is a *distance* or a *perpendicular*, and the two conventions
differ by an isometry (translation + y-flip), which preserves both. As of
2026-08-01 that invariant is stated in a comment on `clipToPixel`; it is not
asserted anywhere.

The failure mode is a future change, not current code: introduce any
y-asymmetric quantity into the vertex stage — a directional cap, an anisotropic
width, a screen-space gradient, a dash phase keyed to screen position — and it
breaks silently, with a mirrored artifact that reads as a math error rather than
a convention mismatch.

Direction: make `clipToPixel` emit framebuffer pixels so both stages measure in
one space. Small diff, but it touches the sag/normal derivation that four
rounds of hardware regressions were fought over, so it wants its own commit and
its own hardware pass at the galactic-centre and solar-system poses.

## Why both are deferred rather than dropped

The orbit-trail branch's own history is the argument for eventually doing them:
the subsystem absorbed five rounds of hardware fixes, and the ones that bit
hardest were exactly the places where separable concerns shared a formula.
Neither item is urgent; both are cheap insurance the next time this code is
opened.
