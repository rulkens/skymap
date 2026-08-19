# Picking GPU resources → own subsystem

> **Backlog item** · `deferred` · area: Rendering
> **Promote to:** its own ADR first, then a spec.

## Problem

Selection/picking GPU resources should migrate into their own subsystem, parallel to the fade subsystem (ADR 0001). But the pick texture is **per-camera, not per-handle**, so the fade pattern doesn't transfer directly — it needs its own ADR before a plan.

## Current state (verified 2026-06-29)

Not done. ADRs only go to 0007; none covers selection/picking. ADR 0001 explicitly carves this out as future work (lines 188-192: "Selection / picking GPU resources … deserves its own ADR if we go there"). There is no picking subsystem under `src/services/engine/subsystems/`; `galaxyPickRenderer.ts` still owns its per-camera pick texture/resources directly, orchestrated through `interaction/{clickHandler,hoverPickDriver}.ts`.

## Notes

Picking was already lifted out of the render frame (pointer-driven hover + click, #362) — that's the lifecycle half. This item is the GPU-resource-ownership half.
