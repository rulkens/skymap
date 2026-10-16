/**
 * meshBodyCaption — the `ForegroundCaption` for one mesh body, shared by core's
 * `sceneBodyLabels` and the missions Layer's `produceMissionCaptions`, so a
 * craft's name reads the same whichever producer emits it.
 */

import type { Vec3 } from '../../@types/math/Vec3';
import type { MeshBody } from '../../@types/scene/MeshBody';
import type { ForegroundCaption } from '../../services/engine/presentation/foregroundCaption';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { scaleToUnitMax } from '../color/scaleToUnitMax';
import { bodyFootprintRadiusM } from '../scene/bodyFootprintRadiusM';
import { bodyCaption } from './bodyCaption';

export function meshBodyCaption(body: MeshBody, positionMpc: Readonly<Vec3>): ForegroundCaption {
  // A baked `albedo` is a mean over the whole surface — dark skin, or
  // (petunias) an atlas averaging in black gaps — far below a planet's, so it
  // is scaled to full brightness: the caption keeps the hue, not the darkness.
  const caption = bodyCaption(
    body,
    bodyFootprintRadiusM(body),
    positionMpc,
    scaleToUnitMax(body.albedo),
    'meshBody',
  );
  // The seed's reveal distance becomes alpha 1 at it and 0 at twice it; the ×2
  // is the one place the band's width lives, so a seed tune stays one number.
  const revealM = body.captionRevealM;
  const fullAt = revealM === undefined ? undefined : revealM * SCALE_UNITS.M_TO_MPC;
  return {
    ...caption,
    bodyId: body.id,
    revealBand: fullAt === undefined ? undefined : { fullAt, goneAt: 2 * fullAt },
  };
}
