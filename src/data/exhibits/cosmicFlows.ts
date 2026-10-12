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
  lede: 'As space expands it carries the galaxies apart. With the expansion removed, this is what remains: every galaxy falling towards its heaviest neighbours.',
  body: [
    {
      kind: 'prose',
      heading: 'What you’re seeing',
      text: 'Each ribbon is the path matter takes as it falls. The ribbons start in the emptier regions and end where galaxies have piled up. The Milky Way is on one of them, moving at about 600 km/s: two million kilometres every hour.',
    },
    {
      kind: 'prose',
      heading: 'How it was made',
      text: 'Nobody can watch a galaxy move. Its speed along our line of sight shows up as a mismatch between its distance and its redshift, the stretching of its light. Cosmicflows-4 has that mismatch for about 56,000 galaxies. The ribbons average 10,000 flows that fit them.',
    },
    {
      kind: 'prose',
      heading: 'Laniakea',
      text: 'The ribbons around us end near the Great Attractor, about 220 million light-years away and hidden behind the dust of our own galaxy. Everything that falls there is one supercluster: <a href="https://en.wikipedia.org/wiki/Laniakea_Supercluster">Laniakea</a>, Hawaiian for “immense heaven”. Its edge is a watershed. Beyond it, galaxies fall the other way.',
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
        { label: 'Galaxies measured', value: '55,877' },
        { label: 'Laniakea, across', value: '520 million light-years' },
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
