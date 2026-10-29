/**
 * positionDrivers — the authored position tables read as one tagged union.
 * Derived, never authored: the source tables stay the single source of truth,
 * and an orbit driver carries its element row whole.
 */

import { SCENE_ANCHORS } from './sceneAnchors';
import { ORBITAL_ELEMENTS } from './orbitalElements';
import { SAMPLED_BODIES } from './sampledBodies';
import { SURFACE_FIXED_SITES } from './surfaceFixedSites';
import type { PositionDriver } from '../../@types/scene/PositionDriver';
import { asSceneBodyId } from '../../utils/scene/asSceneBodyId';
import type { PositionedId } from '../../@types/scene/PositionedId';

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
  ...SAMPLED_BODIES.map((body): PositionDriver => ({ kind: 'sampled', id: body.id, focusId: asSceneBodyId('sun') })),
  ...SURFACE_FIXED_SITES.map((site): PositionDriver => ({ kind: 'surfaceFixed', ...site })),
];

// Indexed, not walked: the per-frame callers (`frameContext`, `glintBandClass`)
// would otherwise scan every anchor, S-star and site once per body per frame.
const BY_ID = new Map<string, PositionDriver>(POSITION_DRIVERS.map((driver) => [driver.id, driver]));

export function positionDriverById(id: string): PositionDriver {
  const driver = BY_ID.get(id);
  if (!driver) throw new Error(`positionDrivers: no entry for id '${id}'`);
  return driver;
}

/** As `positionDriverById`, for an id that may be transient (`transientPositions`): no row is null. */
export function positionDriverOrNull(id: string): PositionDriver | null {
  return BY_ID.get(id) ?? null;
}

/**
 * The body this one hangs off: an orbit's focus, a sampled craft's Sun, a site's host. Anchors hang
 * off nothing. Not the body Layer's `hostBodyId`, which resolves a TEXTURE key's host.
 */
export function bodyHostId(id: string): PositionedId | null {
  const driver = positionDriverById(id);
  switch (driver.kind) {
    case 'anchor':
      return null;
    case 'orbit':
      return driver.elements.focusId;
    case 'sampled':
      return driver.focusId;
    case 'surfaceFixed':
      return driver.hostId;
  }
}
