# `ismMap.generator='none'` throws GPU validation errors

Found during the GPU-side v2 placement plan (Task 7's fix round 1), pre-existing
and unrelated to that plan's own changes.

## The bug

Setting `fieldTuning.ismMap.generator = 'none'` through `setFieldTuning`
(`tools/galaxy-renderer/src/engine/model/createGalaxyModel.ts`) throws GPU
validation errors. The disabled-generator clear path calls
`device.queue.writeTexture(...)` against three textures — `ismMapTex`,
`ismMapDustBlurTex`, `ismMapCartesianTex` (created in
`createIsmMapGenerator.ts` / `createIsmMapOutput.ts`) — and none of the three
carry `GPUTextureUsage.COPY_DST`. `writeTexture` requires it; the browser
rejects the call.

## Blast radius

Affects real users disabling the generator from the galaxy-renderer dev tool's
UI, not a debug-only path. The GPU-side placement plan worked around it in its
own probe harness via a `forceGeneratorIsFluid` override rather than fixing it
— the crash was out of that plan's scope (its default, and every shipped
preset, uses `generator: 'fluid'`).

## Fix options

- Add `COPY_DST` to the three textures' usage flags so the existing
  `writeTexture` clear path is legal.
- Or replace the clear with a render/compute pass (a cheap fill shader) instead
  of `writeTexture`, avoiding the extra usage flag on textures that are
  otherwise read/render-target-only.
