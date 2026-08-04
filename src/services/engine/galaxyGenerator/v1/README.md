# `v1/` — the sprite-star tier (scheduled for deletion)

> **Read this first.** The generic star bag this folder produces is to be
> **deleted, not shrunk** — see
> [`docs/research/milky-way/goal-and-history.md`](../../../../../docs/research/milky-way/goal-and-history.md).
> The end state is `v2/`'s analytic flux field plus named feature terms (dust,
> star-forming regions, globular clusters) with real data behind them. Keep this
> tier working; do not invest in tuning it. `splitStarBudget`, `starCount`, the
> bulge/disc/arm/halo split and `MILKY_WAY_STARS_PER_TIER` are explicitly named
> there as scaffolding for a bag being removed.

## What it produces

GPU buffers of 8-lane records (`GEN_RECORD_BYTES = 32`) drawn as additive
billboards: ~150k sprites standing in for ~1e11 stars, roughly one sprite per
700,000 stars. That sampling density is the measured failure mode — wherever the
disc covers real screen area the sprites fall below one per pixel and read as
particles.

## Flow (app side)

```
createMilkyWayCloud(device, starCount)          ← src/services/engine/phases/initGpu.ts
  createGenerationPipelines(device)             once: two compute pipelines
  regenerate(count):
    shared/{splitStarBudget, carveStarLayout, carveDustLayout}   pure CPU
    device.createBuffer starVB / dustVB         size = capacity × GEN_RECORD_BYTES
    queue.writeBuffer(ubo, shared/packGenerationUniforms(shared/describeGalaxy(params), ...))
    encodeGeneration(...)                       two compute passes
    queue.submit
      → MilkyWayCloudBuffers → gpu/renderers/milkyWay/milkyWayCloudRenderer.ts
```

Shaders: `gpu/shaders/milkyWay/sprites/{generate,generateStars,generateDust}.wesl`
(compute, the placement maths) and `gpu/shaders/milkyWay/sprites/{stars,dust}.wesl`
(the billboard draw). Neither moves with this folder.

`milkyWayCalibration.ts` is the placement/LOD/look side rather than generation:
physical size, per-tier star budget, the approach-fade band, and the boot values
`settings.milkyWay` spreads in so the DebugPanel sliders can move them live.
`milkyWayModelMatrix` / `milkyWayModelCached` place the locally-generated cloud
in world space; `milkyWayFadeAlpha` fades it out by apparent disc diameter.

## Landmines

**Some of `milkyWayCalibration` will outlive this tier.**
`MILKY_WAY_RADIUS_MPC`, `MILKY_WAY_MODEL_SCALE` and the fade thresholds describe
where the Milky Way _is_, not how it is sampled — an analytic-field renderer will
want them too. They sit here only because every current consumer is the sprite
path. Promote them rather than deleting them with the rest.

**Buffers are sized to carved CAPACITY, not to live stars.** Dead slots
rasterize nothing; a population's `iterations` is a CPU loop bound, and some
iterations write a zero-brightness record. `starCount`/`dustCount` are
capacities.

**Bind groups are built per pipeline, at dispatch time.**
`createGenerationPipelines` uses `layout: 'auto'`, so a bind group made against
the star pipeline's derived layout is invalid on the dust pipeline — even though
both shaders declare byte-identical `@group(0)` bindings.

**The write-then-encode-then-submit order is load-bearing.** One `writeBuffer`,
one encoder, one submit, on the one queue: WebGPU processes a queue in submission
order, so the compute passes see the UBO write with no readback and no fence.
This is not the multiple-writeBuffer-racing-one-shared-buffer trap.

**The Milky Way generates in its LOCAL frame** — `packGenerationUniforms` is
called with `extra = null`, placement is entirely draw-side. The tool's
background extras do the opposite and fold their transform into the UBO.

**`milkyWayCloud` carries no notion of `Tier`.** `settings.milkyWay.starCount` is
an absolute count; `watchTierSaga` re-seeds it from
`milkyWayCalibration`'s per-tier table on an explicit tier change.
