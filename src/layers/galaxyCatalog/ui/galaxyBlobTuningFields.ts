/**
 * GALAXY_BLOB_TUNING_FIELDS — one row per knob of the galaxy octree's cut and blob glows,
 * iterated by the Debug panel's tuning board.
 */
import type { SliderField } from '../../../@types/data/SliderField';
import type { GalaxyOctreeTuningKey } from '../@types/GalaxyOctreeTuningKey';

const x2 = (v: number) => `${v.toFixed(2)}×`;
const d2 = (v: number) => v.toFixed(2);

export const GALAXY_BLOB_TUNING_FIELDS: readonly SliderField<GalaxyOctreeTuningKey>[] = [
  {
    key: 'refineThreshold',
    label: 'Detail',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    format: d2,
    title:
      'Octree-cut refine threshold. Lower splits far boxes earlier: more galaxies drawn, more chunks streamed. The bake places galaxies for its default.',
  },
  {
    key: 'blobGain',
    label: 'Blob gain',
    min: 0,
    max: 2,
    step: 0.01,
    format: x2,
    title: 'Multiplies the light each octree blob deposits. 1 = the sum of its members.',
  },
  {
    key: 'blobGlowOverlap',
    label: 'Blob overlap',
    min: 0.5,
    max: 4,
    step: 0.05,
    format: x2,
    title:
      'Blob glow radius over half its box edge. Wider glows blend boxes, and light spreads thinner.',
  },
  {
    key: 'blobPeakCap',
    label: 'Blob peak cap',
    min: 0.01,
    max: 2,
    step: 0.01,
    format: d2,
    title: 'Ceiling on a blob glow peak. Non-physical: light above it is discarded.',
  },
];
