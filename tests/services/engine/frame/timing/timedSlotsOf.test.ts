/**
 * timedSlotsOf — slot ordering over an arbitrary `FRAME_ORDER` expansion. The
 * expansion itself is `expandFrameOrder.test.ts`'s; the real-registry list in
 * full is `timedSlots.test.ts`'s.
 */

import { describe, it, expect } from 'vitest';

import { timedSlotsOf } from '../../../../../src/services/engine/frame/timing/timedSlotsOf';
import { expandFrameOrder } from '../../../../../src/services/engine/frame/expandFrameOrder';
import { FRAME_ORDER } from '../../../../../src/services/engine/frame/frameOrder';
import { CONTENT_PASSES } from '../../../../../src/services/engine/frame/passes';
import { NEAR0 } from '../../../../../src/services/engine/frame/slabs';
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

describe('timedSlotsOf', () => {
  it('reaches sgrAStarLensingPass once a body slab is passed', () => {
    // Until the lens got its own `FRAME_ORDER` line, no step ever matched
    // `sgrAStarLensingPass` — the pass compiled and registered but was
    // structurally unreachable. Passing a body-slab index (4, arbitrary) must
    // surface its row right after the (hdr, NEAR0) group's own slot.
    const slots = timedSlotsOf(program({ lensBodySlabs: [4] }));
    const rosterIdx = slots.indexOf('hdr·NEAR0');
    expect(rosterIdx).toBeGreaterThanOrEqual(0);
    expect(slots[rosterIdx + 1]).toBe('sgr-a-star-lensing·BODY[2]');
    expect(slots[rosterIdx + 2]).toBe('hdr·BODY[2]');
  });

  it('bills orbit-trails and body-glints AFTER the lens step', () => {
    // The evidenced gap: both used to share the pre-lens roster step and so drew
    // UNDER the lens's OVER blend. They now have their own `FRAME_ORDER` lines
    // past the lens — checked against the REAL registry, so moving either back
    // into the roster line fails this.
    const slots = timedSlotsOf(program({ lensBodySlabs: [4] }));
    const lensIdx = slots.indexOf('sgr-a-star-lensing·BODY[2]');
    expect(lensIdx).toBeGreaterThanOrEqual(0);
    expect(slots.indexOf('orbit-trails')).toBeGreaterThan(lensIdx);
    expect(slots.indexOf('body-glints')).toBeGreaterThan(lensIdx);
  });

  it('bills orbit-trails AFTER the foreground:0→hdr body composite and before the tone-map', () => {
    // A satellite trail's near arc passes in front of its host; drawn before the
    // opaque body composite it would be covered along with the far arc.
    const slots = timedSlotsOf(program());
    const compositeIdx = slots.indexOf('foreground:0→hdr');
    expect(compositeIdx).toBeGreaterThanOrEqual(0);
    expect(slots.indexOf('orbit-trails')).toBeGreaterThan(compositeIdx);
    expect(slots.indexOf('orbit-trails')).toBeLessThan(slots.indexOf('hdr→swap'));
  });
});
