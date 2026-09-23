/**
 * cosmicWeb — the MCPM filament exhibit: two Polyphorm volumes over a dark
 * field, galaxies off so the density is the only thing drawn. Copy is
 * hand-written and user-owned; nothing generates this file.
 */

import { initialState as galaxyCatalogsInitialState } from '../../layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import { initialState as volumesInitialState } from '../../layers/cosmicWebDensity/state/cosmicWebDensity/initialState';
import { mergeSnapshot } from '../../state/settings/mergeSnapshotAction';
import { GALAXIES_OFF } from './utils/galaxiesOff';
import type { Exhibit } from '../../@types/exhibits/Exhibit';

// The 2MRS Polyphorm run rides with MCPM here: same quantity, but an all-sky
// footprint where MCPM only covers the SDSS wedge, so the web closes up behind
// the viewer. It boots off (a panel toggle), so the exhibit turns it on
// explicitly, indexed straight out of the boot seed — `items` is complete by
// type, so no default-rebuild is needed.
const VOLUMES_WITH_2MRS = {
  ...volumesInitialState,
  items: {
    ...volumesInitialState.items,
    'polyphorm-2mrs': { ...volumesInitialState.items['polyphorm-2mrs'], enabled: true },
  },
};

// Matplotlib's inferno, six stops — the same ramp the filament volume samples,
// so the legend reads as the field's own colours rather than a lookalike.
const INFERNO_RAMP = ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d', '#fcfdbf'];

export const cosmicWeb: Exhibit = {
  id: 'cosmicWeb',
  label: 'Cosmic Web',
  settings: { galaxyCatalogs: GALAXIES_OFF, cosmicWebDensity: VOLUMES_WITH_2MRS },
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
      text: 'The web can’t be photographed. This map was computed from the positions of about 325,000 SDSS galaxies by a simulation modelled on a <a href="https://en.wikipedia.org/wiki/Physarum_polycephalum">slime mould</a>, <i>Physarum polycephalum</i>, which grows efficient networks between food sources. Here the galaxies are the food; the network the swarm settles into traces the filaments between them.',
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
};
