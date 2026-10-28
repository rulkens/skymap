/**
 * famousStarOrbit — a famous star's published visual-binary orbit → its
 * `OrbitalElements`, relative to its host star (held fixed, as the elements are
 * published). The sky angles convert in `skyOrbitElements`, in the host's sky
 * frame; 1″ at D parsecs is D au, so the semi-major axis needs the row's distance.
 */

import { SCALE_UNITS } from '../../scaleUnits';
import { planeFrameFromPole } from '../orbitPlaneFrames';
import { skyOrbitElements } from './skyOrbitElements';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import { starTrailTint } from '../../../utils/color/starTrailTint';
import type { FamousStarOrbit } from '../../../@types/data/FamousStarOrbit';
import type { FamousStarRow } from '../../../@types/data/FamousStarRow';
import type { OrbitalElements } from '../../../@types/scene/OrbitalElements';

export function famousStarOrbit(
  row: FamousStarRow,
  orbit: FamousStarOrbit,
  host: FamousStarRow,
): OrbitalElements {
  return skyOrbitElements({
    id: row.id,
    focusId: asSceneBodyId(host.id),
    plane: planeFrameFromPole(host.raDeg, host.decDeg),
    semiMajorMpc: orbit.semiMajorArcsec * row.distancePc * SCALE_UNITS.AU_TO_MPC,
    eccentricity: orbit.eccentricity,
    inclinationDeg: orbit.inclinationDeg,
    ascendingNodeDeg: orbit.ascendingNodeDeg,
    argPeriapsisDeg: orbit.argPeriapsisDeg,
    periapsisEpochYr: orbit.periapsisEpochYr,
    periodYr: orbit.periodYr,
    color: starTrailTint(row.temperatureK),
  });
}
