/**
 * sceneBodyPartition — resolve THE per-frame `{ glints, flat, textured }` split
 * of the seeded non-Earth bodies from live engine state.
 *
 * `partitionBodiesByPresentation` is pure — it takes a body list, the per-frame
 * body-state snapshot (`sceneBodyStates`), a camera, a projection, and an
 * `isTextureResident` predicate. This thin adapter binds those inputs to the
 * current frame ONCE so the layers that consume opposite
 * branches (`planetsLayer` the `flat` branch, `texturedBodiesLayer` the
 * `textured` branch, and eventually the glints layer) cannot drift apart on how
 * they build them. If two layers spelled the residency lookup separately, a
 * resident body could be counted `textured` by one and `flat` by the other and
 * get double-drawn (both opaque into `foreground:0`, z-fighting).
 *
 * Residency is a RENDERING fact, so it is asked of the renderer: "is a real
 * surface texture bound for this body?" (`texturedBodyRenderer.hasMap`). The
 * loading system is not consulted. A committed `bodyTextures` slot used to stand
 * in for the fact, and that proxy holds only while every bound texture has a slot
 * behind it — which stops being true the moment the renderer can hold a texture
 * from another source (a shared body atlas tile). Asking the drawer what it has
 * bound cannot go stale that way. Residency tracks the surface (day) map — the
 * base drawn body — not the feature kinds.
 *
 * The apparent-size inputs are read off the frame context the same way in
 * `enabled` and `draw`: `ctx.drawCamPos` for the camera, `ctx.canvasSize.height`
 * for the viewport, `ctx.fovYRad` for the projection. Both call sites of both
 * layers therefore see the identical partition, which is the whole point — one
 * partition, consumed on opposite branches, is what keeps the descent handoff
 * seamless with no threshold-crossing double-draw or drop.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import { partitionBodiesByPresentation } from './partitionBodiesByPresentation';
import { sceneBodyStates } from './sceneBodyStates';

export function sceneBodyPartition(
  state: EngineState,
  ctx: ReadyFrameContext,
): { glints: readonly PlanetBody[]; flat: readonly PlanetBody[]; textured: readonly PlanetBody[] } {
  return partitionBodiesByPresentation({
    bodies: state.data.bodies.planets,
    bodyStates: sceneBodyStates(state, ctx),
    camPosMpc: ctx.drawCamPos,
    viewportHeightPx: ctx.canvasSize.height,
    fovYRad: ctx.fovYRad,
    // Resident iff the renderer has a real SURFACE map bound for the body. The
    // id is a plain string on the body record while the renderer is keyed by
    // `BodyTextureId`; a non-registry body simply misses that Map (→ not
    // resident → flat), so the cast is safe. Before the GPU is up there is no
    // renderer and nothing is drawn textured, hence the `?? false`.
    isTextureResident: (id) =>
      state.gpu.texturedBodyRenderer?.hasMap(id as BodyTextureId, 'surface') ?? false,
  });
}
