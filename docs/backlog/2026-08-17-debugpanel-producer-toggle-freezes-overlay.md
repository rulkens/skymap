# Disabling a producer layer in the DebugPanel freezes its overlay instead of hiding it

**Area:** rendering / frame passes · **Readiness:** ready

Three offscreen-producer/consumer pairs share one shape, and the DebugPanel
renderer-toggle list breaks all three the same way:

- producer `zone-of-avoidance` (target `zoa`) → consumer
  `zoneOfAvoidanceUpsampleLayer`
- producer `star-aggregates` → consumer `starAggregateUpsampleLayer`
- producer `mw-aggregate` → consumer `milkyWayUpsampleLayer`

`engine.ts:1002` builds the DebugPanel's toggle list as
`CONTENT_LAYERS.filter((l) => l.target !== 'volume').map((p) => p.name)` —
every producer layer except the scalar-volume one gets a toggle row.
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

`scalar-volume` is the one producer excluded from the toggle list (the
`target !== 'volume'` filter), so it does not exhibit this — checking its
own removal is not covered by this entry.

## Fix

One `target` predicate change to `engine.ts:1002`'s filter (excluding all
three aggregate/zoa producer targets, matching how `volume` is already
excluded), or a `renderedTargets.has(target)`-style guard added to each of
the three upsample/consumer layers so a consumer skips compositing when its
producer didn't run this frame. Either fix is local to the three consumer
layers plus the one filter line; no renderer restructuring needed.
