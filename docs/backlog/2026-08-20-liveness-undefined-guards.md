# Liveness guards accept `undefined`; `NaN` alpha class in fixtures

**Area:** engine/renderer · **Readiness:** ready

Surfaced by rung 7's T7 review (`.superpowers/sdd/2026-08-20-fade-rows/task-7-review.md`,
findings 2 and 4, adjudicated concern 2), two related "fixtures escape the
type system at an `as unknown as` seam" gaps:

**Null-vs-undefined guard drift.** The renderer-handle `=== null` guard this
item originally found in `volumeLiveness.ts` is gone along with that file:
`src/utils/volume/deriveVolumeLiveness.ts` (the pure core, shared by
`src/layers/cosmicWebDensity/present/deriveCosmicWebDensityLiveness.ts` and
the dust Layer to come) now takes `renderer` as a required,
non-nullable `VolumeFieldRenderer<Id>` — Layer-runtime owned and never null,
same resolution ZoA's copy already had with #763. The general landmine this
item is about — a test fixture built via `as unknown as EngineState` with a
required field simply absent (`undefined`, not `null`) slipping past a
`=== null` gate — is not fully retired: it's the shape to keep watching for
in any liveness-style guard the app still writes. This is the actual
mechanism behind a `renderFrameSplitBaseline` baseline drift caught during
rung 7: seeding `focusBlend` in the fixture only un-masked the drift, it
didn't cause it.

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

Both gaps were adjudicated during rung 7's review as correct _not_ to patch
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
