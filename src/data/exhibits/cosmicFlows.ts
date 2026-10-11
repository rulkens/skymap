/**
 * cosmicFlows — the CF4++ peculiar-velocity exhibit: flow ribbons alone, with
 * the galaxies and the Milky Way out of the way so the current is the only
 * thing moving. Copy is hand-written and user-owned; nothing generates this file.
 */

import { initialState as flowInitialState } from '../../layers/flow/state/flow/initialState';
import { initialState as galaxyCatalogsInitialState } from '../../layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import { initialState as milkyWayInitialState } from '../../layers/milkyWay/state/milkyWay/initialState';
import { mergeSnapshot } from '../../state/settings/mergeSnapshotAction';
import { SURVEYS_OFF } from './utils/surveysOff';
import { COSMIC_WEB_DENSITY_OFF } from './utils/cosmicWebDensityOff';
import type { Exhibit } from '../../@types/exhibits/Exhibit';

// The Milky Way stays ON here, label included: that label IS the "you are
// here" marker (`MilkyWaySettings.labelEnabled`), and an exhibit about which
// way we are being carried is unreadable without the "we".
const MILKY_WAY_WITH_MARKER = { ...milkyWayInitialState, enabled: true, labelEnabled: true };

// The ribbons' own cool→warm speed ramp, sampled at five points from
// `shaders/flow/vertex.wesl`: `mix(COOL, WARM, t) + t²·GLOW`, t = speed /
// SPEED_COLOR_MAX. The glow term is why the hot end whitens rather than staying
// orange, so the legend has to include it or it reads as a different scale.
// Retune those constants and these stops go stale — WESL constants aren't
// importable, so there is no shared source to derive them from.
const FLOW_SPEED_RAMP = ['#2e6bff', '#6a78d4', '#b695b9', '#ffc2ae', '#ffffb3'];

/** `SPEED_COLOR_MAX` in `shaders/flow/constants.wesl`, spelled for a reader. */
const FLOW_SPEED_MAX = '1200 km/s';

export const cosmicFlows: Exhibit = {
  id: 'cosmicFlows',
  label: 'Cosmic Flows',
  settings: {
    flow: { ...flowInitialState, enabled: true },
    galaxyCatalogs: SURVEYS_OFF,
    milkyWay: MILKY_WAY_WITH_MARKER,
    cosmicWebDensity: COSMIC_WEB_DENSITY_OFF,
  },
  // Same world bearing the shipped `cosmicFlows` clip's `start` frames the
  // Local Group with — copied, not imported, since that field's type is
  // `CameraPose | 'live'`.
  pose: { target: [0, -0.01, 0], yaw: -1.7455, pitch: -0.3589, distance: 0.14 },
  lede: 'Space is expanding, and that carries galaxies apart. Each galaxy also moves on its own, pulled by the mass around it.',
  body: [
    {
      kind: 'prose',
      heading: 'What you’re seeing',
      text: 'Each ribbon follows the way matter moves once the expansion is taken out. The ribbons leave the emptier regions and meet where mass has collected. The Milky Way moves with them at about 600 km/s.',
    },
    {
      kind: 'prose',
      heading: 'How it was made',
      text: 'Only a galaxy’s motion along our line of sight can be measured, as a mismatch between its distance and its redshift, the stretching of its light. Cosmicflows-4 holds those distances for about 56,000 galaxies. The map is the flow that fits them best.',
    },
    {
      kind: 'prose',
      heading: 'Laniakea',
      text: '<a href="https://en.wikipedia.org/wiki/Laniakea_Supercluster">Laniakea</a> is our supercluster: the region whose galaxies all flow towards the same place. Its edge is where they start to flow somewhere else.',
    },
    {
      kind: 'key',
      heading: 'Key',
      ramp: FLOW_SPEED_RAMP,
      ends: ['0 km/s', FLOW_SPEED_MAX],
      toggle: {
        label: 'Galaxies',
        onWord: 'shown',
        offWord: 'hidden in this view',
        on: [mergeSnapshot({ galaxyCatalogs: galaxyCatalogsInitialState })],
        off: [mergeSnapshot({ galaxyCatalogs: SURVEYS_OFF })],
      },
    },
    {
      kind: 'facts',
      facts: [
        // 1000 Mpc box on a 128³ grid: 7.8 Mpc per cell, at 3.26 Mly per Mpc.
        { label: 'Width mapped', value: '3.3 billion light-years' },
        { label: 'Finest detail', value: '25 million light-years' },
      ],
    },
    {
      kind: 'sources',
      heading: 'Sources',
      links: [
        {
          role: 'Data',
          title: 'CF4++ velocity reconstruction',
          citation: 'Courtois et al. 2025',
          href: 'https://projets.ip2i.in2p3.fr/cosmicflows/',
        },
        {
          role: 'Catalogue',
          title: 'Cosmicflows-4',
          citation: 'Tully et al. 2023',
          href: 'https://doi.org/10.3847/1538-4357/ac94d8',
        },
        {
          role: 'Concept',
          title: 'The Laniakea supercluster of galaxies',
          citation: 'Tully et al. 2014',
          href: 'https://arxiv.org/abs/1409.0880',
        },
      ],
    },
  ],
};
