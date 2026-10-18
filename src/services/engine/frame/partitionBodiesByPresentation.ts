/**
 * partitionBodiesByPresentation — the ONE apparent-size sort over every scene body: below
 * its own `resolvePx` a body is `unresolved` (a point or glint), at or above it `resolved`
 * (a sphere or mesh). Each drawing pass takes its own bodies from each branch, so no frame
 * can double-draw a body or drop it at a crossing. The size is data on the body, so the
 * sort branches on nothing else; a body the camera sits inside resolves, since
 * `bodyApparentDiameterPx` returns Infinity at distance 0.
 */

import type { PositionedSceneBody } from '../../../@types/engine/frame/PositionedSceneBody';
import type { SceneBodyPresentation } from '../../../@types/engine/frame/SceneBodyPresentation';
import type { Vec3 } from '../../../@types/math/Vec3';
import { bodyApparentDiameterPx } from '../../../utils/scene/bodyApparentDiameterPx';
import { bodyFootprintRadiusM } from '../../../utils/scene/bodyFootprintRadiusM';

export function partitionBodiesByPresentation(input: {
  bodies: readonly PositionedSceneBody[];
  camPosMpc: Readonly<Vec3>;
  pxPerRad: number;
}): SceneBodyPresentation {
  const { bodies, camPosMpc, pxPerRad } = input;
  const unresolved: PositionedSceneBody[] = [];
  const resolved: PositionedSceneBody[] = [];
  for (const positioned of bodies) {
    const diameterPx = bodyApparentDiameterPx({
      positionMpc: positioned.positionMpc,
      radiusM: bodyFootprintRadiusM(positioned.body),
      camPosMpc,
      pxPerRad,
    });
    (diameterPx >= positioned.body.resolvePx ? resolved : unresolved).push(positioned);
  }
  return { unresolved, resolved };
}
