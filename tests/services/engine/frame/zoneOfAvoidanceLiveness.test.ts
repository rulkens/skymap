/**
 * deriveZoneOfAvoidanceLiveness — the single per-frame projection both
 * zone-of-avoidance layers (the reduced-res band raymarch and the
 * hdr-composite + full-res lettering) consume to decide whether the band is
 * live this frame, and at what opacity.
 *
 * Pre gate-fix-6 the composition (`zoneOfAvoidanceLayerOpacity(camDist,
 * resolveLayerOpacity(...))`) was inlined directly in the single
 * `zoneOfAvoidanceLayer`; these tests pin the ONE derivation both split
 * layers now share, and that it does NOT gate on the renderer handle (the
 * "self-correcting near-miss" convention `filamentsLayer` / `horizonShellLayer`
 * also use — a null-renderer frame still reports live, and `draw` self-corrects).
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

function makeState(toggleOpacity = 1): EngineState {
  return {
    gpu: { zoneOfAvoidanceRenderer: null },
    subsystems: {
      fades: { opacityOf: vi.fn(() => toggleOpacity) },
      // clipPlayer omitted → resolveLayerOpacity's clip factor defaults to 1.
    },
  } as unknown as EngineState;
}

describe('deriveZoneOfAvoidanceLiveness', () => {
  it('returns the composed opacity when the camera sits inside the visibility window', () => {
    const opacity = deriveZoneOfAvoidanceLiveness(makeState(0.6), makeCtx());
    expect(opacity).toBeCloseTo(0.6, 6);
  });

  it('returns null outside the visibility window (opacity would be 0)', () => {
    // Far past the recede band's goneAt — the Local Group has fully framed up.
    const { goneAt } = SCALE_FADE_BANDS.zoneOfAvoidanceRecede;
    const ctx = makeCtx({ drawCamPos: [0, 0, goneAt * 10] as Readonly<[number, number, number]> });
    expect(deriveZoneOfAvoidanceLiveness(makeState(1), ctx)).toBeNull();
  });

  it('returns null when the fade-registry toggle opacity is 0, even inside the window', () => {
    expect(deriveZoneOfAvoidanceLiveness(makeState(0), makeCtx())).toBeNull();
  });

  it('does NOT gate on state.gpu.zoneOfAvoidanceRenderer — a null renderer still reports live', () => {
    // Self-correcting near-miss: enabled() reports true pre-bootstrap, and
    // each layer's own draw() null-checks the renderer independently.
    const state = makeState(1);
    expect((state.gpu as { zoneOfAvoidanceRenderer: null }).zoneOfAvoidanceRenderer).toBeNull();
    expect(deriveZoneOfAvoidanceLiveness(state, makeCtx())).not.toBeNull();
  });
});
