# starRenderer goes analytic, and the gas giants get their flattening

Deferred out of the analytic-sphere primitive
([grill Q2/Q3/Q7](../grill-sessions/analytic-sphere-primitive-2026-07-28.md)).
`texturedBodyRenderer` and `bodyPickRenderer` now ray-trace an analytic sphere;
`earthRenderer`, `starRenderer` and `planetRenderer` stayed on the 48×24 mesh.
Two of the things that stayed behind are filed together here because they meet at
the same joint: what the analytic primitive does when a body is not round.

## The prerequisite the grill named has already shipped

The grill coupled the two halves on a shared blocker — `camPosLocal` had to learn
about flattening before either could move. It has: `camPosLocal.ts:89-95` takes an
optional `oblateness` (default 0) and divides the polar component by
`radiusMpc·(1 − oblateness)` (`camPosLocal.ts:110,121`), landing the ray origin in
the frame where the body is the unit sphere. `drawFlooredSpherePick.ts:96-113`
already feeds it, and `starSpheresLayer.ts:178` already passes each star's real
`oblateness` through.

So the coupling argument is spent, and the two halves are more separable than the
grill assumed. Read the sections below independently; the shared design surface is
the last one.

## Half one — `starRenderer` on the analytic path

`starRenderer` is the only renderer where the silhouette carries all the shape
information: `star/fragment.wesl:41-43` is `u.tint * EMISSIVE` with no varyings, no
texture, no terminator. A 48-gon against black space is where faceting reads worst,
and the Sun is a body you can fly right up to.

What it needs, all verified against the current renderer:

- **`camPosLocal` in the uniform block.** `TintedSphereUniforms` is 80 bytes —
  mat4x4 mvp + vec3 tint + one trailing pad float
  (`starRenderer.ts:47-53`, `lib/sphere.wesl`). The pad slot is 4 bytes and
  `camPosLocal` needs 12, so unlike the pick struct's `packedId` trick this one
  does grow: 80 → 96.
- **A packer.** `starRenderer.ts:161-167` builds the block inline in `draw` —
  `uniformScratch.set(mvp, 0)` then three indexed colour writes. Every other body
  uniform goes through a `utils/gpu/pack*Uniforms.ts` (`packLitBodyUniforms`,
  `packTexturedBodyUniforms`, `packRingUniforms`, `packAtmosphereUniforms`); there
  is no `packTintedSphereUniforms`. Adding a second field to a hand-rolled inline
  write is the point at which the packer earns itself.
- **The pipeline flip.** `cullMode: 'back'` → `'front'`
  (`starRenderer.ts:147-151`), `PROXY_SCALE` on the vertex position, and
  `@builtin(frag_depth)` from `fragDepthFromLocal` — all already in
  `lib/analyticSphere.wesl`.
- **Per-draw uniforms.** The renderer writes one shared uniform buffer per draw
  (`starRenderer.ts:88-113,167`), which is its own filed item —
  [star-renderer-uniform-buffer-race](2026-07-29-star-renderer-uniform-buffer-race.md).
  Today that is latent. An analytic star reads `camPosLocal` out of the same block,
  so a clobbered uniform stops being "the wrong tint" and becomes "the ray origin
  of a different star" — a body drawn at the wrong silhouette entirely. Fix the
  buffer first.

**What it does NOT need: ellipsoid normals.** A flat-emissive fragment has no
normal. `composeBodyMvp.ts:139-142` bakes the flattening into a non-uniform model-Z
scale, so an oblate star is still the unit sphere in the local frame the ray test
runs in, and `camPosLocal`'s oblateness parameter puts the origin in that same
frame. The six oblate seeds (`famousStars.generated.ts` — Altair 0.2, Achernar
0.35, plus four more between 0.16 and 0.275) come along for free. That changes if
the star fragment ever gains limb darkening or granulation, which
`star/fragment.wesl:4-7` names as future work.

## Half two — flattening Saturn and Jupiter

Both render as perfect spheres today. Real flattening is 0.0649 (Jupiter) and
0.098 (Saturn), and `composeBodyMvp` already accepts the parameter — but nothing
carries the value: `PlanetBody` (`src/@types/scene/PlanetBody.d.ts:17-22`) has
`id`, `label`, `radiusKm`, `albedo` and nothing else, and neither
`planetsLayer.ts:134-140` nor `texturedBodiesLayer` passes an oblateness argument.

