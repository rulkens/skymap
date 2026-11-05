/**
 * SONDERMARKEN_SPOT — where the tour's opening stands a person: the park scan's
 * own seat (`soendermarken.ts`), read from the site registry so the spot and the
 * mesh can never drift apart. A `{ sky }` frame tag carries it.
 */
import { SURFACE_FIXED_SITES } from '../../../bodies/surfaceFixedSites';
import { findByIdOrThrow } from '../../../../utils/object/findByIdOrThrow';
import { degToRad } from '../../../../utils/math/degToRad';
import type { SkySpot } from '../../../../@types/camera/pose/SkySpot';

const SITE = findByIdOrThrow(SURFACE_FIXED_SITES, 'soendermarken', 'SONDERMARKEN_SPOT');

export const SONDERMARKEN_SPOT: SkySpot = {
  body: SITE.hostId,
  lonRad: degToRad(SITE.lonDeg),
  latRad: degToRad(SITE.latDeg),
};
