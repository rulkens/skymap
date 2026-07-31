# Layer blend is declared twice, and nothing ties the two

**Status:** needs-design (2026-07-31)

Every content layer states its blend mode twice, in two places that cannot see each
other:

- `ContentLayer.blend` — a `Blend` value on the registry row
  (`src/services/engine/frame/passes/*.ts`).
- The `GPUBlendState` baked into the render pipeline the row's `draw` calls
  (`src/services/gpu/renderers/**`).

`ContentLayer.d.ts`'s `blend` field docblock already names the guardrail — "a
layer↔pipeline parity check" — and defers it to "once a target's layers stop
agreeing on blend". That condition has been met for some time without anyone
noticing, which is the point: the field that would have shown it was the field
that was wrong.

## Why it went unnoticed

`Blend` had no member for multiplicative extinction, so the Milky Way dust row
declared `'additive'` while its pipeline ran `srcFactor: 'dst', dstFactor: 'zero'`.
Adding `'multiply'` and correcting the row makes the two declarations _disagree
visibly_ rather than agree falsely — but still nothing checks them.

## Shape to explore

A `blendStateOf(blend: Blend): GPUBlendState` seam, with pipelines deriving their
blend state from the layer's declaration instead of restating it. Parity then holds
by construction and the check becomes unnecessary.

The cost is the reason this is backlogged rather than done: roughly every renderer
constructs its own pipeline with an inline or imported blend descriptor, so the seam
has to be threaded through all of them. `src/services/gpu/lib/blendStates.ts` is the
natural home — it already single-sources two of the algebras, and documents why the
dust multiply stayed inline (one call site). A second multiplicative consumer is the
trigger to fold it in.

## What is NOT the answer

A test asserting that `'multiply'` rows follow `'additive'` rows within a
`(target, slab)` group. That invariant is false on purpose: `star-points` and
`star-catalog` are additive and are deliberately ordered _after_ the dust multiply so
near-field stars are not darkened by it. Ordering here is a depth fact, and the
pinned name-order assertions in `tests/services/engine/frame/passes/passes.test.ts`
are already its guardrail.

## Interactions

- **[GPU handle nullability](2026-06-29-gpu-handle-nullability.md)** — same renderer
  files; sequence together if either is picked up.
