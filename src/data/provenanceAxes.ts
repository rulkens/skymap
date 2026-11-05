/**
 * PROVENANCE_AXES — the registry of galaxy-data provenance axes: values the
 * build fills in when the catalog has no measurement (orientation hashed from
 * sky position, diameter a flat 30 kpc). Each is a persisted `*IsFallback` byte
 * per record and rides into the GPU on a sign bit.
 *
 * `highlightColor` mirrors a constant in `points/vertexBody.wesl` (the shader
 * cannot read TypeScript): edit the two together. `flagsOf` lets the tally
 * (`countEstimatedProvenance`) iterate the registry.
 */

import type { GalaxyCatalog } from '../@types/data/galaxyCatalog/GalaxyCatalog';

export const PROVENANCE_AXES = [
  {
    id: 'orientation',
    label: 'Orientation',
    hint: 'Disk b/a and position angle. When the source catalog has none, it is hashed from sky position.',
    /** Magenta — matches the `orientHighlight` branch in points/vertexBody.wesl. */
    highlightColor: '#ff1ae6',
    flagsOf: (cloud: GalaxyCatalog): Uint8Array => cloud.orientationIsFallback,
  },
  {
    id: 'size',
    label: 'Size',
    hint: 'Galaxy diameter. When the source catalog has none, it falls back to a flat 30 kpc.',
    /** Green — matches the `sizeHighlight` branch in points/vertexBody.wesl. */
    highlightColor: '#26ff40',
    flagsOf: (cloud: GalaxyCatalog): Uint8Array => cloud.diameterIsFallback,
  },
] as const;
