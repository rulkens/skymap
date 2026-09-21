/**
 * deriveZoneOfAvoidanceLiveness — the one projection the band's producer and
 * consumer share, so they cannot disagree about opacity.
 */

import { describe, it, expect, vi } from 'vitest';

import { deriveZoneOfAvoidanceLiveness } from '../../../../src/layers/zoneOfAvoidance/present/deriveZoneOfAvoidanceLiveness';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
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

function makeState({ toggleOpacity = 1 }: { toggleOpacity?: number } = {}): EngineState {
  return {
    subsystems: {
      fades: { opacityOf: vi.fn(() => toggleOpacity) },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

describe('deriveZoneOfAvoidanceLiveness', () => {
  it('returns the composed opacity when the camera sits inside the visibility window', () => {
    const opacity = deriveZoneOfAvoidanceLiveness(makeState({ toggleOpacity: 0.6 }), makeCtx());
    expect(opacity).toBeCloseTo(0.6, 6);
  });

  it('returns null outside the visibility window (opacity would be 0)', () => {
    // Far past the recede band's goneAt — the Local Group has fully framed up.
    const { goneAt } = SCALE_FADE_BANDS.zoneOfAvoidanceRecede;
    const ctx = makeCtx({ drawCamPos: [0, 0, goneAt * 10] as Readonly<[number, number, number]> });
    expect(deriveZoneOfAvoidanceLiveness(makeState(), ctx)).toBeNull();
  });

  it('returns null when the fade-registry toggle opacity is 0, even inside the window', () => {
    expect(deriveZoneOfAvoidanceLiveness(makeState({ toggleOpacity: 0 }), makeCtx())).toBeNull();
  });
});
