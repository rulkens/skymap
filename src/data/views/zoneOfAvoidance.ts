/**
 * zoneOfAvoidance — the dust-band view, framed just outside the Milky Way
 * looking down the galactic plane, where the wedge the catalogs cannot see
 * through cuts across the galaxy field. The distance is dictated by the band's
 * own scale window, not by taste — see `FRAMING_MPC`. Copy is hand-written and
 * user-owned; nothing generates this file.
 */

import { initialState as galaxyCatalogsInitialState } from '../../layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import { initialState as milkyWayInitialState } from '../../layers/milkyWay/state/milkyWay/initialState';
import { initialState as zoneOfAvoidanceInitialState } from '../../layers/zoneOfAvoidance/state/zoneOfAvoidance/initialState';
import { VOLUMES_OFF } from './utils/volumesOff';
import type { View } from '../../@types/views/View';

// The band is the subject, so the view forces it on rather than inheriting it:
// it boots enabled, but a viewer who switched it off in the panel would
// otherwise arrive at a view of nothing.
const BAND_ON = { ...zoneOfAvoidanceInitialState, enabled: true };

// The disc and its "you are here" label stay on: the band IS the plane of this
// galaxy, and without the disc there is nothing to read the gap against.
const MILKY_WAY_WITH_MARKER = { ...milkyWayInitialState, enabled: true, labelEnabled: true };

/**
 * Only the band and the galaxies take clicks. The point of the view is the
 * relationship between those two — a stray hit on a survey star or a cluster
 * ring opens an InfoCard about something the copy never mentions.
 */
const PICK_BAND_AND_GALAXIES = {
  kinds: {
    zoneOfAvoidance: true,
    galaxyCatalog: true,
    body: false,
    star: false,
    structure: false,
    milkyWay: false,
  },
};

/**
 * Eye 20° above the galactic plane on the ANTICENTRE side, so the aim runs
 * toward the galactic centre where the wedge is at its 10° bulge width rather
 * than the 3° it narrows to the other way (`ZONE_OF_AVOIDANCE_SHELL`).
 * Derived through `orbitAnglesLookingAlong` against the ecliptic basis — the
 * default orientation — never a hand-rolled inverse. POSITIVE pitch is above
 * the plane: that helper solves `pitch = asin(-forward.y)`, and `-forward`
 * runs from target to EYE. Yaw is then swung off the exact centre so the band
 * crosses frame-left, clearing the overlay's right-hand notes column.
 */
const GALACTIC_LATITUDE_YAW = -3.15;
const GALACTIC_LATITUDE_PITCH = 0.263728;

/**
 * LOAD-BEARING, and not a framing choice: the band is only drawn between
 * roughly 0.15 Mpc and 6 Mpc. `zoneOfAvoidanceLayerOpacity` composes an
 * approach band with `SCALE_FADE_BANDS.zoneOfAvoidanceRecede` (full at 2 Mpc,
 * gone by 6), because the guide is scoped to the Milky-Way-context shot. Frame
 * this view at cosmic-web distances and it renders nothing at all.
 */
const FRAMING_MPC = 1.2;

export const zoneOfAvoidance: View = {
  id: 'zoneOfAvoidance',
  label: 'Zone of Avoidance',
  settings: {
    zoneOfAvoidance: BAND_ON,
    galaxyCatalogs: galaxyCatalogsInitialState,
    milkyWay: MILKY_WAY_WITH_MARKER,
    volumes: VOLUMES_OFF,
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
    {
      kind: 'prose',
      heading: 'What you’re seeing',
      text: 'The haze follows the plane of the Milky Way, where the galaxy catalogues thin out and stop. That gap is not empty space; it is the part of the sky optical surveys cannot see through. The band is a guide drawn over the gap, not measured data.',
    },
    {
      kind: 'prose',
      heading: 'Why it is there',
      text: 'Dust in the galactic disc absorbs visible light, and the disc’s own stars crowd out anything faint behind them. Longer wavelengths get through: neutral hydrogen radiates at 21 cm, where the Milky Way is effectively transparent, and near-infrared surveys recover much of what optical ones lose. The first two galaxies found this way, <a href="https://en.wikipedia.org/wiki/Maffei_1">Maffei 1 and 2</a>, turned up in 1968.',
    },
    {
      kind: 'facts',
      facts: [
        { label: 'Obscured sky', value: '~20%' },
        { label: 'Sees through', value: '21 cm (H I)' },
        { label: 'First detections', value: 'Maffei 1 & 2, 1968' },
        { label: 'First described', value: 'Proctor, 1878' },
      ],
    },
    {
      kind: 'sources',
      heading: 'Sources',
      links: [
        {
          role: 'Review',
          title: 'The Universe behind the Milky Way',
          citation: 'Kraan-Korteweg & Lahav 2000',
          href: 'https://arxiv.org/abs/astro-ph/0005501',
        },
      ],
    },
  ],
};
