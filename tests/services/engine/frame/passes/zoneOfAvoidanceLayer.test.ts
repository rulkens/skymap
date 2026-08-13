/**
 * zoneOfAvoidanceLayer tests — the reduced-resolution zone-of-avoidance band
 * raymarch as a ContentLayer (`target: 'zoa'`, `slab: COSMO`, `blend:
 * 'additive'`), gate-fix 6's producer half.
 *
 * The executor owns the pass + the additive-identity `(0, 0, 0, 0)` clear;
 * this layer only draws. These tests pin the draw-arg contract (the
 * downsampled viewport threaded to `zoneOfAvoidanceRenderer.draw`, the
 * placeholder shape constants, the opacity arg) and the `enabled` gate
 * tracking `deriveZoneOfAvoidanceLiveness`.
 */

import { describe, it, expect, vi } from 'vitest';

import { zoneOfAvoidanceLayer } from '../../../../../src/services/engine/frame/passes/zoneOfAvoidanceLayer';
import { SCALE_FADE_BANDS } from '../../../../../src/services/engine/presentation/scaleFadeBands';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// The layer reads the downsample divisor off the 'zoa' spec row — the
// fixture mirrors the production table's scale: 5.
const ZOA_SCALE = 5;

/** Inside the visibility window: both bands saturate to 1 here. */
const INSIDE_CAM_DIST = SCALE_FADE_BANDS.zoneOfAvoidance.fullAt;

function makeCtx(over: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  return {
    isReady: true,
    cam: { position: [0, 0, INSIDE_CAM_DIST] } as never,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, INSIDE_CAM_DIST] as Readonly<[number, number, number]>,
    nowMs: 0,
    focusBlend: 0,
    renderTargets: {
      specs: [
        { id: 'hdr', format: 'rgba16float', depth: null, scale: 1 },
        { id: 'zoa', format: 'rgba16float', depth: null, scale: ZOA_SCALE },
      ],
      viewOf: () => ({}) as GPUTextureView,
      resize: vi.fn(),
      destroy: vi.fn(),
    } as never,
    ...over,
  } as unknown as ReadyFrameContext;
}

/** A live state: renderer present, toggle opacity 1. */
function liveState(over: { draw?: ReturnType<typeof vi.fn> } = {}): EngineState {
  return {
    gpu: { zoneOfAvoidanceRenderer: { draw: over.draw ?? vi.fn(), drawLabels: vi.fn() } },
    settings: { zoneOfAvoidance: { color: [1, 1, 1], intensity: 1, edgeSharpness: 1 } },
    subsystems: { fades: { opacityOf: () => 1 } },
  } as unknown as EngineState;
}

describe('zoneOfAvoidanceLayer.enabled', () => {
  it('is enabled when the camera sits inside the visibility window', () => {
    expect(zoneOfAvoidanceLayer.enabled(liveState(), makeCtx())).toBe(true);
  });

  it('is enabled even when the renderer is null (self-correcting near-miss)', () => {
    const state = {
      gpu: { zoneOfAvoidanceRenderer: null },
      subsystems: { fades: { opacityOf: () => 1 } },
    } as unknown as EngineState;
    expect(zoneOfAvoidanceLayer.enabled(state, makeCtx())).toBe(true);
  });

  it('is disabled once the camera is past the recede band (Local Group framed up)', () => {
    const { goneAt } = SCALE_FADE_BANDS.zoneOfAvoidanceRecede;
    const ctx = makeCtx({ drawCamPos: [0, 0, goneAt * 10] as Readonly<[number, number, number]> });
    expect(zoneOfAvoidanceLayer.enabled(liveState(), ctx)).toBe(false);
  });
});

describe('zoneOfAvoidanceLayer.draw', () => {
  it('draws with ctx.cam, the downsampled viewport, and the composed opacity', () => {
    const drawSpy = vi.fn();
    const state = liveState({ draw: drawSpy });
    const ctx = makeCtx();
    zoneOfAvoidanceLayer.draw(PASS_STUB, {} as never, ctx, state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    // draw(pass, cam, viewport, tuning, inner, outer, bulge, anticenter, opacity)
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(ctx.cam);
    // Downsampled viewport — matches the actual fragment count.
    expect(args[2]).toEqual([Math.floor(1280 / ZOA_SCALE), Math.floor(720 / ZOA_SCALE)]);
    expect(args[3]).toBe(state.settings.zoneOfAvoidance);
    expect(typeof args[4]).toBe('number'); // innerRadiusMpc
    expect(typeof args[5]).toBe('number'); // outerRadiusMpc
    expect(typeof args[6]).toBe('number'); // bulgeDeg
    expect(typeof args[7]).toBe('number'); // anticenterDeg
    expect(args[8]).toBeCloseTo(1, 6); // opacity — full toggle, inside the window
  });

  it('clamps the downsampled viewport to a minimum of 1 px', () => {
    const drawSpy = vi.fn();
    const state = liveState({ draw: drawSpy });
    const ctx = makeCtx({ canvasSize: { width: 1, height: 1 } });
    zoneOfAvoidanceLayer.draw(PASS_STUB, {} as never, ctx, state);
    expect(drawSpy.mock.calls[0]![2]).toEqual([1, 1]);
  });

  it('is a no-op when the renderer is null (pre-bootstrap)', () => {
    const state = {
      gpu: { zoneOfAvoidanceRenderer: null },
      subsystems: { fades: { opacityOf: () => 1 } },
    } as unknown as EngineState;
    expect(() => zoneOfAvoidanceLayer.draw(PASS_STUB, {} as never, makeCtx(), state)).not.toThrow();
  });

  it('is a no-op when outside the visibility window (defensive — executor gates first)', () => {
    const drawSpy = vi.fn();
    const state = liveState({ draw: drawSpy });
    const { goneAt } = SCALE_FADE_BANDS.zoneOfAvoidanceRecede;
    const ctx = makeCtx({ drawCamPos: [0, 0, goneAt * 10] as Readonly<[number, number, number]> });
    zoneOfAvoidanceLayer.draw(PASS_STUB, {} as never, ctx, state);
    expect(drawSpy).not.toHaveBeenCalled();
  });
});
