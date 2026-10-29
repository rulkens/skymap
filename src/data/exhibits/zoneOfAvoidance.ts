/**
 * zoneOfAvoidance — the dust-band exhibit, framed just outside the Milky Way looking down the
 * galactic plane (distance: see `FRAMING_MPC`). Copy is hand-written and user-owned.
 */

import { initialState as galaxyCatalogsInitialState } from '../../layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import { initialState as milkyWayInitialState } from '../../layers/milkyWay/state/milkyWay/initialState';
import { initialState as zoneOfAvoidanceInitialState } from '../../layers/zoneOfAvoidance/state/zoneOfAvoidance/initialState';
import { COSMIC_WEB_DENSITY_OFF } from './utils/cosmicWebDensityOff';
import { section } from '../../utils/exhibits/section';
import { factsKind } from '../../components/ExhibitOverlay/kinds/factsKind';
import { proseKind } from '../../components/ExhibitOverlay/kinds/proseKind';
import { sourcesKind } from '../../components/ExhibitOverlay/kinds/sourcesKind';
import type { Exhibit } from '../../@types/exhibits/Exhibit';

// Forced on: a viewer who switched the band off in the panel would otherwise arrive at nothing.
const BAND_ON = { ...zoneOfAvoidanceInitialState, enabled: true };

// Without the disc there is nothing to read the gap against.
const MILKY_WAY_WITH_MARKER = { ...milkyWayInitialState, enabled: true, labelEnabled: true };

// Only the band and the galaxies take clicks; any other hit opens a card the copy never mentions.
const PICK_BAND_AND_GALAXIES = {
  kinds: {
    zoneOfAvoidance: true,
    galaxyCatalog: true,
    body: false,
    craft: false,
    earthScene: false,
    starCatalog: false,
    structure: false,
    milkyWay: false,
    blackHole: false,
    satellite: false,
  },
};

/**
 * Eye 20° above the galactic plane on the ANTICENTRE side, aiming at the centre where the wedge
 * is 10° wide, not 3° (`ZONE_OF_AVOIDANCE_SHELL`). Derived via `orbitAnglesLookingAlong`, never a
 * hand-rolled inverse; POSITIVE pitch is above the plane (`pitch = asin(-forward.y)`, and
 * `-forward` runs target to EYE). Yaw is swung off-centre so the band clears the notes column.
 */
const GALACTIC_LATITUDE_YAW = -3.15;
const GALACTIC_LATITUDE_PITCH = 0.263728;

/** LOAD-BEARING: the band's `veil` window draws it only between ~0.15 and 6 Mpc (full at 2); cosmic-web distances render nothing. */
const FRAMING_MPC = 1.2;

export const zoneOfAvoidance: Exhibit = {
  id: 'zoneOfAvoidance',
  label: 'Zone of Avoidance',
  settings: {
    zoneOfAvoidance: BAND_ON,
    galaxyCatalogs: galaxyCatalogsInitialState,
    milkyWay: MILKY_WAY_WITH_MARKER,
    cosmicWebDensity: COSMIC_WEB_DENSITY_OFF,
    picking: PICK_BAND_AND_GALAXIES,
  },
  pose: {
    target: [0, 0, 0],
    yaw: GALACTIC_LATITUDE_YAW,
    pitch: GALACTIC_LATITUDE_PITCH,
    distance: FRAMING_MPC,
  },
  lede: 'About a fifth of the extragalactic sky is blocked by our own galaxy. The band marks where the dust and stars of the Milky Way’s disc hide whatever lies behind them.',
  body: [
    section(proseKind, {
      heading: 'What you’re seeing',
      text: 'The haze follows the plane of the Milky Way, where the galaxy catalogues thin out and stop. That gap is not empty space; it is the part of the sky optical surveys cannot see through. The band is a guide drawn over the gap, not measured data.',
    }),
    section(proseKind, {
      heading: 'Why it is there',
      text: 'Dust in the galactic disc absorbs visible light, and the disc’s own stars crowd out anything faint behind them. Longer wavelengths get through: neutral hydrogen radiates at 21 cm, where the Milky Way is effectively transparent, and near-infrared surveys recover much of what optical ones lose. The first two galaxies found this way, <a href="https://en.wikipedia.org/wiki/Maffei_1">Maffei 1 and 2</a>, turned up in 1968.',
    }),
    section(factsKind, {
      facts: [
        { label: 'Obscured sky', value: '~20%' },
        { label: 'Sees through', value: '21 cm (H I)' },
        { label: 'First detections', value: 'Maffei 1 & 2, 1968' },
        { label: 'First described', value: 'Proctor, 1878' },
      ],
    }),
    section(sourcesKind, {
      heading: 'Sources',
      links: [
        {
          role: 'Review',
          title: 'The Universe behind the Milky Way',
          citation: 'Kraan-Korteweg & Lahav 2000',
          href: 'https://arxiv.org/abs/astro-ph/0005501',
        },
      ],
    }),
  ],
};
