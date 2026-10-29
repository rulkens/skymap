/**
 * The satellites Layer: the ~20k objects CelesTrak publishes, as points around Earth
 * (docs/superpowers/specs/completed/2026-10-28-earth-satellites-design.md). One asset slot whose commit
 * runs the SGP4 worker, one planner that pulls sweeps, one renderer,
 * one pass, one show entry with a switch per class, and its Settings section.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { satellitesLayerSettings } from './state/slices';
import { satellitesVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { satellitesAssetRows } from './load/satellitesAssetRows';
import { satellitesSourceCounts } from './load/satellitesSourceCounts';
import { satellitesPlanner } from './frame';
import { satellitesPass } from './passes/satellitesPass';
import SatellitesSectionContainer from './ui/SatellitesSectionContainer';
import SatelliteDetailCard from './ui/SatelliteDetailCard/SatelliteDetailCard';
import CompactSatelliteCard from './ui/CompactSatelliteCard/CompactSatelliteCard';
import { SATELLITES_SOURCE_ROWS } from './sources/satellitesSourceRows';
import { satellitesSelectionRow } from './present/satellitesSelectionRow';
import { satellitesSearch } from './present/satellitesSearch';

export const satellitesLayer = defineLayer({
  name: 'satellites',
  sources: SATELLITES_SOURCE_ROWS,
  settings: satellitesLayerSettings,
  visibility: satellitesVisibility,
  create,
  destroy,
  planners: (runtime) => [satellitesPlanner(runtime)],
  passes: (runtime) => [satellitesPass(runtime)],
  assets: satellitesAssetRows,
  sourceCounts: satellitesSourceCounts,
  selection: (runtime) => [satellitesSelectionRow(runtime)],
  search: (runtime) => satellitesSearch(runtime),
  ui: [
    { slot: 'main', content: SatellitesSectionContainer },
    {
      slot: 'detailCard',
      content: { type: 'satellite', Detail: SatelliteDetailCard, Compact: CompactSatelliteCard },
    },
  ],
});
