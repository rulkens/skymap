/**
 * The satellites Layer: the ~20k objects CelesTrak publishes, as points around Earth
 * (docs/superpowers/specs/completed/2026-10-28-earth-satellites-design.md): dots from a point
 * renderer, and the selected satellites' orbit rings from an orbit-trail renderer.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { satellitesLayerSettings } from './state/slices';
import { satellitesVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { satellitesAssetRows } from './catalog/load/satellitesAssetRows';
import { satellitesSourceCounts } from './catalog/load/satellitesSourceCounts';
import { satellitesPlanner } from './frame';
import { satellitesPass } from './points/passes/satellitesPass';
import { satelliteOrbitsPass } from './orbits/passes/satelliteOrbitsPass';
import SatellitesSectionContainer from './controls/ui/SatellitesSectionContainer';
import { SATELLITES_SECTION_TITLE } from './controls/data/satellitesSectionTitle';
import SatelliteDetailCard from './focus/ui/SatelliteDetailCard/SatelliteDetailCard';
import CompactSatelliteCard from './focus/ui/CompactSatelliteCard/CompactSatelliteCard';
import { SATELLITES_SOURCE_ROWS } from './sources/satellitesSourceRows';
import { satellitesSelectionRow } from './focus/present/satellitesSelectionRow';
import { satellitesSearch } from './focus/present/satellitesSearch';

export const satellitesLayer = defineLayer({
  name: 'satellites',
  sources: SATELLITES_SOURCE_ROWS,
  settings: satellitesLayerSettings,
  visibility: satellitesVisibility,
  create,
  destroy,
  planners: (runtime) => [satellitesPlanner(runtime)],
  passes: (runtime) => [satellitesPass(runtime), satelliteOrbitsPass(runtime)],
  assets: satellitesAssetRows,
  sourceCounts: satellitesSourceCounts,
  selection: (runtime) => [satellitesSelectionRow(runtime)],
  search: (runtime) => satellitesSearch(runtime),
  ui: [
    { slot: 'main', content: SatellitesSectionContainer, title: SATELLITES_SECTION_TITLE },
    {
      slot: 'detailCard',
      content: { type: 'satellite', Detail: SatelliteDetailCard, Compact: CompactSatelliteCard },
    },
  ],
});
