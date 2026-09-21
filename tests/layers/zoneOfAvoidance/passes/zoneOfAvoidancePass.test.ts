/**
 * zoneOfAvoidancePass — the reduced-res producer half of the band (the upsample
 * layer is the consumer). The executor owns the pass and the additive-identity
 * clear, so what is pinned here is the draw-arg contract and the `enabled` gate
 * tracking `deriveZoneOfAvoidanceLiveness`.
 */

import { describe, it, expect, vi } from 'vitest';

import { zoneOfAvoidancePass } from '../../../../src/layers/zoneOfAvoidance/passes/zoneOfAvoidancePass';
import { ZONE_OF_AVOIDANCE_SHELL } from '../../../../src/data/zoneOfAvoidance/zoneOfAvoidanceShell';
import { SCALE_FADE_BANDS } from '../../../../src/services/engine/presentation/scaleFadeBands';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { ZoneOfAvoidanceRuntime } from '../../../../src/layers/zoneOfAvoidance/@types/ZoneOfAvoidanceRuntime';

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

// The layer reads its viewport via `sizeOf('zoa')` — the fixture computes it
// here, mirroring the production table's scale: 5.
const ZOA_SCALE = 5;

/** Inside the visibility window: both bands saturate to 1 here. */
const INSIDE_CAM_DIST = SCALE_FADE_BANDS.zoneOfAvoidance.fullAt;

function makeCtx(over: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  const canvasSize = over.canvasSize ?? { width: 1280, height: 720 };
  return {
    isReady: true,
    cam: { position: [0, 0, INSIDE_CAM_DIST] } as never,
    canvasSize,
    drawCamPos: [0, 0, INSIDE_CAM_DIST] as Readonly<[number, number, number]>,
    nowMs: 0,
    focusBlend: 0,
    renderTargets: {
      specs: [
        { id: 'hdr', format: 'rgba16float', depth: null, scale: 1 },
        { id: 'zoa', format: 'rgba16float', depth: null, scale: ZOA_SCALE },
      ],
      sizeOf: (id: string) => {
        if (id !== 'zoa') throw new Error(`fixture renderTargets: no size for '${id}'`);
        return {
          width: Math.max(1, Math.floor(canvasSize.width / ZOA_SCALE)),
          height: Math.max(1, Math.floor(canvasSize.height / ZOA_SCALE)),
        };
      },
      viewOf: () => ({}) as GPUTextureView,
      destroy: vi.fn(),
    } as never,
    ...over,
  } as unknown as ReadyFrameContext;
}

/** A live state: toggle opacity 1. */
function liveState(): EngineState {
  return {
    settings: { zoneOfAvoidance: { color: [1, 1, 1], intensity: 1, edgeSharpness: 1 } },
    subsystems: {
      fades: { opacityOf: () => 1 },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

function makeRuntime(
  over: { draw?: ReturnType<typeof vi.fn>; drawPick?: ReturnType<typeof vi.fn> } = {},
): ZoneOfAvoidanceRuntime {
  return {
    renderer: {
      draw: over.draw ?? vi.fn(),
      drawPick: over.drawPick ?? vi.fn(),
    },
  } as unknown as ZoneOfAvoidanceRuntime;
}

// `enabled` never reads `view` — an opaque stub satisfies the 3-arg signature.
const VIEW_STUB = {} as unknown as SlabView;

describe('zoneOfAvoidancePass.enabled', () => {
  it('is enabled when the camera sits inside the visibility window', () => {
    const pass = zoneOfAvoidancePass(makeRuntime());
    expect(pass.enabled(liveState(), makeCtx(), VIEW_STUB)).toBe(true);
  });

  it('is disabled once the camera is past the recede band (Local Group framed up)', () => {
    const { goneAt } = SCALE_FADE_BANDS.zoneOfAvoidanceRecede;
    const ctx = makeCtx({ drawCamPos: [0, 0, goneAt * 10] as Readonly<[number, number, number]> });
    const pass = zoneOfAvoidancePass(makeRuntime());
    expect(pass.enabled(liveState(), ctx, VIEW_STUB)).toBe(false);
  });
});

describe('zoneOfAvoidancePass.draw', () => {
  it('draws with ctx.cam, the downsampled viewport, and the composed opacity', () => {
    const drawSpy = vi.fn();
    const runtime = makeRuntime({ draw: drawSpy });
    const pass = zoneOfAvoidancePass(runtime);
    const state = liveState();
    const ctx = makeCtx();
    pass.draw(PASS_STUB, {} as never, ctx, state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    // draw(pass, cam, viewport, tuning, shell, opacity)
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(ctx.cam);
    // Downsampled viewport — matches the actual fragment count.
    expect(args[2]).toEqual([Math.floor(1280 / ZOA_SCALE), Math.floor(720 / ZOA_SCALE)]);
    expect(args[3]).toBe(state.settings.zoneOfAvoidance);
    expect(args[4]).toBe(ZONE_OF_AVOIDANCE_SHELL);
    expect(args[5]).toBeCloseTo(1, 6); // opacity — full toggle, inside the window
  });
});

describe('zoneOfAvoidancePass.drawPick', () => {
  it('draws with ctx.cam, the FULL canvas viewport, and the composed opacity', () => {
    const drawPickSpy = vi.fn();
    const runtime = makeRuntime({ drawPick: drawPickSpy });
    const pass = zoneOfAvoidancePass(runtime);
    const state = liveState();
    const ctx = makeCtx();
    pass.drawPick!(PASS_STUB, {} as never, ctx, state);
    expect(drawPickSpy).toHaveBeenCalledTimes(1);
    const args = drawPickSpy.mock.calls[0]!;
    // drawPick(pass, cam, viewport, tuning, shell, opacity)
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(ctx.cam);
    // Full-res viewport — NOT the 'zoa' target's downsampled one `draw` uses,
    // because the pick pass rasterises at full canvas resolution.
    expect(args[2]).toEqual([1280, 720]);
    expect(args[3]).toBe(state.settings.zoneOfAvoidance);
    expect(args[5]).toBeCloseTo(1, 6); // opacity — full toggle, inside the window
  });
});
