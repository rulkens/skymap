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
import { BODY_SLAB_CAPACITY } from '../../../../../src/services/engine/frame/timing/bodySlabCapacity';
import { buildTimingSlotMap } from '../../../../../src/services/gpu/timing/buildTimingSlotMap';

describe('TIMED_SLOTS — body slot pool', () => {
  it('allocates one body slot per registry row', () => {
    // TIMED_SLOTS expands the MAXIMUM chain, so the pool holds exactly
    // BODY_SLAB_CAPACITY body slots regardless of what any one frame's chain
    // contains — the query-set size is a registry fact, not a per-frame one.
    // Asserting the endpoints + count (not the full literal run) means a new
    // SCENE_PLANETS row moves the count without rewriting this test.
    const bodySlots = TIMED_SLOTS.filter((name) => name.startsWith('foreground:0·BODY['));
    expect(bodySlots).toHaveLength(BODY_SLAB_CAPACITY);
    expect(bodySlots[0]).toBe('foreground:0·BODY[0]');
    expect(bodySlots[bodySlots.length - 1]).toBe(`foreground:0·BODY[${BODY_SLAB_CAPACITY - 1}]`);
    expect(TIMED_SLOTS).not.toContain(`foreground:0·BODY[${BODY_SLAB_CAPACITY}]`);
  });

  it('puts every body slot under the Foreground bodies group', () => {
    const group = TIMED_SLOT_GROUPS.find((g) => g.title === 'Foreground bodies · depth')!;
    const names = group.rows.map((r) => r.name);
    expect(names).toContain('foreground:0·NEAR0');
    expect(names).toContain('foreground:0·BODY[0]');
    expect(names).toContain(`foreground:0·BODY[${BODY_SLAB_CAPACITY - 1}]`);
  });

  it('also allocates one hdr·BODY[k] slot per registry row (the lens pass pool)', () => {
    // Same "maximum, not a real frame" sizing as the foreground:0 pool above:
    // Sgr A*'s painter-order row varies with which other bodies are visible, so
    // TIMED_SLOTS must cover every capacity slot it could land on.
    const bodySlots = TIMED_SLOTS.filter((name) => name.startsWith('hdr·BODY['));
    expect(bodySlots).toHaveLength(BODY_SLAB_CAPACITY);
    expect(bodySlots[0]).toBe('hdr·BODY[0]');
    expect(bodySlots[bodySlots.length - 1]).toBe(`hdr·BODY[${BODY_SLAB_CAPACITY - 1}]`);
    const group = TIMED_SLOT_GROUPS.find((g) => g.title === 'Sgr A* lensing')!;
    expect(group.rows.map((r) => r.name)).toContain('hdr·BODY[0]');
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
