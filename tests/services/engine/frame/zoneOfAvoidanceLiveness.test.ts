/**
 * deriveZoneOfAvoidanceLiveness — the one projection the band's producer and
 * consumer share, so they cannot disagree, including the renderer-null gate that
 * keeps an empty pass from opening pre-bootstrap.
 */

import { describe, it, expect, vi } from 'vitest';

import { deriveZoneOfAvoidanceLiveness } from '../../../../src/services/engine/frame/zoneOfAvoidanceLiveness';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';

/** Inside the visibility window: both bands saturate to 1 here. */
const INSIDE_CAM_DIST = SCALE_FADE_BANDS.zoneOfAvoidance.fullAt;

function makeCtx(over: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  return {
    isReady: true,
    nowMs: 0,
    focusBlend: 0,
    drawCamPos: [0, 0, INSIDE_CAM_DIST] as Readonly<[number, number, number]>,
    ...over,
  } as unknown as ReadyFrameContext;
}

/** Default renderer is a non-null stub so tests exercise the opacity math; pass `renderer: null` to hit the gate. */
function makeState({
  toggleOpacity = 1,
  renderer = {} as unknown,
}: { toggleOpacity?: number; renderer?: unknown } = {}): EngineState {
  return {
    gpu: { zoneOfAvoidanceRenderer: renderer },
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

  it('returns null when the renderer is missing (pre-bootstrap), even inside the window with the toggle on', () => {
    expect(deriveZoneOfAvoidanceLiveness(makeState({ renderer: null }), makeCtx())).toBeNull();
  });
});
