# `field/` — the analytic v2 field engine

Builds flat arrays of `GalaxyFieldComponent` — anisotropic 3D Gaussians, each
carrying an inverse covariance, a centre, an amplitude and a colour. A ray
through one integrates to `erf`/`erfc` in closed form
(`src/services/gpu/shaders/lib/gaussianIntegral.wesl`), so the emission of a whole mixture is
evaluated per fragment with no marching and no sampling noise. This is the tier
that replaces `v1/`'s star bag.

The builders are **pure** `(geometry, tuning, params, seed) → flat data`: no
`Math.random`, no `Date`, no device handle. That invariant is what keeps a
Worker or compute-pass port open, and it is worth preserving. The device lives
only in the GPU halves: the `render/` folders, `subsystems/` and `host/`.

## The three builders

Dust, arm-cloud and arm-spur-cloud placement moved GPU-side
(`placeDust.wesl`, `placeArmCloud.wesl`, `placeArmSpurCloud.wesl` under
`src/services/gpu/shaders/milkyWay/ismMap/`); their files here survive only as the
constants/budget-derivation halves the GPU dispatch hosts
(`placement/render/`) still read. Those halves live in
`armClouds/` (counts, radial tilt, footprint integral, ceilings); `arms/` keeps
the ridge vocabulary and spur records.

| entry point                                                                    | output                                   | drawn by                                     |
| ------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------- |
| `buildGalaxyFieldMixture` (emission)                                           | disc, bulge, bar, arm ridges             | `milkyWay/field/splat.wesl`                  |
| `buildHiiRegions`                                                              | Strömgren shells + OB cores              | `splat.wesl`, own target                     |
| `buildGalaxyIsmMapArmForcing` + `sfEventCatalog` / `buildDustBubblePlacements` | ISM-map forcing grid, SF events, bubbles | `ismMapFluidStep.wesl`, `bubblePresent.wesl` |

All three take the same `GalaxyDescription` that `shared/describeGalaxy` produced
and `v1/packGenerationUniforms` wrote into v1's generation UBO — which is what
makes the field and the sprites two renderings of one galaxy rather than two
galaxies. That description names no star count, no sprite size and no budget:
those are `v1/`'s, along with the per-population brightness that converts one
into the other. This tier applies no such multiplier — `light` times
`luminosity` IS what a population emits, and its flux is a function of
`luminosity` alone.
The `arms/utils/armRidge*.ts` files hold the ridge curve/width/colour vocabulary every arm
consumer shares; re-deriving a ridge anywhere else is the mistake it exists to
prevent.

## `host/` — the one way in

`host/subsystems/createGalaxyFieldHost.ts` is the narrow `GalaxyFieldHost` the
app and the tool share: per frame `setTuning`, `ensureFresh`, `plan`, then
`encode` with that plan. It owns the renderer, the ISM-map readbacks behind
`youngStars.invMeanNorm`, and the per-frame lane derivation
(`host/utils/deriveFieldFrameLanes.ts`). Until its first `setTuning` it plans
and encodes nothing. The app draws it behind the `renderer` debug setting
(the milkyWay Layer's `computes` and `passes`); the tool and the app share
`host/`.

## `pipelines/` — the render pipelines

`pipelines/render/` holds the field's pipeline factories (`createFieldPipelines`, `createBubblePresentPipeline`); `pipelines/@types/` holds the types of their bind-group and dependency contracts.

## Landmines

**There is no MGE of the Milky Way, and there cannot be.** MGE deprojects an
observed surface-brightness image and we are inside the object. This is the
single most likely thing a reader will try to "fix" by searching harder. The
substitute is a Gaussian mixture we fit ourselves to a published NIR emissivity
model. See
[`docs/research/milky-way/analytic-field.md`](../../../../docs/research/milky-way/analytic-field.md).

**Emission-only is closed form; emission with self-absorption is not.** That is
why dust is a separate multiplicative screen rather than a component in the
emission mixture, and why the base/detail seam cannot be additive. It bites for a
single Gaussian, not just across layers — better ordering does not fix it.

**A shear on an origin-centred component does NOT model the warp. Do not
re-propose it.** It was implemented and measured wrong: a shear about the galaxy
origin traces a straight line through it, while the generator's warp is
identically zero inside `warpStartRadius` and then bends as `rel²`. The
components fanned apart into flat sheets. The warp instead comes from **where
blobs are placed** — `GalaxyFieldComponent.center` on the `warpSurfaceFrame`
tangent plane at `warpHeight`. The diagnostic trap that let the shear ship:
checking it at each component's own linearisation radius always passes, because a
tangent is exact there by construction. The honest check is the ridge across the
whole disc.

**HII draws into its own target, never folded into the emission mixture.** A
shell sprite is small and bright by construction; sharing the smooth field's
downsampled target collapsed it into a bloom firefly.

**`GALAXY_FIELD_MAX_COMPONENTS` is a per-galaxy cap, not a shader limit.** The
`comps` binding is a runtime-sized storage array the engine grows on demand, and
extras sum past the cap freely. `pushArmRidges` budgets against it so arm
overflow is impossible; other populations are silently CLAMPED by
`packFieldUniforms`.

**Dust components live in the same `comps` array as emission, appended after
it,** and are never drawn as quads — the draw's instance count is the emission
count only. `counts.w` (`primaryCount`) is what stops an extra's emission from
reading the primary galaxy's dust.

**Nothing here imports `shared/`.** The geometry arrives as an argument. Keep it
that way; a `v2 → shared` import edge would tie this tier to the packed UBO
layout it is meant to outlive.
