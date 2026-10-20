/**
 * deriveZoneOfAvoidanceLiveness — the one projection the band's producer and
 * consumer share, so they cannot disagree about opacity.
 */

import { describe, it, expect } from 'vitest';

import { deriveZoneOfAvoidanceLiveness } from '../../../../src/layers/zoneOfAvoidance/present/deriveZoneOfAvoidanceLiveness';
import { SCALE_FADE_BANDS } from '../../../../src/data/scaleFadeBands';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';

/** Inside the visibility window: both bands saturate to 1 here. */
const INSIDE_CAM_DIST = SCALE_FADE_BANDS.zoneOfAvoidance.fullAt;

function makeCtx(over: { drawCamPos?: Readonly<[number, number, number]> } = {}): FrameView {
  return {
    snapshot: { isReady: true, nowMs: 0, focusBlend: 0 },
    drawCamPos: [0, 0, INSIDE_CAM_DIST] as Readonly<[number, number, number]>,
    ...over,
  } as unknown as FrameView;
}

describe('deriveZoneOfAvoidanceLiveness', () => {
  it('returns the composed opacity when the camera sits inside the visibility window', () => {
    const opacity = deriveZoneOfAvoidanceLiveness(makeCtx(), 0.6);
    expect(opacity).toBeCloseTo(0.6, 6);
  });

  it('returns null outside the visibility window (opacity would be 0)', () => {
    // Far past the recede band's goneAt — the Local Group has fully framed up.
    const { goneAt } = SCALE_FADE_BANDS.zoneOfAvoidanceRecede;
    const ctx = makeCtx({ drawCamPos: [0, 0, goneAt * 10] as Readonly<[number, number, number]> });
    expect(deriveZoneOfAvoidanceLiveness(ctx, 1)).toBeNull();
  });

  it('returns null when the handed value is 0, even inside the window', () => {
    expect(deriveZoneOfAvoidanceLiveness(makeCtx(), 0)).toBeNull();
  });
});
