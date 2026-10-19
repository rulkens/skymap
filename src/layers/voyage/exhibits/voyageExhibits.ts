/**
 * voyageExhibits — one exhibit per destination, each a 1 g trip from the Sun drawn in the ship's
 * frame (`voyageHoldSaga`, `voyagePose`). The settings turn on what the boost recolours and
 * contracts (stars, the Milky Way, galaxies) and start the trip's cluster with every effect on;
 * the hold sets the launch instant. Facts come from `tripOf`, and the copy's 0.97 and 1.94 from
 * the acceleration (1/a and 2/a), so no trip number is typed by hand.
 */

import { initialState as galaxyCatalogsInitialState } from '../../galaxyCatalog/state/galaxyCatalogs/initialState';
import { initialState as milkyWayInitialState } from '../../milkyWay/state/milkyWay/initialState';
import { initialState as starCatalogsInitialState } from '../../starCatalog/state/starCatalogs/initialState';
import { initialState as voyageInitialState } from '../state/voyage/initialState';
import { A_LY_PER_YR2 } from '../../../data/relativity/properAccelLyPerYr2';
import { VOYAGE_DESTINATIONS } from '../../../data/voyage/voyageDestinations';
import { section } from '../../../utils/exhibits/section';
import { formatScalar } from '../../../utils/format/formatScalar';
import { tripOf } from '../../../utils/relativity/tripOf';
import { formatGamma } from '../../../utils/voyage/formatGamma';
import { formatLightYears } from '../../../utils/voyage/formatLightYears';
import { formatYears } from '../../../utils/voyage/formatYears';
import { voyageTripLy } from '../../../utils/voyage/voyageTripLy';
import { factsKind } from '../../../components/ExhibitOverlay/kinds/factsKind';
import { proseKind } from '../../../components/ExhibitOverlay/kinds/proseKind';
import { sourcesKind } from '../../../components/ExhibitOverlay/kinds/sourcesKind';
import { voyageKind } from './voyageKind';
import type { Exhibit } from '../../../@types/exhibits/Exhibit';
import type { ExhibitId } from '../../../@types/exhibits/ExhibitId';
import type { VoyageDestinationId } from '../@types/VoyageDestinationId';

const HORIZON_LY = (1 / A_LY_PER_YR2).toFixed(2);
const TURNAROUND_LY = (2 / A_LY_PER_YR2).toFixed(2);

const PROSE = [
  section(proseKind, {
    heading: 'Two clocks',
    text: `A moving clock ticks slower by a factor called γ, which keeps growing for as long as the ship pushes. On the far trips the crew ages a few decades while Earth’s clock counts millions of years. In the ship’s own present, Earth’s clock stays under ${HORIZON_LY} years for the whole first half and then leaps ahead: nothing from more than ${HORIZON_LY} light-years behind can catch a ship that keeps accelerating.`,
  }),
  section(proseKind, {
    heading: `${TURNAROUND_LY} light-years at the turn`,
    text: `Halfway, the ship turns round to brake. Measured in its frame at that moment, the whole line from the Sun to the destination is ${TURNAROUND_LY} light-years long, the destination half of that ahead. The same holds for Sagittarius A*, Andromeda and M87: a longer trip reaches a higher γ, and γ squeezes the line by just as much.`,
  }),
  section(proseKind, {
    heading: 'A map of the ship’s frame',
    text: 'The scene is a map: where everything is at one instant of ship time, flattened along the line of flight, bluer ahead and redder behind. The colour shift of the galaxies is a guide to direction, its strength chosen by eye. A photograph from the ship would look different. Light that reaches a camera together left each object at a different time, so the sky would crowd toward the direction of flight and nearby objects would appear turned.',
  }),
];

const SOURCES = section(sourcesKind, {
  heading: 'Sources',
  links: [
    {
      role: 'Physics',
      title: 'Relativity: Special, General, and Cosmological',
      citation: 'Rindler 2006, Oxford University Press',
      href: 'https://global.oup.com/academic/product/relativity-9780198567325',
    },
    {
      role: 'Trip numbers',
      title: 'The Relativistic Rocket',
      citation: 'Gibbs and Baez, Usenet Physics FAQ',
      href: 'https://math.ucr.edu/home/baez/physics/Relativity/SR/Rocket/rocket.html',
    },
    {
      role: 'Photograph',
      title: 'Invisibility of the Lorentz Contraction',
      citation: 'Terrell 1959, Physical Review 116:1041',
      href: 'https://doi.org/10.1103/PhysRev.116.1041',
    },
    {
      role: 'Photograph',
      title: 'The apparent shape of a relativistically moving sphere',
      citation: 'Penrose 1959, Proc. Cambridge Phil. Soc. 55:137',
      href: 'https://doi.org/10.1017/S0305004100033776',
    },
  ],
});

function voyageExhibit(
  id: ExhibitId,
  destination: VoyageDestinationId,
  label: string,
  lede: string,
): Exhibit {
  const tripLy = voyageTripLy(VOYAGE_DESTINATIONS[destination]);
  const trip = tripOf(tripLy);
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
    body: [
      section(voyageKind, { heading: 'Voyage' }),
      section(factsKind, {
        facts: [
          { label: 'Distance', value: formatLightYears(tripLy) },
          { label: 'Ship time', value: `${formatScalar(trip.tauTotalYr)} yr` },
          { label: 'Earth time', value: formatYears(trip.tEarthTotalYr) },
          { label: 'Peak γ', value: formatGamma(trip.gammaMax) },
        ],
      }),
      ...PROSE,
      SOURCES,
    ],
  };
}

export const voyageExhibits: readonly Exhibit[] = [
  voyageExhibit(
    'voyage-proxima',
    'proxima',
    'Voyage to Proxima Centauri',
    'A ship that pushes at one g, the pull of gravity at Earth’s surface, reaches the nearest star while its crew ages only a few years.',
  ),
  voyageExhibit(
    'voyage-sgrAStar',
    'sgrAStar',
    'Voyage to Sagittarius A*',
    'At one g the whole way, a ship reaches the black hole at the centre of the Milky Way in two decades of its own time.',
  ),
  voyageExhibit(
    'voyage-m31',
    'm31',
    'Voyage to Andromeda',
    'At one g the whole way, a ship reaches the Andromeda Galaxy within a human lifetime of its own time.',
  ),
  voyageExhibit(
    'voyage-m87',
    'm87',
    'Voyage to M87',
    'At one g the whole way, a ship crosses to M87, the giant galaxy at the heart of the Virgo Cluster, within a human lifetime of its own time.',
  ),
];
