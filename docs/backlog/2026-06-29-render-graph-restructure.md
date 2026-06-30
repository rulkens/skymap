# Render-graph / frame-graph restructure

> **Backlog item** · `deferred` · area: Engine & State
> **Promote to:** a spec in `docs/superpowers/specs/` when picked up.

## Problem

`runFrame.ts` is a long imperative sequence; turning the frame body into a declarative pass DAG would make pass dependencies explicit and the order auditable.

## Current state (verified 2026-06-29)

`src/services/engine/frame/runFrame.ts` is a fully imperative top-to-bottom sequence: clip tick → demand → resize → four camera steps → focus → impostor planners → label/marker upload → `renderFrame()` → pick overlay → keep-ticking. There _is_ a `passes/` table consumed by `renderFrame.ts` (the HDR pass list), but the frame body itself is not a render graph.

## Direction

Model the frame as a graph of passes with declared inputs/outputs; let ordering and resource lifetimes fall out of the dependency edges rather than the hand-written sequence.

## Notes

- Listed under "Deferred from existing plans / ADRs" — scoped out of the renderer-interface-extraction work with a paper trail.
- Sibling cleanup: the [GPU-handle nullability follow-on](2026-06-29-gpu-handle-nullability.md) removes one source of per-pass null-threading that complicates the current frame body.
