# `engine/` — map of the tool's renderer

Two representations of one galaxy are drawn side by side here, and the folders
say which is which:

| folder          | tier                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| `sprites/`      | **v1** — the sprite-star tier (`galaxyGenerator/v1/`), scheduled for deletion |
| `field/`        | **v2** — the analytic Gaussian-mixture field (`galaxyGenerator/v2/`)          |
| `ismMap/`       | **v2** — the fluid ISM-map generator and its orientation chain                |
| everything else | tier-independent: both tiers use it, or neither does                          |

## The tree

```
createGalaxyEngine.ts   device, every pipeline/bind group, the per-frame encode
createRafLoop.ts        the rAF driver

sprites/   encodeStarPass, encodeTransmittanceDust, packCloudUniforms,
           toMilkyWayTuning, generateGalaxy
field/     createArmRidgeDebugSample — the one field-tier module still local
           to the tool; the pipelines, packers and encode passes it debugs
           moved to src/services/gpu/renderers/galaxyField/field/
ismMap/     createIsmMapDustCdfScanDebugSample, createIsmMapReadbacks,
           decodeIsmMapTexels, decodeOrientationTexels,
           orientationCoherenceStats — readback and diagnostic paths the
           matcher/probe drive; the generator and its placement/orientation
           chain moved to src/services/gpu/renderers/galaxyField/ismMap/

model/     createGalaxyModel — what a galaxy IS; drives BOTH tiers
frame/     deriveFrameView + the pure per-frame arithmetic under it
passes/    beginClearPass (now src/services/gpu/lib/), encodeSceneComposites
           — the pass vocabulary the tier folders share
post/      encodeBloomPyramid, packGradeUniforms, gradeIsActive
gpu/       createGalaxyRenderTargets, createReadbackQueue,
           readTextureChannelSum — the field/ISM render targets stay HERE,
           host-owned; only the grow-only record buffer and the volume-bake
           helper moved to src/services/gpu/renderers/galaxyField/gpu/
camera/    orbit input
timing/    the frame median + the per-pass GPU spans (`timingSlots.ts`)
probe/     the headless readback paths the matcher drives
shaders/   WESL — mostly symlinks into the runtime's trees (`wesl.toml`).
           `milkyWay/{sprites,field,ismMap}/` there mirrors the three tier
           folders above, so a folder means the same thing on both sides.
```

The v2 field/ISM orchestration — pipelines, packers, encode passes, and
`createKeyedRebuild` — now lives in
[`src/services/gpu/renderers/galaxyField/`](../../../../src/services/gpu/renderers/galaxyField/)
and [`src/services/gpu/lib/`](../../../../src/services/gpu/lib/); this
tree keeps only what stayed tool-local (v1 sprites, debug samples, the
render-target/readback plumbing, and the host that drives both tiers).

## Deleting v1

`sprites/` is the whole draw-side deletion set — with two exceptions that are
not in it:

- **`sprites/generateGalaxy.ts` also produces v2's geometry.** Its return
  carries `geometry: describeGalaxy(params)`, and `createGalaxyModel` builds
  every analytic mixture from that value. This is the tool's copy of the
  coupling [`docs/superpowers/plans/2026-08-04-unbraid-analytic-field-from-sprite-tier.md`](../../../../docs/superpowers/plans/2026-08-04-unbraid-analytic-field-from-sprite-tier.md)
  exists to remove; the file sits under `sprites/` so the edge is visible in the
  import graph rather than hidden behind a neutral folder name.
- **`gpu/createGalaxyRenderTargets.ts` allocates `aggregateTex`** alongside the
  field's four. One module, both tiers, by design — every reduced target sizes
  off the same canvas.

## Why not `v1/` / `v2/` / `shared/`

`galaxyGenerator/` splits that way because a builder there produces one tier's
data end to end. Here the same split would put 28 of 49 modules in a `shared/`
bucket, including the two largest (`createGalaxyEngine.ts`,
`createGalaxyModel.ts`) — which are not shared plumbing, they are the tool. Tier
is a property of the modules that draw a tier, and only those; the rest is
grouped by what it serves.
