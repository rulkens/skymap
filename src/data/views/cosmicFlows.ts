/**
 * cosmicFlows — the CF4++ peculiar-velocity view: flow ribbons alone, with the
 * galaxies and the Milky Way out of the way so the current is the only thing
 * moving. Copy is hand-written and user-owned; nothing generates this file.
 */

import { initialState as flowInitialState } from '../../layers/flow/state/flow/initialState';
import { initialState as galaxyCatalogsInitialState } from '../../layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import { initialState as milkyWayInitialState } from '../../layers/milkyWay/state/milkyWay/initialState';
import { mergeSnapshot } from '../../state/settings/mergeSnapshotAction';
import { GALAXIES_OFF } from './galaxiesOff';
import { VOLUMES_OFF } from './volumesOff';
import type { View } from '../../@types/views/View';

// The Milky Way stays ON here, label included: that label IS the "you are
// here" marker (`MilkyWaySettings.labelEnabled`), and a view about which way
// we are being carried is unreadable without the "we".
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

export const cosmicFlows: View = {
  id: 'cosmicFlows',
  label: 'Cosmic Flows',
  settings: {
    flow: { ...flowInitialState, enabled: true },
    galaxyCatalogs: GALAXIES_OFF,
    milkyWay: MILKY_WAY_WITH_MARKER,
    volumes: VOLUMES_OFF,
  },
  // Same world bearing the shipped `cosmicFlows` clip's `start` frames the
  // Local Group with — copied, not imported, since that field's type is
  // `CameraPose | 'live'`.
  pose: { target: [0, -0.01, 0], yaw: -1.7455, pitch: -0.3589, distance: 0.14 },
  lede: 'The expansion of the universe carries galaxies apart. Underneath that, each one is also falling towards the mass nearest it.',
  body: [
    {
      kind: 'prose',
      heading: 'What you’re seeing',
      text: 'Each ribbon follows the motion of matter once the expansion is subtracted. They run out of the emptier regions and converge where mass has collected. The Milky Way is being carried along at about 600 km/s, towards the Great Attractor.',
    },
    {
      kind: 'prose',
      heading: 'How it was made',
      text: 'Only the part of a galaxy’s motion along our line of sight can be measured, from the gap between its distance and its redshift. Cosmicflows collected tens of thousands of those distances; a reconstruction fits the three-dimensional field that explains them. What is drawn is the average of ten thousand such fits.',
    },
    {
      kind: 'prose',
      heading: 'Laniakea',
      text: 'The basin these flows fall into is <a href="https://en.wikipedia.org/wiki/Laniakea_Supercluster">Laniakea</a>, our supercluster — bounded by which way galaxies move rather than by where they sit.',
    },
    {
      kind: 'key',
      heading: 'Key',
      ramp: FLOW_SPEED_RAMP,
      ends: ['At rest', FLOW_SPEED_MAX],
      toggle: {
        label: 'Galaxies',
        onWord: 'shown',
        offWord: 'hidden in this view',
        on: [mergeSnapshot({ galaxyCatalogs: galaxyCatalogsInitialState })],
        off: [mergeSnapshot({ galaxyCatalogs: GALAXIES_OFF })],
      },
    },
    {
      kind: 'facts',
      facts: [
        { label: 'Reconstructed box', value: '1000 Mpc' },
        { label: 'Grid', value: '128³' },
        { label: 'Voxel', value: '7.8 Mpc' },
        { label: 'Hot end', value: FLOW_SPEED_MAX },
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
          role: 'Catalog',
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
