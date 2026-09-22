# Disabling a producer layer in the DebugPanel freezes its overlay instead of hiding it

**Area:** rendering / frame passes · **Readiness:** ready

Four offscreen-producer/consumer pairs share one shape, and the DebugPanel
renderer-toggle list breaks all four the same way:

- producer `zone-of-avoidance` (target `zoa`) → consumer
  `zoneOfAvoidanceUpsamplePass`
- producer `star-aggregates` → consumer `starAggregateUpsamplePass`
- producer `mw-aggregate` → consumer `milkyWayUpsamplePass`
- producer `cosmic-web-density` (target `cosmic-web-density`) → consumer
  `cosmicWebDensityUpsamplePass`

`engine.ts`'s `passOverrides.allNames` builds the DebugPanel's toggle list
from `FRAME_ORDER_PASS_NAMES` with no target filter — every producer layer,
`cosmic-web-density` included, gets a toggle row. (Earlier, a
`CONTENT_PASSES.filter((l) => l.target !== 'volume')` excluded the
scalar-volume producer from the list entirely, so unchecking its own removal
wasn't covered by this entry; the `cosmicWebDensity` Layer refactor dropped
that filter, so it now reproduces the same freeze as the other three.)
`executeFrame.ts:184-192` applies the toggle by dropping a layer from its
render group when `disabledPasses[l.name] === true`, and
`if (group.length === 0) break` skips the whole `{ kind: 'render', target }`
step when every layer in the group is disabled. For a single-layer producer
group, unchecking it means the producer's offscreen target is simply never
re-cleared or re-drawn that frame.

The consumer has its own, separate toggle row and keeps running: it
composites `viewOf(target)` into HDR every frame regardless of whether the
producer ran. The result is not "band disappears" but "last-rendered band
freezes in **screen space**" — since the producer stopped updating the
buffer, and the consumer keeps additively re-compositing the stale contents,
the frozen frame visibly smears as the camera orbits.

## Fix

A `renderedTargets.has(target)`-style guard added to each of the four
upsample/consumer layers, so a consumer skips compositing when its producer
didn't run this frame. Local to the four consumer layers; no renderer
restructuring needed.
