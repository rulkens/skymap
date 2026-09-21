/**
 * viewRegistry — the palette's four takeover views. Hand-edited, like
 * `featuredTabs.ts`: nothing generates or rewrites it. Settings clusters are
 * whole-object replacements (`mergeSettingsSnapshot`), so each entry spreads a
 * Layer's own `initialState` rather than restating its defaults — the Layer
 * stays the single source of truth for what "off" leaves untouched.
 */

import { initialState as flowInitialState } from '../../layers/flow/state/flow/initialState';
import { initialState as galaxyCatalogsInitialState } from '../../layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import { initialState as milkyWayInitialState } from '../../layers/milkyWay/state/milkyWay/initialState';
import { initialState as volumesInitialState } from '../../layers/volume/state/volumes/initialState';
import { buildVolumeFieldSettings } from '../volume/volumeFieldDefaults';
import { mergeSnapshot } from '../../state/settings/mergeSnapshotAction';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../@types/settings/GalaxyCatalogItemSettings';
import type { View } from '../../@types/views/View';
import type { ViewId } from '../../@types/views/ViewId';

// `galaxyCatalogs` has no cluster-level master gate (GalaxyCatalogSettings.d.ts),
// so "galaxies off" means every item row disabled, not a single flag.
const GALAXIES_OFF = {
  ...galaxyCatalogsInitialState,
  items: Object.fromEntries(
    Object.entries(galaxyCatalogsInitialState.items).map(([id, item]) => [
      id,
      { ...item, enabled: false },
    ]),
  ) as Record<GalaxyCatalogId, GalaxyCatalogItemSettings>,
};

const MILKY_WAY_OFF = { ...milkyWayInitialState, enabled: false, labelEnabled: false };

// The 2MRS Polyphorm run rides with MCPM in the Cosmic Web view: same quantity,
// but an all-sky footprint where MCPM only covers the SDSS wedge, so the web
// closes up behind the viewer. Its registry row is default-off (a panel toggle),
// so the view turns it on explicitly — built from the registry defaults rather
// than indexed out of the seed, which is `Partial` by type.
const VOLUMES_WITH_2MRS = {
  ...volumesInitialState,
  items: {
    ...volumesInitialState.items,
    'polyphorm-2mrs': { ...buildVolumeFieldSettings('polyphorm-2mrs'), enabled: true },
  },
};

// Matplotlib's inferno, six stops — the same ramp the filament volume samples,
// so the legend reads as the field's own colours rather than a lookalike.
const INFERNO_RAMP = ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'];

export const viewRegistry: Record<ViewId, View> = {
  cosmicFlows: {
    id: 'cosmicFlows',
    label: 'Cosmic Flows',
    settings: {
      flow: { ...flowInitialState, enabled: true },
      galaxyCatalogs: GALAXIES_OFF,
      milkyWay: MILKY_WAY_OFF,
    },
    // Same world bearing the shipped `cosmicFlows` clip's `start` frames the
    // Local Group with — copied, not imported, since that field's type is
    // `CameraPose | 'live'`.
    pose: { target: [0, -0.01, 0], yaw: -1.7455, pitch: -0.3589, distance: 0.14 },
    lede: 'Coming soon — the user writes this view’s copy.',
    body: [
      {
        kind: 'prose',
        heading: 'Cosmic Flows',
        text: 'Coming soon — the user writes this view’s copy.',
      },
    ],
  },
  cosmicWeb: {
    id: 'cosmicWeb',
    label: 'Cosmic Web',
    settings: { galaxyCatalogs: GALAXIES_OFF, volumes: VOLUMES_WITH_2MRS },
    // User-framed and verified live 2026-09-18 (docs/grill-sessions/search-palette-tabs-2026-09-18.md,
    // "Capture spike findings"): no focus, target/yaw/pitch/distance below.
    pose: {
      target: [-181.2045404245461, -29.471262938089055, 52.200784784155374],
      yaw: -3.93753522022247,
      pitch: 0.4135452242339458,
      distance: 251.18526964731848,
    },
    lede: 'Galaxies trace the largest structure there is: a web of filaments and knots around empty voids, hundreds of millions of light-years across.',
    body: [
      {
        kind: 'prose',
        heading: 'What you’re seeing',
        text: 'Over 13.8 billion years gravity has pulled matter out of the voids and into walls and filaments. Where filaments cross, galaxy clusters form. The bright strands are the densest parts of the network; the dark cells are voids with few galaxies in them.',
      },
      {
        kind: 'prose',
        heading: 'How it was made',
        text: 'The web can’t be photographed. This map was computed from the positions of about 325,000 SDSS galaxies by a simulation modelled on a slime mould, <i>Physarum polycephalum</i>, which grows efficient networks between food sources. Here the galaxies are the food; the network the swarm settles into traces the filaments between them.',
      },
      {
        kind: 'key',
        heading: 'Key',
        ramp: INFERNO_RAMP,
        ends: ['Void', 'Filament', 'Knot'],
        // Both arms are built once at import; nothing on the dispatch path
        // mutates an action, and `mergeSettingsSnapshot` clones its payload in.
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
          { label: 'Galaxies traced', value: '~325,000' },
          { label: 'Distance', value: '44–476 Mpc' },
          { label: 'Voxel', value: '0.78 Mpc' },
          { label: 'Grid', value: '712 × 1200 × 728' },
        ],
      },
      {
        kind: 'sources',
        heading: 'Sources',
        links: [
          {
            role: 'Data',
            title: 'SDSS DR17 Cosmic Slime catalog',
            citation: 'Wilde et al. 2023',
            href: 'https://www.sdss4.org/dr17/data_access/value-added-catalogs/?vac_id=cosmic-web-environmental-densities-from-mcpm-slimemold',
          },
          {
            role: 'Method',
            title: 'Monte Carlo Physarum Machine',
            citation: 'Elek & Forbes 2022',
            href: 'https://arxiv.org/abs/2204.01256',
          },
          {
            role: 'First use',
            title: 'Revealing the dark threads of the cosmic web',
            citation: 'Burchett et al. 2020',
            href: 'https://doi.org/10.3847/2041-8213/ab700c',
          },
          {
            role: 'Software',
            title: 'Polyphorm',
            citation: 'GitHub',
            href: 'https://github.com/CreativeCodingLab/Polyphorm',
          },
        ],
      },
    ],
  },
  // PLACEHOLDER pose — awaiting the user's "copy view pose" capture before
  // merge; target/yaw/pitch/distance below are stand-ins only.
  solarSystem: {
    id: 'solarSystem',
    label: 'Solar System',
    settings: {},
    pose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 3e-9 },
    lede: 'Coming soon — the user writes this view’s copy.',
    body: [
      {
        kind: 'prose',
        heading: 'Solar System',
        text: 'Coming soon — the user writes this view’s copy.',
      },
    ],
  },
  // PLACEHOLDER pose — awaiting the user's "copy view pose" capture before
  // merge; target/yaw/pitch/distance below are stand-ins only.
  observableUniverse: {
    id: 'observableUniverse',
    label: 'Observable Universe',
    settings: {},
    pose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 14000 },
    lede: 'Coming soon — the user writes this view’s copy.',
    body: [
      {
        kind: 'prose',
        heading: 'Observable Universe',
        text: 'Coming soon — the user writes this view’s copy.',
      },
    ],
  },
};
