/**
 * bodyPositionMpcAt — one body's world position at `simDays`, placed by the same rows
 * `deriveBodyStates` walks, for this body only: the whole-scene derive is a one-deep cache that
 * sampling hundreds of instants would thrash; the scene's own sampled craft come from here too.
 * A craft with no track loaded sits at Earth's centre, absent.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import { positionDriverById } from '../../../data/bodies/positionDrivers';
import { SAMPLED_BODIES } from '../../../data/missions/spacecraftBodies';
import { trajectoryRegistry } from '../../../services/bodies/trajectoryRegistry';
import { findByIdOrThrow } from '../../object/findByIdOrThrow';
import { orbitRowPlacement } from '../../orbit/orbitRowPlacement';
import { sampledCraftPositionMpc } from '../../orbit/sampledCraftPositionMpc';

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
      if (track === undefined) return bodyPositionMpcAt('earth', simDays);
      const body = findByIdOrThrow(SAMPLED_BODIES, id, 'bodyPositionMpcAt');
      return sampledCraftPositionMpc(body, track, simDays, bodyPositionMpcAt);
    }
    case 'surfaceFixed':
      throw new Error(`bodyPositionMpcAt: '${id}' is a surface site`);
  }
}
