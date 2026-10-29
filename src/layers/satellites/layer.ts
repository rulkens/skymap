/**
 * The satellites Layer: the ~20k objects CelesTrak publishes, as points around Earth
 * (docs/superpowers/specs/2026-10-28-earth-satellites-design.md). One asset slot whose commit
 * starts the SGP4 worker and whose release ends it, one planner that pulls sweeps, one renderer,
 * one pass, one show entry and its "Labels & guides" row.
 */

import { defineLayer } from '../../services/engine/layer/defineLayer';
import { satellitesLayerSettings } from './state/slices';
import { satellitesVisibility } from './visibility';
import { create } from './create';
import { destroy } from './destroy';
import { satellitesAssetRows } from './load/satellitesAssetRows';
import { satellitesPlanner } from './frame';
import { satellitesPass } from './passes/satellitesPass';

export const satellitesLayer = defineLayer({
  name: 'satellites',
  settings: satellitesLayerSettings,
  visibility: satellitesVisibility,
  create,
  destroy,
  planners: (runtime) => [satellitesPlanner(runtime)],
  passes: (runtime) => [satellitesPass(runtime)],
  assets: satellitesAssetRows,
  ui: [{ slot: 'labelsAndGuides', content: { toggle: 'satellites', label: 'Satellites' } }],
});
