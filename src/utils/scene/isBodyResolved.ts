import type { PositionedSceneBody } from '../../@types/engine/frame/PositionedSceneBody';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import { bodyApparentDiameterPx } from './bodyApparentDiameterPx';
import { bodyFootprintRadiusM } from './bodyFootprintRadiusM';

/**
 * isBodyResolved — is this body drawn as a sphere or mesh (at or above its own `resolvePx`)
 * rather than a point or glint? The single rule `partitionBodiesByPresentation` sorts by, so a
 * caller that needs only the resolved bodies can test them without building both lists.
 */
export function isBodyResolved(
  { body, positionMpc }: PositionedSceneBody,
  camPosMpc: Readonly<Vec3>,
  pxPerRad: number,
): boolean {
  const diameterPx = bodyApparentDiameterPx({
    positionMpc,
    radiusM: bodyFootprintRadiusM(body),
    camPosMpc,
    pxPerRad,
  });
  return diameterPx >= body.resolvePx;
}
