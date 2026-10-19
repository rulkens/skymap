/**
 * voyageExhibits — one exhibit per destination, each a 1 g trip from the Sun drawn in the ship's
 * frame (`voyageHoldSaga`, `voyagePose`). The settings turn on what the boost recolours and
 * contracts (stars, the Milky Way, galaxies) and start the trip's cluster with every effect on;
 * the hold sets the launch instant.
 */

import { initialState as galaxyCatalogsInitialState } from '../../galaxyCatalog/state/galaxyCatalogs/initialState';
import { initialState as milkyWayInitialState } from '../../milkyWay/state/milkyWay/initialState';
import { initialState as starCatalogsInitialState } from '../../starCatalog/state/starCatalogs/initialState';
import { initialState as voyageInitialState } from '../state/voyage/initialState';
import { section } from '../../../utils/exhibits/section';
import { voyageKind } from './voyageKind';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';
import type { ExhibitId } from '../../../@types/exhibits/ExhibitId';
import type { VoyageDestinationId } from '../@types/VoyageDestinationId';

function voyageExhibit(
  id: ExhibitId,
  destination: VoyageDestinationId,
  label: string,
  lede: string,
): Exhibit {
  return {
    id,
    label,
    settings: {
      starCatalogs: starCatalogsInitialState,
      milkyWay: milkyWayInitialState,
      galaxyCatalogs: galaxyCatalogsInitialState,
      voyage: {
        ...voyageInitialState,
        destination,
        contraction: true,
        doppler: true,
        headlight: 1,
      },
    },
    lede,
    body: [section(voyageKind, { heading: 'Voyage' })],
  };
}

export const voyageExhibits: readonly Exhibit[] = [
  voyageExhibit('voyage-proxima', 'proxima', 'Voyage to Proxima Centauri', ''),
  voyageExhibit('voyage-sgrAStar', 'sgrAStar', 'Voyage to Sagittarius A*', ''),
  voyageExhibit('voyage-m31', 'm31', 'Voyage to Andromeda', ''),
  voyageExhibit('voyage-m87', 'm87', 'Voyage to M87', ''),
];
