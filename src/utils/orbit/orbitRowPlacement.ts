/**
 * orbitRowPlacement — one orbit driver placed at `simDays` around its focus: Kepler plus the
 * row's fitted Horizons correction, less any pair reflex. A moon's correction also shifts M
 * before Kepler so it stays on its conic. Shared by `deriveBodyStates` (the whole scene) and
 * `bodyPositionMpcAt` (one body) so the two cannot place a body differently.
 */

import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import type { PositionDriver } from '../../@types/scene/PositionDriver';
import type { Vec3 } from '../../../packages/shared/src/@types/math/Vec3';
import { SCALE_UNITS } from '../../data/scaleUnits';
import { addVec3 } from '../math/addVec3';
import { correctionSeriesAt } from './correctionSeriesAt';
import { keplerianPositionMpc } from './keplerianPositionMpc';
import { propagateElements } from './propagateElements';

export function orbitRowPlacement(
  driver: Extract<PositionDriver, { kind: 'orbit' }>,
  focusMpc: Vec3,
  simDays: number,
): { positionMpc: Vec3; orbit: OrbitalElements } {
  const { correction, reflex } = driver;
  let propagated = propagateElements(driver.elements, simDays);
  const dM =
    correction?.meanAnomalyRad &&
    correctionSeriesAt(correction.meanAnomalyRad, simDays, correction.outside);
  if (dM) propagated = { ...propagated, meanAnomalyRad: propagated.meanAnomalyRad + dM[0]! };
  const position = addVec3(focusMpc, keplerianPositionMpc(propagated));
  const km =
    correction?.positionKm &&
    correctionSeriesAt(correction.positionKm, simDays, correction.outside);
  if (km) {
    const k = SCALE_UNITS.KM_TO_MPC;
    position[0] += km[0]! * k;
    position[1] += km[1]! * k;
    position[2] += km[2]! * k;
  }
  // The secondary is propagated inline: `FOCUS_ORDER` places it after its primary.
  if (reflex !== undefined) {
    const s = keplerianPositionMpc(propagateElements(reflex.secondary, simDays));
    position[0] -= reflex.k * s[0];
    position[1] -= reflex.k * s[1];
    position[2] -= reflex.k * s[2];
  }
  return { positionMpc: position, orbit: propagated };
}
