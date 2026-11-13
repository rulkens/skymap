# `additiveUpsample.ts` doc undercounts its subsystems

Surfaced by the 2026-08-17 renderer/layer sweep
([`renderer-layer-outliers.md`](../research/engine/renderer-layer-outliers.md):167,
§5 bug-suspects; also §4 item 2). The sibling finding about `bloom/io.wesl`'s
header was closed on 2026-11-13: `bloom/vertex.wesl` now names
`lib/fullscreenTri.wesl` and says why bloom keeps its own copy.

## What it is

`src/services/gpu/passes/additiveUpsample.ts:18-19` says "Two subsystems
satisfy the contract today" (the CF4 scalar-volume raymarch and the Milky
Way cloud's star aggregate). Zone-of-avoidance (#555) added a third:
`zoneOfAvoidanceUpsample` rides the same shared `additiveUpsample` factory
(`initGpu.ts:401`, confirmed in
[`renderer-layer-outliers.md`](../research/engine/renderer-layer-outliers.md):124-131).

## Why it matters

Cleanup-severity, not a bug: nothing reads the comment programmatically, but
it misleads whoever next touches the upsample family about who depends on it.

## Approach

"Two subsystems" → "Three subsystems", naming zone-of-avoidance's upsample
alongside the CF4 volume raymarch and the Milky Way star aggregate. Diff the
claim against current call sites first, in case a fourth joined since.
