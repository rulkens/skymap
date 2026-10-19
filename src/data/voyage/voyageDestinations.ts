/**
 * VOYAGE_DESTINATIONS — the four trips, each placed from the numbers the scene already draws it
 * at: Proxima from the famous-star row, Sgr A* at the Galactic Centre place, M31 and M87 from
 * `data/seeds/famous_galaxies.seed.json` (ra/dec/distanceMpc, and half the diameterKpc as the
 * arrival radius, transcribed; a test pins them).
 * Standoffs: Proxima 0.01 ly; Sgr A* 1 ly, outside the S-star cluster, before general relativity
 * matters; the galaxies 0 (the ship arrives inside a 40 kpc object).
 */

import type { VoyageDestination } from '../../layers/voyage/@types/VoyageDestination';
import type { VoyageDestinationId } from '../../layers/voyage/@types/VoyageDestinationId';
import { FAMOUS_STARS_GENERATED } from '../bodies/famousStars.generated';
import { starAnchor } from '../bodies/makers/starAnchor';
import { GALACTIC_CENTRE_ANCHOR } from '../places/galacticCentre';
import { findByIdOrThrow } from '../../utils/object/findByIdOrThrow';
import { raDecDistToCartesian } from '../../utils/math/raDecDistToCartesian';
import { SCALE_UNITS } from '../scaleUnits';

const PROXIMA = findByIdOrThrow(FAMOUS_STARS_GENERATED, 'proxima-centauri', 'VOYAGE_DESTINATIONS');

export const VOYAGE_DESTINATIONS: Readonly<Record<VoyageDestinationId, VoyageDestination>> = {
  proxima: {
    id: 'proxima',
    label: 'Proxima Centauri',
    positionMpc: starAnchor(PROXIMA).positionMpc,
    arrivalRadiusMpc: null,
    standoffLy: 0.01,
  },
  sgrAStar: {
    id: 'sgrAStar',
    label: 'Sagittarius A*',
    positionMpc: GALACTIC_CENTRE_ANCHOR.positionMpc,
    arrivalRadiusMpc: null,
    standoffLy: 1,
  },
  m31: {
    id: 'm31',
    label: 'Andromeda (M31)',
    positionMpc: raDecDistToCartesian(10.6846845, 41.2689778, 0.7805486914662376),
    arrivalRadiusMpc: (40.376262683545626 / 2) * SCALE_UNITS.KPC_TO_MPC,
    standoffLy: 0,
  },
  m87: {
    id: 'm87',
    label: 'M87 (Virgo)',
    positionMpc: raDecDistToCartesian(187.706364, 12.3905194, 16.780310782909552),
    arrivalRadiusMpc: (34.71571522815503 / 2) * SCALE_UNITS.KPC_TO_MPC,
    standoffLy: 0,
  },
};
