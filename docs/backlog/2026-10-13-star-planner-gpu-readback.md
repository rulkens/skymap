# Plan star chunks from a GPU readback of the wanted roots

**Readiness:** `deferred`. **Surfaced:** 2026-10-11, planner perf work on #885.

## Problem

The chunk planner (`src/utils/star/planStarChunks.ts`) walks the index on the CPU every `STAR_PLAN_INTERVAL_FRAMES`
(4) frames: 0.05 to 0.11 ms a plan at today's size (perf:cpu `plan:star-catalog`). The pruned walk scales with the
visible tree, not the catalogue, so this is only worth doing if a far larger Gaia catalogue makes the walk cost
more than a frame of readback latency.

## Option

Have the GPU cut write which chunk roots want to refine, read it back a frame late, and let the planner rank only
those. The planner would then need a one-frame-stale view; the stream already tolerates that for landings.

## First step

Measure `plan:star-catalog` on a bake several times larger than today's before building anything.
