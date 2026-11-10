# `engine/` — map of the tool's renderer

Two representations of one galaxy are drawn side by side here, and the folders
say which is which:

| folder          | tier                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| `sprites/`      | **v1** — the sprite-star tier (`galaxyGenerator/v1/`), scheduled for deletion |
| `field/`        | **v2** — the analytic Gaussian-mixture field (`milkyWay/field/`)              |
| `ismMap/`       | **v2** — the fluid ISM-map generator and its orientation chain                |
| everything else | tier-independent: both tiers use it, or neither does                          |

## The tree

```
createGalaxyEngine.ts   device, the v1 and post pipelines, the per-frame encode;
                        the field draws through the shared field host
createRafLoop.ts        the rAF driver

sprites/   encodeStarPass, encodeTransmittanceDust, packCloudUniforms,
           toMilkyWayTuning, generateGalaxy
field/     createArmRidgeDebugSample — the one field-tier module still local
           to the tool; the pipelines, packers and encode passes it debugs
           moved to src/layers/milkyWay/field/render/
ismMap/     createIsmMapDustCdfScanDebugSample, orientationCoherenceStats —
           diagnostic paths the matcher/probe drive; the generator and its
           placement/orientation chain moved to
           src/layers/milkyWay/field/ismMap/, its readbacks and decoders to
           src/layers/milkyWay/field/host/

model/     createGalaxyModel — what a galaxy IS: the v1 sprites, bubbles and
           readback diagnostics, plus what the field host is tuned from
frame/     deriveFrameView, fieldHostRender + the pure per-frame arithmetic
post/      encodeBloomPyramid, packGradeUniforms, gradeIsActive
gpu/       createGalaxyRenderTargets, readTextureChannelSum — the field/ISM
           render targets stay HERE, tool-owned
camera/    orbit input
timing/    the frame median + the per-pass GPU spans (`timingSlots.ts`)
probe/     the headless readback paths the matcher drives
shaders/   WESL — mostly symlinks into the runtime's trees (`wesl.toml`).
           `milkyWay/{sprites,field,ismMap}/` there mirrors the three tier
           folders above, so a folder means the same thing on both sides.
```

The v2 field/ISM orchestration — the field host the app shares
(`field/host/`: tuning, plan, encode, readbacks, composite loop), pipelines,
packers, encode passes, and `createKeyedRebuild` — lives in
[`src/layers/milkyWay/field/`](../../../../src/layers/milkyWay/field/)
and [`src/services/gpu/lib/`](../../../../src/services/gpu/lib/); this
tree keeps only what stayed tool-local (v1 sprites, debug samples and the
render targets).

## Deleting v1

`sprites/` is the whole draw-side deletion set — with two exceptions that are
not in it:

- **`sprites/generateGalaxy.ts` also produces v2's geometry.** Its return
  carries `geometry: describeGalaxy(params)`, and `createGalaxyModel` hands
  that value to the field host as `FieldHostTuning.geometry`. This is the tool's copy of the
  coupling [`docs/superpowers/plans/2026-08-04-unbraid-analytic-field-from-sprite-tier.md`](../../../../docs/superpowers/plans/2026-08-04-unbraid-analytic-field-from-sprite-tier.md)
  exists to remove; the file sits under `sprites/` so the edge is visible in the
  import graph rather than hidden behind a neutral folder name.
- **`gpu/createGalaxyRenderTargets.ts` allocates `aggregateTex`** alongside the
  field's four. One module, both tiers, by design — every reduced target sizes
  off the same canvas.

## Why not `v1/` / `v2/` / `shared/`

`galaxyGenerator/` splits that way because a builder there produces one tier's
data end to end. Here the same split would put most modules in a `shared/`
bucket, including the two largest (`createGalaxyEngine.ts`,
`createGalaxyModel.ts`) — which are not shared plumbing, they are the tool. Tier
is a property of the modules that draw a tier, and only those; the rest is
grouped by what it serves.