The blocker is not the seed field. It is that **the atmosphere shell is spherical
and its ground radius is a scalar**.

`atmosphereShellLayer.ts:92-98` composes the shell's proxy with no oblateness
argument, and `packAtmosphereUniforms.ts:75` takes `bottomRadius =
planetRadiusKm / atmosphereTopKm` — one number, no axis. Both gas giants carry an
`ATMOSPHERE_PARAMS` row (`atmosphereParams.ts:167-208`), so both draw a shell.
Flattening the surface without flattening the shell:

| body    | equatorial radius | flattened polar radius | shell top (unflattened) | polar gap | shell band |
| ------- | ----------------- | ---------------------- | ----------------------- | --------- | ---------- |
| Jupiter | 69911 km          | 65373 km               | 70061 km                | 4688 km   | 150 km     |
| Saturn  | 58232 km          | 52525 km               | 58532 km                | 6007 km   | 300 km     |

The gap is 6.7% (Jupiter) and 10.3% (Saturn) of the equatorial radius, i.e. 20–31×
the entire thickness of the atmosphere band it is supposed to hug. For comparison,
the tessellation deficit that produced the limb seam this whole feature closed was
0.214–0.43% of a radius. Same failure, one to two orders of magnitude larger.

It also breaks the shell fragment's wall-duty split, not just the geometry:
`shell/fragment.wesl:139-158` tests the view ray against a _spherical_ ground at
`u.bottomRadius` to decide whether a fragment belongs to the near wall (over-disc
haze) or the far wall (limb + sky). With a flattened surface that test misclassifies
every polar ray.

The Bruneton/Hillaire LUT model the shell integrates assumes spherical symmetry
throughout, so "just flatten `bottomRadius`" is not available — it would have to
become a per-ray effective ground radius, or the whole shell proxy flattens by the
same factor and the LUT parametrisation is accepted as approximate at the poles.
That choice is the actual design work here.

Also in scope once a body is oblate:

- **Ellipsoid normals.** `texturedBody/fragment.wesl:101-102` takes the shading
  normal as the unit-sphere hit point. Under a non-uniform model scale a normal
  transforms by the inverse-transpose, not by the model matrix, so for
  `S = diag(a, a, c)` the local-frame shading normal is
  `normalize(vec3(p.xy, p.z · a/c))`, not `p`. Derive it rather than copying: the
  grill's `normalize(p.x, p.y, p.z/c²)` is the same thing written in unnormalised
  body-radius units and does not drop straight into the unit-sphere frame this
  shader works in.
- **The ring plane.** `sceneRings` geometry is equatorial, so Saturn's ring itself
  is unaffected — but the ring-shadow test
  (`texturedBody/fragment.wesl:73-92`, `ringSunVisibility`) marches against a
  sphere and would need the same treatment as the atmosphere ground test.

## What still makes this one item

The two halves no longer share a blocker, and they can be sequenced independently
or split. They share a decision: **what the analytic primitive's contract is for a
non-round body.** Today that contract is "oblateness is free, because it is baked
into the model matrix and the local frame is always a unit sphere"
(`lib/analyticSphere.wesl:11-16`). The star half is the case where that is simply
true. The giants half is the case where it is not — the surrounding shells,
shadows and LUTs are all still spherical. Settling one without the other is how the
"analytic-for-round, mesh-for-oblate" branch the grill named as the trap (Q3,
Option B) gets reintroduced.

## Files

- `src/services/gpu/renderers/bodies/starRenderer.ts` — uniform block, cull mode,
  the inline uniform build.
- `src/services/gpu/shaders/bodies/star/{vertex,fragment}.wesl` — the conversion.
- `src/services/gpu/shaders/lib/sphere.wesl` — `TintedSphereUniforms`.
- `src/@types/scene/PlanetBody.d.ts` — where an `oblateness` seed field would go.
- `src/services/engine/frame/passes/{planetsLayer,texturedBodiesLayer,atmosphereShellLayer}.ts`
  — the `composeBodyMvp` / `camPosLocal` call sites that would carry it.
- `src/utils/gpu/packAtmosphereUniforms.ts:75`,
  `src/services/gpu/shaders/atmosphere/shell/fragment.wesl:139-158` — the scalar
  ground radius and the ray test that reads it.
- `src/services/gpu/shaders/bodies/texturedBody/fragment.wesl:101,116` — the
  geometric normal and the tangent built from it.
