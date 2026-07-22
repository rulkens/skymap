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
 * they build them. In particular the residency predicate — "is this body's
 * surface texture live on the renderer?" — has ONE definition here rather than a
 * copy in each layer: a body is resident iff its keyed `bodyTextures` slot holds
 * a committed bitmap (`current() != null`). If two layers spelled that lookup
 * separately, a resident body could be counted `textured` by one and `flat` by
 * the other and get double-drawn (both opaque into `foreground:0`, z-fighting).
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
import { bodyTextureSlotKey } from '../../../utils/scene/bodyTextureSlotKey';
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
    // Resident iff the body's SURFACE texture slot holds a committed bitmap. The
    // id is a plain string on the body record; the slot Map is keyed by the
    // composite `bodyId:kind`, and a non-registry body simply misses the Map (→
    // not resident → flat), so the cast is safe. Residency tracks the surface
    // (day) map — the base drawn body — not the feature kinds.
    isTextureResident: (id) =>
      state.assetSlots.bodyTextures
        .get(bodyTextureSlotKey(id as BodyTextureId, 'surface'))
        ?.current() != null,
  });
}
