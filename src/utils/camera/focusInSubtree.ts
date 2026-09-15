/**
 * Does a focus keep this rung? True when `focusId` IS `rungId` or reaches it up
 * the SURFACE-FIXED chain — a rover keeps its planet's arm (spec §4.8). An
 * orbiting focus stops the walk: it leaves a body-fixed arm behind rather than
 * riding it. No focus constrains no rung, hence null ⇒ true.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import { positionDriverById } from '../../data/bodies/positionDrivers';

export function focusInSubtree(focusId: BodyId | null, rungId: BodyId): boolean {
  if (focusId === null) return true;
  let id: string | null = focusId;
  while (id !== null) {
    if (id === rungId) return true;
    const driver = positionDriverById(id);
    id = driver.kind === 'surfaceFixed' ? driver.hostId : null;
  }
  return false;
}
