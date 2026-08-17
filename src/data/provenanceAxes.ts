/**
 * PROVENANCE_AXES — the registry of galaxy-data provenance axes.
 *
 * A galaxy record carries two values the build pipeline fills in when the
 * source catalog has no measurement: its orientation (b/a + position angle,
 * hashed deterministically from sky position) and its diameter (a flat 30 kpc
 * fallback).  Both are stamped per record as a persisted `*IsFallback` byte
 * and ride into the GPU on a sign bit, so the renderer can tell measurement
 * from fallback without a second attribute.
 *
 * This table is what makes the DebugPanel's provenance section a *table*: one
 * row per entry, rendered by iteration rather than by three hand-written
 * blocks.  Adding a third axis (say "redshift is photometric, not spectro")
 * means an entry here, a settings default, a uniform slot, and a shader
 * branch — not a new copy of the UI.
 *
 * `highlightColor` mirrors a constant in `points/vertex.wesl`: the shader
 * cannot read TypeScript, so the swatch the user sees in the panel and the
 * colour the vertex stage writes are two spellings of the same decision.
 * They must be edited together.
 *
 * `flagsOf` points at the cloud's per-record flag array so the missing-value
 * tally (`countEstimatedProvenance`) iterates the registry instead of naming
 * each array.
 *
 * `hint` is the tooltip the DebugPanel's provenance table shows for the row.
 */

import type { GalaxyCatalog } from '../@types/data/galaxyCatalog/GalaxyCatalog';

export const PROVENANCE_AXES = [
  {
    id: 'orientation',
    label: 'Orientation',
    hint: 'Disk b/a and position angle. When the source catalog has none, it is hashed from sky position.',
    /** Magenta — matches the `orientHighlight` branch in points/vertex.wesl. */
    highlightColor: '#ff1ae6',
    flagsOf: (cloud: GalaxyCatalog): Uint8Array => cloud.orientationIsFallback,
  },
  {
    id: 'size',
    label: 'Size',
    hint: 'Galaxy diameter. When the source catalog has none, it falls back to a flat 30 kpc.',
    /** Green — matches the `sizeHighlight` branch in points/vertex.wesl. */
    highlightColor: '#26ff40',
    flagsOf: (cloud: GalaxyCatalog): Uint8Array => cloud.diameterIsFallback,
  },
] as const;
