# `shared/` — the generation front-end both tiers read

Turns one `GalaxyParams` preset into one `GalaxyDescription`, then hands that to
each tier: `v1/` packs it into `GENERATION_UBO` bytes and binds them to its
compute shaders; `v2/` builds its Gaussian mixtures from it. That is the whole
reason this folder exists: **one galaxy, one description, two renderings.**

## Flow

```
GalaxyParams
  │  classifyHubbleType          params.type ("SBb") → GalaxyCategory ("barred")
  │  galaxyPopulationCountShares category → bulge/bar/disk/arm/halo shares of star COUNT
  │  splitStarBudget             shares × totalStarBudget → StarBudget (v1's counts)
  ▼
describeGalaxy(params) → GalaxyDescription   ← every construction-time RNG draw
  ├── packGenerationUniforms(description, params, budget, extra) → ArrayBuffer
  │     │  carveStarLayout       category+budget → GenerationLayout (popId ranges, strides)
  │     │  carveDustLayout       ditto for dust; empty for ellipticals
  │     └──────────────────────► v1: queue.writeBuffer → generate.wesl
  └──────────────────────────────► v2: buildGalaxyFieldMixture(description, …)
```

`generationUboLayout.ts` (`GENERATION_UBO`) is the offset authority for every
lane; `populationIds.ts` names the population codes the shader switches on. Both
are hand-mirrored into `gpu/shaders/milkyWay/sprites/generate.wesl`, guarded by
`tests/…/shared/generationShaderParity.test.ts` — no compiler enforces that seam.

## Landmines

**`describeGalaxy` owns every shared RNG draw; nothing else may draw.** The four
streams are consumed in one fixed order, and `randomGalaxyParams` plus every
seeded preset are pinned to it — reorder a draw, add one, or skip one and every
galaxy in the gallery rerolls. A pinned value (`barAngleDeg`, `armAges[a]`)
still consumes its draw for exactly that reason.

**`v2` depends on this folder through DATA, not imports.** Nothing under `v2/`
imports anything here; the wiring happens in the caller
(`tools/galaxy-renderer/src/engine/sprites/generateGalaxy.ts`).
Grepping the import graph alone will tell you this folder is v1-only. It is not.

**`shared/` must never import `v1/`.** v1 is scheduled for deletion (see
`v1/README.md`); an edge in that direction takes v2 down with it. The dependency
runs `v1 → shared` and `v2 ← shared` (by data), never back.

**The population weights are a count-share table, not a star count — and not
light either.** `galaxyPopulationCountShares` is the one source; `splitStarBudget`
multiplies it by the sprite budget and `GalaxyDescription.light` carries it as-is,
so `starCount` cannot move the field's mixture. The bar's share is carved out of
the disk's by `BAR_SHARE_OF_DISK`, which `carveStarLayout` spends on the sprite
side — change one and you have changed both, which is the point. Globular-cluster
stars are outside the table entirely: 90-star knots at random radii are not a
smooth field. Turning a count share into a LIGHT share takes a second, separate
multiply — see `galaxyPopulationCountShares.ts`'s docblock for that pair.

**The field's brightness must never read the star budget.** A budget is an LOD
number; while `emissionScale` and `hiiRegions`' `tierFlux` anchored absolute
flux on `modelledStars * starSize^2` it went as N^(1/3), so switching tier
changed how bright a galaxy is by 26% a step — with the structure untouched and
the sprite bag drifting by the same factor, which is why it never showed. Both
now scale off `GalaxyDescription.luminosity`, a function of size alone.

**`splitStarBudget`/`carveStarLayout` are still here, for one reason.**
`describeGalaxy` derives `starSize` from `budget.totalStars`, and nothing else
in the description touches the budget. That last thread is what keeps the pair
out of `v1/`.

**Arm-table lane 7 (`age`) is analytic-field-only.** The sprite shader never
reads it. Lanes 0-6 are what `armStarSample` consumes.

**Layout edits append, never renumber.** A renumbered `GENERATION_UBO` field
desyncs anything already reading the old offset — no error, just a float landing
in the wrong lane.
