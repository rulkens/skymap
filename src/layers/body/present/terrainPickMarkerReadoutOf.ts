/**
 * terrainPickMarkerReadoutOf — the overlay's two numbers from the tile stream, over
 * the stream's engaged body (the only one `heightAt` answers for), seen from one view.
 * The cursor is in the canvas's texture pixels, the space a view's `canvasSize` is in.
 */

import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { Vec2 } from '../../../@types/math/Vec2';
import type { BodyRuntime } from '../@types/BodyRuntime';
import type { TerrainPickMarkerReadout } from '../@types/TerrainPickMarkerReadout';
import { frustumFovYRad } from '../../../utils/camera/frustumFovYRad';
import { terrainPickUnderCursor } from './terrainPickUnderCursor';

export const NO_TERRAIN_PICK_MARKER_READOUT: TerrainPickMarkerReadout = {
  heightM: null,
  levelAtEye: null,
};

export function terrainPickMarkerReadoutOf(
  tiles: BodyRuntime['surfaceTiles'],
  view: FrameView,
  cursorPx: Readonly<Vec2> | null,
): TerrainPickMarkerReadout {
  const bodyId = tiles.stream.residency.engagedBodyId();
  const pose = bodyId === null ? null : view.bodyPose(bodyId);
  if (bodyId === null || pose === null) return NO_TERRAIN_PICK_MARKER_READOUT;
  const { params } = tiles.plan;
  const pick =
    cursorPx === null
      ? null
      : terrainPickUnderCursor({
          tiles,
          bodyId,
          pose,
          cursorPx,
          viewportPx: [view.canvasSize.width, view.canvasSize.height],
          fovYRad: frustumFovYRad(view.frustum),
        });
  return {
    heightM: pick === null ? null : tiles.stream.heightAt(bodyId, pick.pointM, params),
    levelAtEye: tiles.stream.residentHeightLevelAt(bodyId, pose.eyeRelBodyM, params),
  };
}
