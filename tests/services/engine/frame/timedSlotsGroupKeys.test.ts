/**
 * timedSlotsGroupKeys — Joint 2's load-bearing property: the slot derivation
 * emits a per-render-step GROUP-KEY slot (`'<target>·<SLAB>'`) alongside the
 * per-layer slots, so the `merged` executor can bill honest per-group GPU
 * timings against a slot that exists.
 *
 * This is an independent-property check, not a full-list snapshot: it asserts
 * the derived slot list from the real program + registry INCLUDES the group
 * keys the merged pass looks up (`descriptorFor(groupKey)`), AND still includes
 * the per-layer names — proving the group rows were ADDED, not substituted for
 * the layer rows. It fails exactly when the `rows.push({ name: groupKey, … })`
 * is dropped or its key format drifts from the executor's — which is the whole
 * point of the joint. The exhaustive ordered list lives in frameProgram.test.ts;
 * this file pins the invariant that survives any future layer addition.
 */

import { describe, it, expect } from 'vitest';

import { frameProgram, timedSlotsOf } from '../../../../src/services/engine/frame/frameProgram';
import { CONTENT_LAYERS } from '../../../../src/services/engine/frame/passes';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';

describe('timedSlotsOf — per-render-step group keys', () => {
  // Bloom ON so the derivation covers the single `'bloom'` slot the sub-pipeline
  // adds alongside the per-render-step group keys.
  const slots = timedSlotsOf(
    frameProgram({ exposure: 1, curve: 0, hdrKnee: 0, hdrHeadroom: 0 }, true, [NEAR0]),
    CONTENT_LAYERS,
  );

  it('includes the render steps’ group keys — the slots the merged pass bills against', () => {
    // Each maps to a distinct render step in frameProgram(): the cosmological
    // HDR render (hdr·COSMO), the near-field HDR render (hdr·NEAR0), and the
    // foreground-bodies render (foreground:0·NEAR0). The middle-dot (U+00B7)
    // and the `<target>·${slabName(slab)}` shape (slabs.ts) must match the
    // key executeFrame computes, or the merged pass finds no slot.
    expect(slots).toContain('hdr·NEAR0');
    expect(slots).toContain('hdr·COSMO');
    expect(slots).toContain('foreground:0·NEAR0');
  });

  it('still includes per-layer slot names — the group rows are additions, not substitutions', () => {
    // A per-layer slot from the hdr·COSMO group and one from the
    // foreground:0·NEAR0 group: if the group-key push had replaced the layer
    // loop rather than following it, these would be gone.
    expect(slots).toContain('point-sprites');
    expect(slots).toContain('earth');
  });

  it('keeps every slot name unique — no group key collides with a layer/composite/pick name', () => {
    // buildTimingSlotMap assigns each name a distinct query-index pair, so a
    // collision would silently drop a slot. The group keys use the middle-dot
    // separator; composites use the '→' arrow; layer names and 'pick' are bare —
    // so the added rows can't collide.
    expect(new Set(slots).size).toBe(slots.length);
  });
});
