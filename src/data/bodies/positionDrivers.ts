/**
 * positionDrivers — the three authored position tables read as one tagged
 * union, so a consumer asking "how does this body get its position?" or "what
 * does it hang off?" does not have to probe each table for membership.
 *
 * Derived, never authored: `SCENE_ANCHORS`, `ORBITAL_ELEMENTS` and
 * `SURFACE_FIXED_SITES` remain the single source of truth, and an orbit driver
 * carries its element row whole rather than a narrowed copy of it.
 */

import { SCENE_ANCHORS } from './sceneAnchors';
import { ORBITAL_ELEMENTS } from './orbitalElements';
import { SURFACE_FIXED_SITES } from './surfaceFixedSites';
import type { PositionDriver } from '../../@types/scene/PositionDriver';

export const POSITION_DRIVERS: readonly PositionDriver[] = [
  ...SCENE_ANCHORS.map(
    (anchor): PositionDriver => ({
      kind: 'anchor',
      id: anchor.id,
      positionMpc: anchor.positionMpc,
    }),
  ),
  ...ORBITAL_ELEMENTS.map(
    (elements): PositionDriver => ({ kind: 'orbit', id: elements.id, elements }),
  ),
  ...SURFACE_FIXED_SITES.map((site): PositionDriver => ({ kind: 'surfaceFixed', ...site })),
];

// Indexed, not walked: the per-frame callers (`frameContext`, `glintBandClass`)
// would otherwise scan every anchor, S-star and site once per body per frame.
const BY_ID = new Map(POSITION_DRIVERS.map((driver) => [driver.id, driver]));

export function positionDriverById(id: string): PositionDriver {
  const driver = BY_ID.get(id);
  if (!driver) throw new Error(`positionDrivers: no entry for id '${id}'`);
  return driver;
}

/**
 * The body this one hangs off: an orbit's focus, a site's host. Anchors hang
 * off nothing. Not `utils/scene/hostBodyId`, which resolves a TEXTURE key's host.
 */
export function bodyHostId(id: string): string | null {
  const driver = positionDriverById(id);
  switch (driver.kind) {
    case 'anchor':
      return null;
    case 'orbit':
      return driver.elements.focusId;
    case 'surfaceFixed':
      return driver.hostId;
  }
}
