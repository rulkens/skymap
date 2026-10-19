# The pick program re-implements the render program's slab order and depth formats

**Readiness:** `needs-design`. **Surfaced:** 2026-10-19, architecture audit (`docs/audits/2026-10-16-architecture-weak-points.md`).

## Problem

`pickProgram.ts:296-327` has its own slab order and near-to-far fold; `:80-81` hard-codes the two depth formats every Layer pick pipeline must match by importing `pickDepthFormat`; the frame order's `depth`, `slot` and capture data are ignored. A change to painter order or a slab's depth format for rendering can diverge from picking with no check.

## Direction

Derive pick targets and order from the same expanded steps, `RenderTargetSpec` rows and `foregroundChainOrder` the renderer uses; expose the depth format through the slab. Likely rides the ADR 0014 migration.
