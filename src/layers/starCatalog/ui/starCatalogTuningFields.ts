/**
 * STAR_CATALOG_TUNING_FIELDS — one row per engine-tuning knob of the octree-cut
 * star renderer, iterated by the Debug panel's tuning board.
 */
import type { SliderField } from '../../../@types/data/SliderField';
import type { StarCatalogTuningKey } from '../@types/StarCatalogTuningKey';

const x1 = (v: number) => `${v.toFixed(1)}×`;
const x0 = (v: number) => `${v.toFixed(0)}×`;
const d2 = (v: number) => v.toFixed(2);

export const STAR_CATALOG_TUNING_FIELDS: readonly SliderField<StarCatalogTuningKey>[] = [
  {
    key: 'refineThreshold',
    label: 'Detail',
    min: 0.01,
    max: 0.3,
    step: 0.01,
    format: d2,
    title:
      'Octree-cut refine threshold. Lower splits far boxes earlier: more detail, more drawn nodes.',
  },
  {
    key: 'glowOverlap',
    label: 'Glow overlap',
    min: 1,
    max: 6,
    step: 0.1,
    format: x1,
    title:
      'Spreads aggregate glows past their box so the lattice dissolves. 1 = flux-conserving identity.',
  },
  {
    key: 'exposureNearX',
    label: 'Exposure (near)',
    min: 1,
    max: 60,
    step: 0.5,
    format: x1,
    title: 'Display exposure the scale ramp targets at its near (solar-system) anchor.',
  },
  {
    key: 'exposureMidX',
    label: 'Exposure (mid)',
    min: 5,
    max: 150,
    step: 1,
    format: x0,
    title: 'Display exposure at the ramp middle (few-kpc) anchor. Darkens the central clump alone.',
  },
  {
    key: 'exposureFarX',
    label: 'Exposure (far)',
    min: 5,
    max: 300,
    step: 1,
    format: x0,
    title: 'Display exposure at the ramp far (whole-galaxy) anchor.',
  },
  {
    key: 'aggregateIntensityCap',
    label: 'Fog cap',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    format: d2,
    title: 'Ceiling on an aggregate glow peak. Non-physical: light above it is discarded.',
  },
];
