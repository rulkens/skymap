# Equirectangular texture quality degrades at a body's poles

Deferred out of the analytic-sphere grill
([session](../grill-sessions/analytic-sphere-primitive-2026-07-28.md)).

**Not visually confirmed.** The mechanism below is derived from the shader, not
from a screenshot. Fly to the Moon or Mars, frame a pole, and check whether the
polar cap reads mushy before spending anything on this — the whole item may be
sub-pixel in practice.

## The mechanism is `u`, not `v`

The grill and the plan both state the cause as "`v = asin(z)/π` has unbounded
derivative at the poles". **That does not hold.** For a point on the unit sphere at
colatitude θ, `dir.z = cos θ`, so
`v = asin(cos θ)/π + 0.5 = 1 − θ/π` (`lib/analyticSphere.wesl:169-173`) — exactly
linear in colatitude. `asin`'s singularity cancels against the geometry, and
`∂v/∂(arc length)` is the constant `1/π` everywhere on the sphere, poles included.

The divergent coordinate is `u = atan2(y, x)/TAU`
(`lib/analyticSphere.wesl:171-172`). Longitude changes by `1/sin θ` per unit of
surface arc, so `|∇u| ∝ 1/sin θ` and diverges at both poles. That is inherent to
the equirectangular parameterisation, not to the analytic path — the map itself
crams every texel of its top and bottom rows onto one point.

## Why it costs quality

Both texture reads use `textureSampleGrad` with a hand-computed gradient pair
(`texturedBody/fragment.wesl:117-118`). Mip selection from an explicit gradient
pair is isotropic: the hardware takes the larger footprint of the two axes. Near a
pole the `u` footprint is enormous while the `v` footprint is unchanged, so the
sample drops to a coarse mip in **both** axes and the polar cap loses its latitude
detail along with its longitude detail. The correct filter there is anisotropic —
average widely along `u`, narrowly along `v` — which explicit-gradient sampling
cannot express.

The sampler carries no `maxAnisotropy` (`texturedBodyRenderer.ts:213-220`), so it
defaults to 1 and no hardware anisotropy is available to soften this.

## Why the wrap trick does not help — and where it would actively hurt

`equirectUvGradients` (`lib/analyticSphere.wesl:178-195`) builds two `u`
parameterisations half a turn apart and takes the smaller-magnitude derivative per
axis, so a quad straddling the antimeridian discards the spurious whole-turn jump.
It solves a **seam** problem: a false large derivative where the true one is small.
The pole problem is the opposite — a true large derivative that mip selection then
applies to the wrong axis. Nothing the wrap trick can do about that.

Worse, the trick's stated assumption is that "any quad small enough to matter
straddles at most one of the two" (`lib/analyticSphere.wesl:60-67`). Within a very
small neighbourhood of the pole the honest per-pixel `|du|` exceeds 0.5, both
candidates read as wrapped, and the min-magnitude select returns an under-estimate —
too sharp a mip, so aliasing rather than blur. That region is roughly
`arc-per-pixel / π` radians across, i.e. sub-pixel at any framing where the body
fills a few hundred pixels, so it is a footnote, not the item.

## Whether it is worse than the mesh path it replaced

Unverified, and probably not. The deleted mesh path interpolated `u` per vertex,
and near a pole the triangle fan converges so per-pixel `du` grows the same way.
The degradation is a property of the equirect map under isotropic filtering, shared
by both paths. What is new is that the analytic path is now the _only_ path, so
there is no fallback to compare against in-app.

## Approach options

1. **Set `maxAnisotropy` on the body sampler.** One field
   (`texturedBodyRenderer.ts:213-220`). Cheapest by a wide margin. Needs
   verification that the backend honours anisotropy on `textureSampleGrad` — the
   WebGPU spec leaves the interaction implementation-defined, and it must be
   checked on WebKit as well as Dawn.
2. **Clamp the `u` gradient near the pole.** Cap `|dudx|`/`|dudy|` so the mip is
   chosen from `v` once `sin θ` drops below a threshold, accepting longitude
   aliasing to keep latitude detail. Shader-local, no sampler or pipeline change,
   but it trades one artifact for another and needs a tuned threshold.
3. **Manual anisotropic taps.** N samples spread along the `u` footprint, folded.
   Correct, and the fragment already has the exact gradient pair to place them —
   but it multiplies the texture reads on a fragment that already does two, on a
   pass that is fill-bound at close approach.
4. **Stop using equirect.** A cube map kills the antimeridian seam and the pole
   singularity together. Correct at the root, and by far the largest: it changes
   the bake pipeline (`tools/textures/`), the atlas, `texturePrimeMeridianU`, and
   every consumer of `equirectUvFromDir` including `earthRenderer`.

Options 1 and 2 are mutually substitutable; 4 subsumes all of them.

## Adjacent, pre-existing: the tangent frame is degenerate at the pole

`texturedBody/fragment.wesl:116` builds the east tangent as
`normalize(cross(vec3(0,0,1), ng))`. At either pole `ng` is parallel to `+z`, the
cross product is the zero vector, `normalize` yields NaN, and `perturbNormal`
(`lib/normalMap.wesl:48-50`) propagates it — the Gram-Schmidt does not rescue it.
Affects the pole texel and its immediate neighbours only.

Not a regression: the deleted mesh fragment built the tangent from the same
`cross(+z, ng)`. Filed here because it is at the same pixels, so whoever looks at
the poles will meet both.

## Files

- `src/services/gpu/shaders/lib/analyticSphere.wesl:52-67,169-195` — the uv, the
  wrap trick, and the assumption that fails at the pole.
- `src/services/gpu/shaders/bodies/texturedBody/fragment.wesl:105-118` — the
  gradient pair and the two `textureSampleGrad` reads.
- `src/services/gpu/renderers/bodies/texturedBodyRenderer.ts:213-220` — the
  sampler, and where `maxAnisotropy` would go.
- `src/services/gpu/shaders/bodies/earth/fragment.wesl` — the second equirect
  consumer, which option 4 would have to carry.
