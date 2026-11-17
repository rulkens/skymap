/**
 * outputProjection — the projection of the image a rig presents: the main
 * view's pinhole in mono, the dome master's fisheye (zenith the camera's
 * forward pitched up `DOME_PARAMS.tiltDeg`, front at the bottom) in a dome.
 */

import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { ViewRigKey } from '../../../../@types/engine/frame/ViewRigKey';
import type { ViewProjection } from '../../../../@types/camera/projection/ViewProjection';
import { DOME_PARAMS } from '../../../../data/rendering/domeParams';
import { domeBasis } from '../../../dome/domeBasis';
import { mat3FromColumns } from '../../../math/mat3FromColumns';
import { multiply3x3 } from '../../../math/multiply3x3';
import { viewBasis } from '../viewBasis';

export function outputProjection(
  ctx: Pick<FrameView, 'cam' | 'frustum' | 'canvasSize'>,
  rig: ViewRigKey,
): ViewProjection {
  const basis = viewBasis(ctx.cam);
  const size = ctx.canvasSize;
  if (rig === 'mono') return { kind: 'rectilinear', basis, frustum: ctx.frustum, size };
  const worldFromCamera = mat3FromColumns(basis.right, basis.up, basis.forward);
  return {
    kind: 'fisheye',
    basis: multiply3x3(worldFromCamera, domeBasis(DOME_PARAMS.tiltDeg)),
    centrePx: [size.width / 2, size.height / 2],
    // The master is square; `domeResample` fills the target edge to edge.
    radiusPx: Math.min(size.width, size.height) / 2,
    size,
  };
}
