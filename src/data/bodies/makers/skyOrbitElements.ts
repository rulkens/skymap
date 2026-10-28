/**
 * skyOrbitElements — a published sky-plane orbit (`SkyOrbitSpec`) → canonical
 * `OrbitalElements`, the one site of the astrometric-to-frame conversion that
 * the S-stars and the visual binaries share.
 *
 * BOTH sky angles convert — `Ω_frame = 90° − Ω` AND `i_frame = 180° − i`; ω
 * alone passes through, which is what makes dropping the i flip look internally
 * consistent while mirroring every orbit with every invariant intact.
 */

import { degToRad } from '../../../utils/math/degToRad';
import { meanAnomalyAtJ2000 } from '../../../utils/orbit/meanAnomalyAtJ2000';
import { skyInclinationToFrameInclination } from '../../../utils/orbit/skyInclinationToFrameInclination';
import { skyPositionAngleToFrameAngle } from '../../../utils/orbit/skyPositionAngleToFrameAngle';
import { asSceneBodyId } from '../../../utils/scene/asSceneBodyId';
import type { OrbitalElements } from '../../../@types/scene/OrbitalElements';
import type { SkyOrbitSpec } from '../../../@types/scene/SkyOrbitSpec';

const YEARS_PER_JULIAN_CENTURY = 100;

export function skyOrbitElements(spec: SkyOrbitSpec): OrbitalElements {
  return {
    id: asSceneBodyId(spec.id),
    focusId: spec.focusId,
    semiMajorMpc: spec.semiMajorMpc,
    eccentricity: spec.eccentricity,
    inclinationRad: skyInclinationToFrameInclination(spec.inclinationDeg),
    ascendingNodeRad: skyPositionAngleToFrameAngle(spec.ascendingNodeDeg),
    argPeriapsisRad: degToRad(spec.argPeriapsisDeg),
    meanAnomalyRad: meanAnomalyAtJ2000(spec.periapsisEpochYr, spec.periodYr),
    meanAnomalyRateRadPerCty: (2 * Math.PI * YEARS_PER_JULIAN_CENTURY) / spec.periodYr,
    color: spec.color,
    plane: spec.plane,
  };
}
