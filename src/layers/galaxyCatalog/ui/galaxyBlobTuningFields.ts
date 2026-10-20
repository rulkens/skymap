/**
 * GALAXY_BLOB_TUNING_FIELDS — one row per look knob of the galaxy octree's blob glows,
 * iterated by the Debug panel's tuning board.
 */
import type { SliderField } from '../../../@types/data/SliderField';
import type { GalaxyBlobTuningKey } from '../@types/GalaxyBlobTuningKey';

const x2 = (v: number) => `${v.toFixed(2)}×`;
const d2 = (v: number) => v.toFixed(2);

export const GALAXY_BLOB_TUNING_FIELDS: readonly SliderField<GalaxyBlobTuningKey>[] = [
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
