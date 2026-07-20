/**
 * floorsOf — the load-bearing test for the aggregate-slot guard.
 *
 * GPU timestamp readback lags the render by 1–2 frames, so even after the
 * strategy-flip warmup a MERGED-run group aggregate (`G` bills `slot === G`) can
 * leak into a perLayerTimed sample. `SLOT_GROUPS` maps a group key to ITSELF, so
 * without the guard that leaked aggregate buckets into its own group `G` and is
 * counted as a third "layer", inflating Σ Lᵢ and the estimated floor. This test
 * plants exactly that leak (`G → G` present as a perLayer stat) and pins that
 * the floor is computed from ONLY the two real layers — plus the single-layer
 * and no-merged-median omissions.
 */

import { describe, it, expect } from 'vitest';

import { floorsOf } from '../../../../tools/utils/perf/floorsOf';
import type { LayerStat } from '../../../../tools/perf/scenarioReport';

// Two real layers a,b map to group G; c → H (single layer); d → K (no merged
// median). `G → G` is the self-mapping every group key carries.
const slotGroups: Record<string, string> = {
  a: 'G',
  b: 'G',
  G: 'G',
  c: 'H',
  d: 'K',
};

const merged: LayerStat[] = [
  { slot: 'G', median: 4.2, p90: 5.0 },
  { slot: 'H', median: 2.0, p90: 2.2 },
  // K deliberately absent — no merged median for it.
];

const perLayer: LayerStat[] = [
  { slot: 'a', median: 3.6, p90: 4.0 },
  { slot: 'b', median: 3.1, p90: 3.4 },
  { slot: 'G', median: 10.0, p90: 12.0 }, // leaked aggregate — must be excluded
  { slot: 'c', median: 2.0, p90: 2.2 }, // single-layer group H
  { slot: 'd', median: 1.0, p90: 1.1 }, // no merged median (group K)
];

describe('floorsOf', () => {
  it('computes a group floor from only its real layers, excluding the leaked aggregate', () => {
    const floors = floorsOf(merged, perLayer, slotGroups);

    // Only group G is attributable (≥2 real layers + a merged median).
    expect(floors).toHaveLength(1);
    const g = floors.find((f) => f.groupKey === 'G');
    expect(g).toBeDefined();

    // floor = max(0, (3.6 + 3.1 − 4.2) / 2) = 2.5 / 2 = 1.25 — NOT
    // (3.6 + 3.1 + 10.0 − 4.2) / 3 = 4.1667 (what the leak would give).
    expect(g?.floor).toBeCloseTo(1.25, 6);

    // Reals cover the two real layers only; the aggregate G is not among them.
    expect(g?.reals.map((r) => r.slot).sort()).toEqual(['a', 'b']);
    const realBySlot = new Map(g?.reals.map((r) => [r.slot, r.real]));
    expect(realBySlot.get('a')).toBeCloseTo(3.6 - 1.25, 6);
    expect(realBySlot.get('b')).toBeCloseTo(3.1 - 1.25, 6);
  });

  it('omits a single-layer group and a group with no merged median', () => {
    const floors = floorsOf(merged, perLayer, slotGroups);
    expect(floors.some((f) => f.groupKey === 'H')).toBe(false); // single layer
    expect(floors.some((f) => f.groupKey === 'K')).toBe(false); // no merged median
  });
});
