# Thumbnail-priority loop scaling (BVH / compute shader)

> **Backlog item** · `deferred` · area: Rendering
> **Promote to:** a spec only if a larger tier makes it a real cost (memory `project_thumbnail_loop_perf`).

## Problem

The per-frame thumbnail-priority loop is a linear CPU scan over on-screen galaxies. Render-on-demand kills the idle cost and stride decimation (PR #79) addressed the panning case, but scaling to larger tiers may need a spatial structure.

## Current state (verified 2026-06-29)

The loop in `src/services/engine/subsystems/texturedDiskSubsystem.ts:141-299` is still a linear scan with the two #79 optimizations: stride decimation (`decimationFactor`, default 8, lines 98/155-158) and hoisted squared-distance gating (`maxCamDistForVisibilityUpper`/`maxCamDistSqUpper`, lines 130-131/179). The only compute shaders in the tree are the flow field's (`flowFieldRenderer.ts:332,341`), unrelated.

## Direction

A BVH or a compute-shader priority pass if/when a larger tier pushes the linear scan over budget. Not needed at current tiers.
