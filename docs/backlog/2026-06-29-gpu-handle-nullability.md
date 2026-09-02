# GPU-handle nullability

> **Backlog item** · `deferred` · area: Engine & State
> **Promote to:** a spec in `docs/superpowers/specs/` when picked up.
> Prerequisite (RenderFrameSettings dissolution) **shipped** — this is the follow-on.

## The root fact

Every field on `EngineGpuHandles` is `Renderer | null` because `createEngine` returns synchronously but the GPU pipelines are built in an async `requestAdapter`→`requestDevice`→shader/atlas chain — absent for ~2 bootstrap frames (and re-nulled by `destroy()`). One _transient_ lifecycle fact is encoded as _perpetual_ per-field nullability, so every access forever pays a null-check tax though the handle is provably non-null after `initGpu`.

## The inconsistency

Four access styles coexist for the same kind of thing:

1. **ctx-narrowed** — `galaxyPointRenderer`/`postProcess`/`volumeOffscreen`/`texturedDisks` narrowed once via `isEngineReady`/`ReadyFrameContext` (`frameContext.ts:57-72`), read as `ctx.galaxyPointRenderer`.
2. **`!`-asserted** at point of use (`pointSpritesPass.ts:98` `state.gpu.focusUniform!`).
3. **null-checked** at point of use (~15 renderers).
4. **always-non-null null-object** (`timingService`'s no-op stub — the better pattern, already in the tree).

`runFrame`→`renderFrame` even pulls renderers from two sources inconsistently (`runFrame.ts:344-348`: some from `deps`, some from `state.gpu`).

## `PassDeps` — OVERTAKEN, deleted by #420

This section originally described `PassDeps` re-threading renderers already on
`state.gpu` purely to launder the `| null` into a non-null shape at the
`renderFrame` boundary. `PassDeps` no longer exists in the codebase (deleted
by #420, alongside the picking-GPU-subsystem migration); passes now read
`state.gpu.X` directly. The remaining scope of this item is the
`EngineGpuHandles` nullability itself, below.

## The careful caveat (scar tissue)

The point-of-use checks are _partly deliberate_: docblocks exclude handles from `isEngineReady` because "bootstrap progression isn't the inverse of teardown" — the 2026-05-08 black-screen incident (memory `feedback_lifecycle_vs_teardown_invariants`), where consolidating a multi-handle "ready" predicate over-constrained mid-bootstrap callbacks and blanked the canvas. The naive "one big ready flag" is exactly the move that bit us.

## Target

Separate the three concerns currently fused under one `| null`:

- **existence** — non-null after `initGpu` (nearly all handles).
- **data readiness** — `filamentRenderer` exists but empty until `loadFilaments`; `flowFieldRenderer` until demand — genuinely still absent at draw time.
- **destroy reachability**.

Narrow the bootstrap-guaranteed handles once into a non-null "ready GPU" view (extend `ReadyFrameContext` or add a `ReadyGpu` bag), keep `| null` only for the genuinely-absent-at-draw-time ones (some via a `timingService`-style null-object), let `destroy()` iterate the raw bag. Done incrementally, respecting the teardown asymmetry — never a big-bang ready flag.

## Current state (verified 2026-06-29; `PassDeps` note added 2026-09-02)

- Prerequisite done: `RenderFrameSettings` fully dissolved (zero matches in src/tools; passes read `state.settings.*`).
- Follow-on NOT done: all `EngineGpuHandles` fields still `T | null` (`EngineGpuHandles.d.ts:68-221`); **no `ReadyGpu` type** exists. The only narrowing is the pre-existing `ReadyFrameContext` (the four bootstrap-gate handles). `PassDeps` itself is gone (deleted by #420) — see above.
