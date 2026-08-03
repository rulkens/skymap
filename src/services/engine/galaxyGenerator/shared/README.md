# `shared/` — the generation front-end both tiers read

Turns one `GalaxyParams` preset into the packed `GENERATION_UBO` bytes, and reads
the galaxy's geometry back out of those same bytes. `v1/` binds the buffer to its
compute shaders; `v2/` consumes the read-back `GalaxyFieldGeometry`. That is the
whole reason this folder exists: **one galaxy, one geometry, two renderings.**

## Flow

```
GalaxyParams
  │  classifyHubbleType          params.type ("SBb") → GalaxyCategory ("barred")
  │  galaxyPopulationFractions   category → bulge/bar/disk/arm/halo shares of the light
  │  splitStarBudget             shares × totalStarBudget → StarBudget (v1's counts)
  │  carveStarLayout             category+budget → GenerationLayout (popId ranges, strides)
  │  carveDustLayout             ditto for dust; empty for ellipticals
  ▼
packGenerationUniforms(params, budget, extra) → ArrayBuffer, GENERATION_UBO-shaped
  ├──────────────────────────────► v1: queue.writeBuffer → generate.wesl
  └── readGalaxyFieldGeometry(bytes, params) → GalaxyFieldGeometry
                                  └───────────► v2: buildGalaxyFieldMixture(geometry, …)
```

`generationUboLayout.ts` (`GENERATION_UBO`) is the offset authority for every
lane; `populationIds.ts` names the population codes the shader switches on. Both
are hand-mirrored into `gpu/shaders/galaxyGen/generate.wesl`, guarded by
`tests/…/shared/generationShaderParity.test.ts` — no compiler enforces that seam.

## Landmines

**The geometry is READ BACK, not re-derived.** `readGalaxyFieldGeometry` parses
the packed bytes because `cosBar`/`sinBar` and `cosBulge`/`sinBulge` are single
draws off `packGenerationUniforms`' `mainStream`/`asymStream`. A second
derivation would have to replay those streams in order and would silently
misalign the field's bar against the sprites' the moment a draw moved.

**`v2` depends on this folder through DATA, not imports.** Nothing under `v2/`
imports anything here; the wiring happens in the caller
(`tools/galaxy-renderer/src/engine/createGalaxyEngine.ts`'s `generateGalaxy`).
Grepping the import graph alone will tell you this folder is v1-only. It is not.

**`shared/` must never import `v1/`.** v1 is scheduled for deletion (see
`v1/README.md`); an edge in that direction takes v2 down with it. The dependency
runs `v1 → shared` and `v2 ← shared` (by data), never back.

**The population weights are a table, not a star count.**
`galaxyPopulationFractions` is the one source; `splitStarBudget` multiplies it by
the sprite budget and `readGalaxyFieldGeometry` reads it as-is, so `starCount`
cannot move the field's mixture. The bar's share is carved out of the disk's by
`BAR_SHARE_OF_DISK`, which `carveStarLayout` spends on the sprite side — change
one and you have changed both, which is the point. Globular-cluster stars are
outside the table entirely: 90-star knots at random radii are not a smooth field.

**`modelledStars` is still a star count, deliberately.** It is what v2's
`emissionScale` and `hiiRegions`' `tierFlux` calibrate absolute flux against, so
that analytic exposure 1.0 means sprite-flux parity. Deleting v1 does not delete
that dependency — it has to be replaced with a real emissivity normalisation
first (`docs/research/milky-way/goal-and-history.md`).

**`splitStarBudget`/`carveStarLayout` are NOT v1-only.** `packGenerationUniforms`
carves the star layout itself and derives `grainScale`/`starSize` from
`budget.totalStars`, and `budget.armStarCount` is what gates the arm table into
the UBO — both of which v2 then reads back. They stay here.

**Arm-table lane 7 (`age`) is analytic-field-only.** The sprite shader never
reads it. Lanes 0-6 are what `armStarSample` consumes.

**Layout edits append, never renumber.** A renumbered `GENERATION_UBO` field
desyncs anything already reading the old offset — no error, just a float landing
in the wrong lane.
