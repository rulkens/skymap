/**
 * TIMED_SLOT_GROUPS — the real registry's grouped timing rows, the value the
 * DebugPanel's GpuTimingsSection consumes.
 */

import { describe, it, expect } from 'vitest';

import { TIMED_SLOT_GROUPS } from '../../../../../src/services/engine/frame/timing/timedSlotGroups';

describe('TIMED_SLOT_GROUPS', () => {
  it('merges scalar-volume + zone-of-avoidance + the two aggregate offscreens into one group and sinks composites+pick to the last group', () => {
    // scalar-volume (volume·COSMO), zone-of-avoidance (zoa·COSMO),
    // star-aggregates and milky-way-aggregate are non-adjacent steps that all
    // map to "Volumes & aggregates"; the two composites and pick — scattered
    // through execution order — collapse into the trailing "Composites & pick".
    // "Sky capture" is TIMED_SLOTS' 6 capture steps (one row per face); "Sgr A*
    // lensing" is the lens pool, sized off `MAX_FRAME_INPUTS.lensBodySlabs` the
    // same way "Foreground bodies" is sized off its `foregroundChain`.
    expect(TIMED_SLOT_GROUPS.map((g) => g.title)).toEqual([
      'Volumes & aggregates',
      'Sky capture',
      'Cosmos · HDR',
      'Near field · HDR',
      'Sgr A* lensing',
      'Foreground bodies · depth',
      'Bloom',
      'Overlays',
      'Composites & pick',
    ]);

    const byTitle = (title: string) => TIMED_SLOT_GROUPS.find((g) => g.title === title)!;
    // The bloom sub-pipeline buckets under one 'Bloom' group, between Foreground
    // and Overlays, carrying the single `'bloom'` slot.
    expect(byTitle('Bloom').rows.map((r) => r.name)).toEqual(['bloom']);
    expect(byTitle('Volumes & aggregates').rows.map((r) => r.name)).toEqual([
      'scalar-volume',
      'volume·COSMO',
      'zone-of-avoidance',
      'zoa·COSMO',
      'star-aggregates',
      'star-aggregates·NEAR0',
      'milky-way-aggregate',
      'mw-aggregate·NEAR0',
    ]);
    // Overlays merges the COSMO swap overlays with the NEAR0 near-field swap
    // rows (two non-adjacent swap steps), each trailed by its group-key row.
    expect(byTitle('Overlays').rows.map((r) => r.name)).toEqual([
      'selection-ring',
      'disk-radius-ring',
      'marker-lines',
      'labels',
      'swap·COSMO',
      'near0-selection-ring',
      'foreground-labels',
      'clip-path-debug',
      'swap·NEAR0',
    ]);
    // Composites and pick emit no group-key rows (only render steps do).
    expect(byTitle('Composites & pick').rows.map((r) => r.name)).toEqual([
      'foreground:0→hdr',
      'hdr→swap',
      'pick',
    ]);
  });
});
