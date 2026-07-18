# Foreground body draw/drawPick share a per-frame resolved set

Surfaced by the Task-14 entanglement-radar pass over the Stage 2 body-picking diff.

The NEAR0 body layers each recompute their visible/resolved set twice — once in `draw`,
once in `drawPick` — because `ContentLayer` has no shared per-frame scratch. The cull
logic is single-homed (`partitionStarsByResolution` + `STAR_RESOLVE_PX`,
`planetResolvesPx`), so today the two sites cannot drift on the result, only on a future
author editing one and not the other. At deep zoom the star partition runs up to 4×
(`starSpheresLayer.{draw,drawPick}` + `starPointsLayer.{draw,drawPick}`). A per-layer
(or per-frame, keyed on view identity) `resolvedSet(view, ctx, state)` both methods
consume would remove the drift surface and the recompute.

Design-bearing: touches the `ContentLayer` shape / frame-context wiring. Guarded for now
by `passes.test.ts` (nine-pickable pin) + the `starSpheresLayer.drawPick` seed-index
regression.
