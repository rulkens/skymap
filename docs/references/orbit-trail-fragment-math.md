# Orbit-trail fragment math — derivations

The hard-won reasoning behind `orbitTrail/fragment.wesl`'s `fs`, moved here
under the project's comment budget (`docs/superpowers/conventions/comments.md`):
this is derivation and rejected-alternative history, not a landmine a reader
hits at the call site. The shader itself keeps one-line pointers into the
sections below, at the code each one guards.

## Why the fragment's f32 is safe

`pos` (the fragment's `@builtin(position)`) is O(1000) pixels; `Ginv` maps it
to O(1) plane coordinates, so `q = Ginv * pos` and everything derived from it
are well-conditioned — none of the tiny-Mpc cancellation that broke the old
unit-orbit-space SDF at deep zoom survives into pixel space. The
back-projection feeds only the slowly-varying brightness, so even a sub-pixel
f32 error in `Ginv * pos` produces an invisible brightness error. That is
precisely why the back-projection is allowed to run on the GPU at all — the
f64 hoist happens once, upstream, in `composeOrbitConic`.

## Why plane-space distance, not the algebraic (Sampson) conic value

The projected orbit is a general conic, and at Earth-surface zoom the camera
sits essentially ON its own orbit (camera-to-Earth is ~1e-4 of the orbit
radius) — the maximally edge-on pose, which is the PRIMARY viewing condition
here, not an edge case. The first-order Sampson distance `abs(f) / length(grad
f)` linearises the algebraic conic `f = q.x^2 + q.y^2 - q.z^2`, whose gradient
magnitude and curvature swing violently where the projected conic turns
sharply; its constant-width band fans out into rays around that turn (the
flare).

Instead the shader measures distance in PLANE space, where the orbit is
simply the unit circle `s^2 + t^2 = 1`. There, `r - 1` (with `r = uLen / z`)
is the EXACT Euclidean distance to the orbit — a true distance function, with
no algebraic-curvature term to blow up. At well-conditioned poses this equals
Sampson to the pixel; at the edge-on pose it stays a thin line where Sampson
flared (verified numerically over the earth / jupiter / moon conics).

## Why the gradient is measured with screen-space derivatives

The pixel gradient of `r` is measured EMPIRICALLY with the hardware's
screen-space derivatives `dpdx`/`dpdy` rather than derived analytically: `r`
is O(1) near the stroke, so the hardware's finite difference across the
fragment's 2×2 quad happens AFTER the divide by `z`, and cannot suffer the f32
cancellation an analytic pixel-space gradient does for a hugely-projected
orbit — S-stars at the galactic centre, Neptune seen from Earth: the analytic
gradient produced sub-pixel dotted bands on hardware, with the Newton check
killing nearly every pixel along the stroke.

## Compensated arithmetic (Dekker/TwoSum) is dead on this toolchain — do not reintroduce it

This has been proposed more than once as the fix for the analytic-gradient
cancellation above, and rejected both times, hardware-verified: the WGSL
compiler's fast-math on this toolchain breaks the error-free transformations
Dekker/TwoSum-style compensated summation depends on, so it silently recovers
nothing — no error, no warning, just the same cancellation with extra
instructions. The empirical-gradient fix above is what actually works. Read
this section before re-deriving a compensated-arithmetic fix; it costs a
hardware round-trip to reverify each time.

## Why the forward Kepler map (M = E − e·sin E)

The trail fades with MEAN anomaly so the tail tracks the body's real
(equal-area) angular speed. Converting the pixel's eccentric anomaly `E` to
mean anomaly is Kepler's equation in the FORWARD, closed-form direction — `M
= E − e·sin(E)` — which needs no root-find on the GPU (the inverse, `M → E`,
would).

## Why the off-stroke discard is a `discard`, not a zero write

Every pixel the ribbon impostor rasterizes runs this fragment, so writing 0
off the stroke would be transparent under additive blend — fine in the
well-conditioned case. But at a near-degenerate pose the inverse homography
`Ginv` can carry non-finite entries, and then `q` and `dist` are NaN across
the ribbon's whole in-front-of-camera footprint; an additive NaN write paints
a solid black smear. Guarding with `!(dist < STROKE_PX)` — true for NaN —
discards both the off-stroke pixels and any non-finite one, so the ribbon can
only ever deposit light on the ring itself, never a filled blob. The same
keep-form logic protects the Newton horizon-rejection discard: the old
reject-form test (`abs(rStep - 1.0) >= REFINE_TOL`) let a non-finite `rStep`
fall through and paint at full brightness, because a NaN comparison is always
false in EITHER direction — only requiring the KEEP condition true routes
every non-finite path into the discard.

## Why occlusion is an eye→point segment test against the resolved bodies

There is no body depth to test against. Bodies here are analytic spheres, and
the painter chain clears depth per row (spec §7.3), so by the time the trails
draw — after the `foreground:0 → hdr` composite, `HdrPhase 'post-foreground'`
— nothing of the bodies survives but their colour. The fragment therefore
re-derives its own orbit point `x` from the eye-relative 3D basis
(`eyeRelativeOrbitBasisKm`) and tests it against the frame's resolved bodies
as spheres (`selectOccluderSpheresKm`).

The test is the SEGMENT eye→`x`, not the infinite ray: the closest-point
parameter is clamped to `[0, 1]`. That clamp is the whole near/far split — a
near-arc point's closest approach is `x` itself, outside every sphere it
passes in front of, while a far-arc point's lands mid-segment, inside the
sphere it hides behind. A body's own trail runs INTO its sphere, so the head
fades out at the limb rather than crossing the disc.

Kilometres, because eye-relative Mpc magnitudes are denormal in f32 and some
GPUs flush them to zero (the same landmine that painted a black nadir disc).
The f32 error is sub-pixel at every distance the trails span: everything in
the test is eye-relative, so absolute error grows as `eps · |x|` while the
sphere radius it is compared against grows the same way — the ratio is `eps`
per radian of angular size, i.e. ~6e-8 rad, ~6e-5 px on a 1000-px viewport.
