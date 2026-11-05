/**
 * TIMED_SLOTS — the real registry's slot list.
 *
 * Slot names are a wire format: `createGpuTimingService` allocates a query pair
 * per name and the DebugPanel + perf harness look them up byte-for-byte, so the
 * real-registry list below is asserted in full rather than sampled.
 */

import { describe, it, expect } from 'vitest';

import { TIMED_SLOTS } from '../../../../../src/services/engine/frame/timing/timedSlots';
import { TIMED_SLOT_GROUPS } from '../../../../../src/services/engine/frame/timing/timedSlotGroups';
import { SLAB_ROW_CEILING } from '../../../../../src/services/engine/frame/timing/slabRowCeiling';
import { buildTimingSlotMap } from '../../../../../src/services/gpu/timing/buildTimingSlotMap';

describe('TIMED_SLOTS — body slot pool', () => {
  it('allocates one body slot per registry row', () => {
    // TIMED_SLOTS expands the MAXIMUM chain, so the pool holds exactly
    // SLAB_ROW_CEILING body slots regardless of what any one frame's chain
    // contains — the query-set size is a registry fact, not a per-frame one.
    // Asserting the endpoints + count (not the full literal run) means a new
    // SCENE_PLANETS row moves the count without rewriting this test.
    // The bare key only: a row split around a depth sample adds suffixed slots.
    const bodySlots = TIMED_SLOTS.filter((name) => /^foreground:0·BODY\[\d+\]$/.test(name));
    expect(bodySlots).toHaveLength(SLAB_ROW_CEILING);
    expect(bodySlots[0]).toBe('foreground:0·BODY[0]');
    expect(bodySlots[bodySlots.length - 1]).toBe(`foreground:0·BODY[${SLAB_ROW_CEILING - 1}]`);
    expect(TIMED_SLOTS).not.toContain(`foreground:0·BODY[${SLAB_ROW_CEILING}]`);
  });

  it('every real TIMED_SLOTS name is unique (buildTimingSlotMap precondition, M2)', () => {
    // The regression: a 'body' pass used to contribute its bare name once per
    // capacity row (~26 identical 'planets' entries), which collided on one
    // query-set index pair. `buildTimingSlotMap` now throws on a duplicate —
    // this pins that the real registry satisfies the precondition, not a fixture.
    expect(new Set(TIMED_SLOTS).size).toBe(TIMED_SLOTS.length);
    expect(() => buildTimingSlotMap(TIMED_SLOTS)).not.toThrow();
  });
});

describe('TIMED_SLOTS — query-set budget', () => {
  it('fits the WebGPU query-set cap', () => {
    // 4096 is WebGPU's fixed maximum query count per query set; one slot costs two (begin + end).
    expect(TIMED_SLOTS.length * 2).toBeLessThanOrEqual(4096);
  });

  it('bills each cubemap capture to exactly one slot, never per face', () => {
    for (const key of ['sgrAStar', 'solarSystem', 'probe']) {
      expect(TIMED_SLOTS.filter((n) => n === `${key}·capture`)).toHaveLength(1);
    }
    expect(TIMED_SLOTS.filter((n) => /@[^@]+:\d+$/.test(n))).toEqual([]);
  });
});
