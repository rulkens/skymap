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
import { timedSlotsOf } from '../../../../../src/services/engine/frame/timing/timedSlotsOf';
import { BODY_SLAB_CAPACITY } from '../../../../../src/services/engine/frame/timing/bodySlabCapacity';
import { expandFrameOrder } from '../../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../../src/services/engine/frame/frameOrder';
import { CONTENT_PASSES } from '../../../../../src/services/engine/frame/passes';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
import { buildTimingSlotMap } from '../../../../../src/services/gpu/timing/buildTimingSlotMap';
import type { FrameInputs } from '../../../../../src/services/engine/frame/expandFrameOrder';
import type { FrameStep } from '../../../../../src/@types/engine/frame/FrameStep';
import type { ToneMap } from '../../../../../src/@types/rendering/ToneMap';

const TONE: ToneMap = { exposure: 1.5, curve: 4, hdrKnee: 0, hdrHeadroom: 0 };

/** The real order + registry, with only the per-frame lists varied. */
function program(over: Partial<FrameInputs> = {}): readonly FrameStep[] {
  return expandFrameOrder(FRAME_ORDER, CONTENT_PASSES, {
    tone: TONE,
    bloomEnabled: false,
    foregroundChain: [NEAR0],
    skyCubemapFacesToCapture: [],
    lensBodySlabs: [],
    ...over,
  });
}

describe('the real registry slot list', () => {
  it('is scalar-volume, nine hdr, the two aggregate offscreens, the (hdr, NEAR0) group, foreground bodies, foreground:0→hdr, hdr→swap, five swap, near captions, pick', () => {
    // The real registry against the real order — the exact ordered slot list the
    // timing service allocates from and the DebugPanel iterates. Each render
    // STEP trails its passes with its own `<target>·<SLAB>` group-key slot (the
    // merged-pass timing slot), so `volume·COSMO` follows scalar-volume,
    // `hdr·COSMO` follows the nine COSMO hdr rows, and so on.
    //
    // This fixture passes no lensing row, so the `lens` line emits nothing and
    // the POST_LENSING line merges back into the roster above it — which is why
    // `body-glints` trails the roster under the bare `hdr·NEAR0` key rather than
    // billing its own. The chain leads with a body row (index 2) so the six
    // body-drawn foreground passes get a step of their own, ahead of the
    // still-NEAR0 star spheres.
    expect(timedSlotsOf(program({ bloomEnabled: true, foregroundChain: [2, NEAR0] }))).toEqual([
      'scalar-volume',
      'volume·COSMO',
      'zone-of-avoidance',
      'zoa·COSMO',
      'point-sprites',
      'procedural-disks',
      'textured-disks',
      'filaments',
      'flow',
      'volume-upsample',
      'zone-of-avoidance-upsample',
      'horizon-shell',
      'structure-markers',
      'hdr·COSMO',
      'star-aggregates',
      'star-aggregates·NEAR0',
      'milky-way-aggregate',
      'mw-aggregate·NEAR0',
      'milky-way-upsample',
      'milky-way',
      'star-points',
      'star-catalog',
      'star-upsample',
      'constellations',
      'body-glints',
      'hdr·NEAR0',
      // Every 'body'-drawn foreground pass lands on the body row, in the
      // authored order; each name carries its row (`·BODY[0]`) —
      // `passTimingSlotName` — so a second body row gets a DIFFERENT suffix
      // rather than colliding on the same query-set slot.
      'earth·BODY[0]',
      'cloud-shell·BODY[0]',
      'planets·BODY[0]',
      'textured-bodies·BODY[0]',
      'rings·BODY[0]',
      'atmosphere-shell·BODY[0]',
      'foreground:0·BODY[0]',
      'star-spheres',
      'field-star-sphere',
      'foreground:0·NEAR0',
      'foreground:0→hdr',
      // orbit-trails alone in the post-foreground slice: over the opaque bodies,
      // still ahead of bloom and the tone-map.
      'orbit-trails',
      'hdr·NEAR0·POST_FOREGROUND',
      // The bloom sub-pipeline bills ONE slot spanning its whole pass sequence
      // (runBloom opens the ten passes itself — the frame sees a single step).
      'bloom',
      'hdr→swap',
      'selection-ring',
      'disk-radius-ring',
      'marker-lines',
      'labels',
      'swap·COSMO',
      'near0-selection-ring',
      'foreground-labels',
      'clip-path-debug',
      'swap·NEAR0',
      'pick',
    ]);
  });
});

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
