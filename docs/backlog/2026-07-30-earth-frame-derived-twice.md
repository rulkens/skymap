# Earth's local frame is derived twice per frame

`needs-design`

## The problem

`runFrame.ts` computes the slab view, Earth's live position/orientation, its
radius in Mpc, and the resulting MVP and camera-local position to build the
tile plan. `earthLayer.ts`'s `draw` computes the same expressions again,
independently, to build the draw uniforms. The plan says which tiles the
fragment will want to sample; the uniforms say where the fragment actually
samples from. Nothing but two files spelling the same arithmetic in
agreement keeps those two statements in sync.

## Verified current state

`runFrame.ts:592-610`, inside the Earth-tile planning block:

```ts
const view = slabViewOf(ctx, NEAR0);
const earthState = sceneBodyStates(state, ctx).get(earth.id)!;
const radiusMpc = earth.radiusKm * SCALE_UNITS.KM_TO_MPC;
const plan = planEarthTiles({
  ...params,
  camPosLocal: camPosLocal(view.camPos, earthState.positionMpc, radiusMpc, earthState.orientation),
  viewProjLocal: composeBodyMvp(
    view.slab.vp,
    earthState.positionMpc,
    RENDER_ORIGIN_MPC,
    radiusMpc,
    earthState.orientation,
  ),
  viewportPx: view.viewportPx,
});
```

`earthLayer.ts:117-145`, inside `draw`:

```ts
const earthState = sceneBodyStates(state, ctx).get(earth.id)!;
const mvp = composeBodyMvp(
  view.slab.vp,
  earthState.positionMpc,
  RENDER_ORIGIN_MPC,
  earth.radiusKm * SCALE_UNITS.KM_TO_MPC,
  earthState.orientation,
);
const camLocal = camPosLocal(
  view.camPos,
  earthState.positionMpc,
  earth.radiusKm * SCALE_UNITS.KM_TO_MPC,
  earthState.orientation,
);
```

Both call `composeBodyMvp` and `camPosLocal` with the same slab
(`NEAR0`/`view.slab.vp`), the same `earthState`, and the same
`earth.radiusKm * SCALE_UNITS.KM_TO_MPC` — but as two separate call sites
that must each get every argument right, in the same order, for the plan
and the draw to agree about where Earth's local frame is. `runFrame.ts`'s
own comment at the plan call site (`:586-591`) names the risk directly:
"Deriving the plan's frame any other way would let the tiles the planner
asks for drift from the pixels the fragment samples them into." That is a
statement of what must not diverge, not a mechanism that prevents it from
diverging — the two computations have no shared source, only a shared
intention.

A future edit to either site (a slab change, an extra transform, a
different rounding order) can update one call and miss the other, and the
failure mode is a globe that still renders — just sampling tiles planned for
a different frame than the one it draws, which reads as "the texture is
subtly wrong," the same class of silent failure the antimeridian and flip
bugs in this feature already occupy.

## The house precedent

`prepareStarCut`, exported from
`src/services/engine/frame/passes/starCatalogLayer.ts` and called by
`runFrame.ts:670`, is the existing pattern for "a planner needs the same
per-frame derivation the draw pass needs": one function computes the shared
values once, returns them, and both the planning step and the draw step read
off the same returned object rather than each deriving their own copy.

## Directions to explore (design decides)

- Extract a function (mirroring `prepareStarCut`'s shape) that computes
  Earth's local frame — `earthState`, `radiusMpc`, the MVP, `camPosLocal` —
  once per frame in `runFrame.ts`, and have both the tile-planning block and
  `earthLayer.draw` take it as an input rather than recomputing it.
- Decide whether `earthLayer`'s pick-silhouette path (which also calls
  `composeBodyMvp` off `view.slab.vp`, `earthRenderer.ts` pick section) folds
  into the same shared computation or stays separate — it draws from the
  same slab but doesn't need the tile plan's inputs.

## Related

`src/services/engine/frame/runFrame.ts`,
`src/services/engine/frame/passes/earthLayer.ts`,
`src/services/engine/frame/passes/starCatalogLayer.ts` (`prepareStarCut`).
