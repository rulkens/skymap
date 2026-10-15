/**
 * starNearSpheres — the star Layer's `nearSpheres` source: the `spheres` branch
 * of the same partition `starSpheresPass` draws, so NEAR0's range and the
 * occluder set hold exactly the resolved stars. The field-star sphere stays out,
 * as its pass draws it apart from the scene set (`fieldStarSpherePass`).
 */

import type { NearSphereSource } from '../../../@types/engine/frame/NearSphereSource';
import { partitionStarsByResolution, STAR_RESOLVE_PX } from './partitionStarsByResolution';
import { positionedVisibleStars } from './positionedVisibleStars';

export const starNearSpheres: NearSphereSource = {
  spheres: ({ bodyStates, settings, camPosMpc, pxPerRad }) =>
    partitionStarsByResolution({
      stars: positionedVisibleStars(bodyStates, settings.starCatalogs),
      camPosMpc,
      thresholdPx: STAR_RESOLVE_PX,
      pxPerRad,
    }).spheres,
};
