/**
 * SONDERMARKEN_SPOT — where the tour's opening stands a person: the north end of
 * the park scan's lawn, offset from the scan's own seat (`soendermarken.ts`) in
 * the site registry so the spot and the mesh can never drift apart. From here
 * the lawn runs south under the noon Sun and the west opens to the horizon at
 * sunset; nearer the seat, canopy hides both. A `{ sky }` frame tag carries it.
 */
import { SURFACE_FIXED_SITES } from '../../../bodies/surfaceFixedSites';
import { EARTH_DATUM_RADIUS_M } from '../../../bodies/earthDatumRadiusM';
import { findByIdOrThrow } from '../../../../utils/object/findByIdOrThrow';
import { degToRad } from '../../../../utils/math/degToRad';
import type { SkySpot } from '../../../../@types/camera/pose/SkySpot';

const SITE = findByIdOrThrow(SURFACE_FIXED_SITES, 'soendermarken', 'SONDERMARKEN_SPOT');

const NORTH_OF_SEAT_M = 108;
const EAST_OF_SEAT_M = -9;

export const SONDERMARKEN_SPOT: SkySpot = {
  body: SITE.hostId,
  lonRad:
    degToRad(SITE.lonDeg) +
    EAST_OF_SEAT_M / (EARTH_DATUM_RADIUS_M * Math.cos(degToRad(SITE.latDeg))),
  latRad: degToRad(SITE.latDeg) + NORTH_OF_SEAT_M / EARTH_DATUM_RADIUS_M,
};
