# Young-star mean-normalization is the last live consumer of the CPU ISM-map readback

Found during the GPU-side v2 placement plan's Task 10 (readback demotion)
consumer sweep
(`.superpowers/sdd/2026-08-11-gpu-side-v2-placement/task-10-report.md`).

## The chain

`youngStars` getter (`tools/galaxy-renderer/src/engine/model/createGalaxyModel.ts:1771`)
→ `invMeanNormFor(readbacks.ismMapData, gamma)` → packed into
`FieldUniforms.youngStars.y` (`packFieldUniforms.ts:261`) → consumed by
`youngFragment.wesl:50` (`shaped = pow(stars, gamma) * invMeanNorm`) to
normalize young-star fragment brightness every frame.

This getter is never called from either readback-landing callback body
(`scheduleIsmMapReadback`/`scheduleOrientationReadback`), so it is not "on the
path to `rebuildDustMixture`/`rebuildHiiIfSeeded`" — Task 10's literal
brief invariant (no `mapAsync` between a rebuild and a drawn frame) holds. But
it IS a live, always-active, non-debug rendering input that still depends on
`readbacks.ismMapData` landing via the CPU `mapAsync` round trip. That is the
one reason `createIsmMapReadbacks.ts`/`createReadbackQueue.ts`'s scheduling
machinery could not be gated behind a debug-view flag during Task 10 — doing
so would silently freeze this brightness normalization for production users,
not just skip debug work.

## Direction

`ringReduce.wesl`'s ring-means/mean reductions (Task 3/9's precedent — GPU
reductions already write `ringMeansBuf` and a survivor-sum buffer with no CPU
round trip) are the natural foundation for moving this mean-normalization
GPU-side too. Once `invMeanNormFor`'s GPU equivalent exists and
`youngFragment.wesl` reads it from a buffer instead of a CPU-packed uniform,
the ISM-map readback has zero non-diagnostic consumers left and its
scheduling can finally be gated behind the debug-view flag.
