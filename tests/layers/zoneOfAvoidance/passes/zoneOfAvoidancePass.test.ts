/**
 * zoneOfAvoidancePass — the reduced-res producer half of the band (the upsample
 * layer is the consumer). The executor owns the pass and the additive-identity
 * clear, so what is pinned here is the draw-arg contract.
 */

import { describe, it, expect, vi } from 'vitest';

import { zoneOfAvoidancePass } from '../../../../src/layers/zoneOfAvoidance/passes/zoneOfAvoidancePass';
import { ZONE_OF_AVOIDANCE_SHELL } from '../../../../src/data/zoneOfAvoidance/zoneOfAvoidanceShell';
import { MILKY_WAY_RADIUS_MPC } from '../../../../src/data/milkyWay/milkyWayRadiusMpc';
import { symmetricFrustum } from '../../../../src/utils/camera/symmetricFrustum';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { ZoneOfAvoidanceRuntime } from '../../../../src/layers/zoneOfAvoidance/@types/ZoneOfAvoidanceRuntime';

const PASS_STUB = {
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

const INSIDE_CAM_DIST = MILKY_WAY_RADIUS_MPC * 10;

function makeCtx(): FrameView {
  return {
    cam: { position: [0, 0, INSIDE_CAM_DIST] } as never,
    frustum: symmetricFrustum(1, 1280 / 720),
    canvasSize: { width: 1280, height: 720 },
  } as unknown as FrameView;
}

function liveState(): EngineState {
  return {
    settings: { zoneOfAvoidance: { color: [1, 1, 1], intensity: 1, edgeSharpness: 1 } },
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

describe('zoneOfAvoidancePass.draw', () => {
  it('draws with ctx.cam, the canvas frustum, and the composed opacity', () => {
    const drawSpy = vi.fn();
    const runtime = makeRuntime({ draw: drawSpy });
    const pass = zoneOfAvoidancePass(runtime);
    const state = liveState();
    const ctx = makeCtx();
    pass.draw(PASS_STUB, {} as never, ctx, state, 0.5);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const args = drawSpy.mock.calls[0]!;
    // draw(pass, cam, frustum, tuning, shell, opacity)
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(ctx.cam);
    // The canvas frustum, not one off the 'zoa' downsample: it is the canvas, resampled.
    expect(args[2]).toBe(ctx.frustum);
    expect(args[3]).toBe(state.settings.zoneOfAvoidance);
    expect(args[4]).toBe(ZONE_OF_AVOIDANCE_SHELL);
    expect(args[5]).toBeCloseTo(0.5, 6); // the handed value, inside the window
  });
});

describe('zoneOfAvoidancePass.drawPick', () => {
  it('draws with ctx.cam, the canvas frustum and size, the view window, and the composed opacity', () => {
    const drawPickSpy = vi.fn();
    const runtime = makeRuntime({ drawPick: drawPickSpy });
    const pass = zoneOfAvoidancePass(runtime);
    const state = liveState();
    const ctx = makeCtx();
    const window = { originPx: [10, 20], sizePx: [1, 1] };
    pass.drawPick!(PASS_STUB, { window } as never, ctx, state, 0.5);
    expect(drawPickSpy).toHaveBeenCalledTimes(1);
    const args = drawPickSpy.mock.calls[0]!;
    // drawPick(pass, cam, frustum, canvasPx, window, tuning, shell, opacity)
    expect(args[0]).toBe(PASS_STUB);
    expect(args[1]).toBe(ctx.cam);
    // The pick rays are the canvas's, whatever window the target covers.
    expect(args[2]).toBe(ctx.frustum);
    expect(args[3]).toEqual([1280, 720]);
    expect(args[4]).toBe(window);
    expect(args[5]).toBe(state.settings.zoneOfAvoidance);
    expect(args[7]).toBeCloseTo(0.5, 6); // the handed value, inside the window
  });
});
