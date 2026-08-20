# Liveness guards accept `undefined`; `NaN` alpha class in fixtures

**Area:** engine/renderer · **Readiness:** ready

Surfaced by rung 7's T7 review (`.superpowers/sdd/2026-08-20-fade-rows/task-7-review.md`,
findings 2 and 4, adjudicated concern 2), two related "fixtures escape the
type system at an `as unknown as` seam" gaps:

**Null-vs-undefined guard drift.** `zoneOfAvoidanceLiveness.ts:18` guards
`state.gpu.zoneOfAvoidanceRenderer === null`, so a state object (typically a
test fixture built via `as unknown as EngineState`) with the field simply
absent — `undefined`, not `null` — slips past the "not live" gate instead of
being caught by it. This is the actual mechanism behind a
`renderFrameSplitBaseline` baseline drift caught during rung 7: seeding
`focusBlend` in the fixture only un-masked the drift, it didn't cause it.
The local fix each time is to null the renderer explicitly in the fixture;
the guard itself is the landmine that will keep re-surfacing until every
`EngineState`-shaped fixture is disciplined about `null` vs omitted fields.
Same class of gap as `volumeLiveness.ts`'s matching renderer-null check,
which this module deliberately mirrors.

**`focusBlend` required-but-fixture-omittable → `NaN` alpha.**
`ReadyFrameContext.focusBlend` is a required `number`
(`src/@types/engine/frame/ReadyFrameContext.d.ts:99`), and production always
seeds it (`frameContext.ts:207`, `focusBlend: 0`). But any fixture built
with `as unknown as ReadyFrameContext` that omits the field produces
`lerp(1, 1, undefined)` = `NaN` wherever a `focusRecession`-derived alpha is
computed, and `NaN` silently fails every `alpha > 0` gate downstream
(the layer just never draws, with no error). The type system already
covers the production path — a real `deriveFrameContext` call cannot omit
the field — so this is fixture-only exposure, not a runtime hole worth a
defensive guard in production code.

## Why file it rather than fix inline

Both gaps were adjudicated during rung 7's review as correct *not* to patch
in that task's diff — a runtime guard against a type-system-covered case is
the speculative defence the project's simplicity convention rejects, and
the `zoneOfAvoidanceLiveness` guard's local fix (null the fixture) was
sufficient there. But the pattern will recur anywhere a `EngineState`- or
`ReadyFrameContext`-shaped object is fixture-cast rather than constructed
through the real builder, and nothing currently sweeps for it.

## Fix directions

- A guard-shape sweep: audit `=== null` checks across the engine/frame
  layer for fields that are typed nullable-or-required but could be
  `undefined` via an `as unknown as` fixture cast; normalize to `== null`
  where `undefined` should also count as "not live", or to a runtime assert
  where it genuinely shouldn't reach production.
- Or a shared fixture factory for `EngineState`/`ReadyFrameContext` test
  objects that forces every required field to be supplied, so a missing
  field is a compile error at the call site instead of a silent `NaN` at
  render time.
