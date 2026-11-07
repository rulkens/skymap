/**
 * antiquePlateBodies — the frame's globes the plate ray-casts, widest on screen
 * first: every resolved planet or moon drawn as a sphere, plus Earth (not a
 * sorted scene body; `earthPass` draws it alone). Each is cast at the radius its
 * sphere is drawn at, the inner bound, as `texturedBodiesPass` and `earthPass` do.
 * Only Earth, and only when its ocean mask drew, carries the land share.
 */

import type { PassState } from '../../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../../@types/engine/frame/FrameView';
import type { AntiquePlateBody } from '../../../../@types/rendering/AntiquePlateBody';
import type { BodySurface } from '../../../../@types/scene/BodySurface';
import type { Vec3 } from '../../../../@types/math/Vec3';
import { ANTIQUE_RING_LINES_KM } from '../../../../data/rendering/antiquePlateBodies';
import { SCENE_RINGS } from '../../../../data/bodies/sceneRings';
import { SCENE_EARTH } from '../../../../data/bodies/sceneEarth';
import { RENDER_ORIGIN_MPC } from '../../../../data/renderOrigin';
import { antiquePlateBody } from '../../../../utils/gpu/antiqueLook/antiquePlateBody';
import { innerBoundRadiusM } from '../../../../utils/occlusion/innerBoundRadiusM';
import { bodyApparentDiameterPx } from '../../../../utils/scene/bodyApparentDiameterPx';
import { isPlanetBody } from '../../../../utils/scene/isPlanetBody';
import { sceneBodyPresentation } from '../../../engine/frame/sceneBodyPresentation';
import { sceneBodyStates } from '../../../engine/frame/sceneBodyStates';

export function antiquePlateBodies(
  state: PassState,
  ctx: FrameView,
  unitPx: number,
  earthLandMapped: boolean,
): AntiquePlateBody[] {
  const states = sceneBodyStates(state, ctx);
  const records: AntiquePlateBody[] = [];
  const add = (id: string, positionMpc: Readonly<Vec3>, surface: BodySurface, land: boolean) => {
    const ring = SCENE_RINGS.find((r) => r.bodyId === id);
    const lines = ANTIQUE_RING_LINES_KM[id];
    const record = antiquePlateBody({
      positionMpc,
      orientation: states.get(id)!.orientation,
      radiusM: innerBoundRadiusM(surface),
      land,
      ringKm:
        ring && lines
          ? [ring.innerRadiusKm, lines[0], lines[1], lines[2], ring.outerRadiusKm]
          : null,
      eyeMpc: ctx.drawCamPos,
      sunMpc: RENDER_ORIGIN_MPC,
      unitsPerRad: ctx.drawPxPerRad / unitPx,
    });
    if (record !== null) records.push(record);
  };

  for (const { body, positionMpc } of sceneBodyPresentation(ctx).resolved) {
    if (isPlanetBody(body)) add(body.id, positionMpc, body.surface, false);
  }
  const earth = states.get(SCENE_EARTH.id)!.positionMpc;
  const earthPx = bodyApparentDiameterPx({
    positionMpc: earth,
    radiusM: innerBoundRadiusM(SCENE_EARTH.surface),
    camPosMpc: ctx.drawCamPos,
    pxPerRad: ctx.drawPxPerRad,
  });
  if (earthPx >= SCENE_EARTH.resolvePx)
    add(SCENE_EARTH.id, earth, SCENE_EARTH.surface, earthLandMapped);

  return records.sort((a, b) => b.radiusUnits - a.radiusUnits);
}
