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
    // Local Group with (src/data/animation/clips/cosmicFlows.ts:74) — copied,
    // not imported, since that field's type is `CameraPose | 'live'`.
    pose: { target: [0, -0.01, 0], yaw: -1.7455, pitch: -0.3589, distance: 0.14 },
    body: [{ heading: 'Cosmic Flows', text: 'Coming soon — the user writes this view’s copy.' }],
  },
  cosmicWeb: {
    id: 'cosmicWeb',
    label: 'Cosmic Web',
    settings: { galaxyCatalogs: GALAXIES_OFF },
    // User-framed and verified live 2026-09-18 (docs/grill-sessions/search-palette-tabs-2026-09-18.md,
    // "Capture spike findings"): no focus, target/yaw/pitch/distance below.
    pose: {
      target: [-181.2045404245461, -29.471262938089055, 52.200784784155374],
      yaw: -3.93753522022247,
      pitch: 0.4135452242339458,
      distance: 251.18526964731848,
    },
    // Draft content from the grill transcript's Design pass (2026-09-18/19)
    // and docs/DATA.md's MCPM/filament sections; the user still owns final copy.
    body: [
      {
        heading: 'What you’re seeing',
        text: 'The cosmic web traced by galaxy density: voids, filaments and knots, rendered as a volumetric field.',
      },
      {
        heading: 'How it was made',
        text: 'Built from the SDSS DR17 Cosmic Slime VAC with MCPM (Elek & Forbes 2022), a Physarum-inspired transport-network extraction, into a tiered voxel grid.',
      },
      {
        heading: 'Key',
        text: 'Inferno ramp: void → filament → knot. Galaxy points can be toggled back on.',
      },
      {
        heading: 'Facts',
        text: '~325,000 galaxies · 44–476 Mpc · 0.78 Mpc voxel · 712×1200×728 grid.',
      },
      {
        heading: 'Sources',
        text: 'SDSS DR17 Cosmic Slime VAC (Wilde et al. 2023) · MCPM (Elek & Forbes 2022) · Burchett et al. 2020 · Polyphorm (GitHub).',
      },
    ],
  },
  // PLACEHOLDER pose — awaiting the user's "copy view pose" capture (Task 10)
  // before merge; target/yaw/pitch/distance below are stand-ins only.
  solarSystem: {
    id: 'solarSystem',
    label: 'Solar System',
    settings: {},
    pose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 3e-9 },
    body: [{ heading: 'Solar System', text: 'Coming soon — the user writes this view’s copy.' }],
  },
  // PLACEHOLDER pose — awaiting the user's "copy view pose" capture (Task 10)
  // before merge; target/yaw/pitch/distance below are stand-ins only.
  observableUniverse: {
    id: 'observableUniverse',
    label: 'Observable Universe',
    settings: {},
    pose: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 14000 },
    body: [
      { heading: 'Observable Universe', text: 'Coming soon — the user writes this view’s copy.' },
    ],
  },
};
