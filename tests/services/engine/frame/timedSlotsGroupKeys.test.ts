/**
 * timedSlotsGroupKeys — Joint 2's load-bearing property: the slot derivation
 * emits a per-render-step GROUP-KEY slot (`'<target>·<SLAB>'`) alongside the
 * per-layer slots, so the `merged` executor can bill honest per-group GPU
 * timings against a slot that exists.
 *
 * This is an independent-property check, not a full-list snapshot: it asserts
 * the derived slot list from the real order + registry INCLUDES the group
 * keys the merged pass looks up (`descriptorFor(groupKey)`), AND still includes
 * the per-pass names — proving the group rows were ADDED, not substituted for
 * the pass rows. It fails exactly when the `rows.push({ name: groupKey, … })`
 * is dropped or its key format drifts from the executor's — which is the whole
 * point of the joint. The exhaustive ordered list lives in timedSlots.test.ts;
 * this file pins the invariant that survives any future pass addition.
 */

import { describe, it, expect } from 'vitest';

import { timedSlotsOf } from '../../../../src/services/engine/frame/timedSlots';
import { expandFrameOrder } from '../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../src/services/engine/frame/frameOrder';
import { CONTENT_PASSES } from '../../../../src/services/engine/frame/passes';
import { NEAR0 } from '../../../../src/services/engine/frame/slabs';

describe('timedSlotsOf — per-render-step group keys', () => {
  // Bloom ON so the derivation covers the single `'bloom'` slot the sub-pipeline
  // adds alongside the per-render-step group keys.
  const slots = timedSlotsOf(
    expandFrameOrder(FRAME_ORDER, CONTENT_PASSES, {
      tone: { exposure: 1, curve: 0, hdrKnee: 0, hdrHeadroom: 0 },
      bloomEnabled: true,
      foregroundChain: [NEAR0],
      skyCubemapFacesToCapture: [],
      lensBodySlabs: [],
    }),
  );

  it('includes the render steps’ group keys — the slots the merged pass bills against', () => {
    // Each maps to a distinct render step in the expansion: the cosmological
    // HDR render (hdr·COSMO), the near-field HDR render (hdr·NEAR0), and the
    // foreground-bodies render (foreground:0·NEAR0). The middle-dot (U+00B7)
    // and the `<target>·${slabName(slab)}` shape (slabs.ts) must match the
    // key executeFrame computes, or the merged pass finds no slot.
    expect(slots).toContain('hdr·NEAR0');
    expect(slots).toContain('hdr·COSMO');
    expect(slots).toContain('foreground:0·NEAR0');
  });

  it('still includes per-pass slot names — the group rows are additions, not substitutions', () => {
    // A per-pass slot from the hdr·COSMO group and one from the
    // foreground:0·NEAR0 group: if the group-key push had replaced the pass
    // loop rather than following it, these would be gone. 'star-spheres', not
    // 'earth'/'planets' — those ride the foreground line's BODY roster, and
    // this fixture's `[NEAR0]` chain carries no body row to expand into.
    expect(slots).toContain('point-sprites');
    expect(slots).toContain('star-spheres');
  });

  it('keeps every slot name unique — no group key collides with a pass/composite/pick name', () => {
    // buildTimingSlotMap assigns each name a distinct query-index pair, so a
    // collision would silently drop a slot. The group keys use the middle-dot
    // separator; composites use the '→' arrow; pass names and 'pick' are bare —
    // so the added rows can't collide.
    expect(new Set(slots).size).toBe(slots.length);
  });
});
