# `checkFrameOrder` cross-checks pipeline formats against the target row

**Readiness:** `ready`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

Three places must agree on what a pass draws into: `RenderTargetSpec.format` / `.depth` on the row, the `(target, slab)` on the `FRAME_ORDER` line, and the colour and depth formats baked into the renderer's pipeline at construction. Twenty renderer files hard-code `rgba16float`, `depth32float` or `depth24plus`, five of them in Layers. `checkFrameOrder` verifies that the target id exists and that a sampled depth source has depth, nothing about format. `ContentPass.d.ts` carries the rule as an "Invariant" in prose. COSMO's pick depth is `depth24plus`, everything else `depth32float`, so the mismatch is easy to make.

## Direction

A pass exposes `formats: { color: GPUTextureFormat; depth: GPUTextureFormat | null }` (the renderer already knows them at construction). `checkFrameOrder` compares them with the row of every line that lists the pass, for the real view and for captures. Until a Layer `onSwapFormat` hook exists, a Layer pass on a `swap`-target line is rejected by the same check. Pairs with the GPU error scope item.
