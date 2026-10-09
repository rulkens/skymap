/**
 * bodyPositionMpcAt — one body's world position at `simDays`, placed by the same rows
 * `deriveBodyStates` walks, for this body only: the whole-scene derive is a one-deep cache that
 * sampling hundreds of instants would thrash. A craft before its track (or with none loaded)
 * sits at Earth, as it does in the scene.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import { positionDriverById } from '../../../data/bodies/positionDrivers';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { trajectoryRegistry } from '../../../services/bodies/trajectoryRegistry';
import { hermiteTrackAt } from '../../orbit/hermiteTrackAt';
import { orbitRowPlacement } from '../../orbit/orbitRowPlacement';

export function bodyPositionMpcAt(id: string, simDays: number): Vec3 {
  const driver = positionDriverById(id);
  switch (driver.kind) {
    case 'anchor':
      return driver.positionMpc;
    case 'orbit':
      return orbitRowPlacement(
        driver.elements,
        bodyPositionMpcAt(driver.elements.focusId, simDays),
        simDays,
      ).positionMpc;
    case 'sampled': {
      const track = trajectoryRegistry.get(id);
      if (track === undefined || simDays < track.tDays[0]!)
        return bodyPositionMpcAt('earth', simDays);
      const km = hermiteTrackAt(track, simDays);
      const sun = bodyPositionMpcAt(driver.focusId, simDays);
      const k = SCALE_UNITS.KM_TO_MPC;
      return [sun[0] + km[0] * k, sun[1] + km[1] * k, sun[2] + km[2] * k];
    }
    case 'surfaceFixed':
      throw new Error(`bodyPositionMpcAt: '${id}' is a surface site`);
  }
}
