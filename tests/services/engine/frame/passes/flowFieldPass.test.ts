/**
 * flowFieldPass tests — the enabled() gate (settings.flow.enabled AND
 * slotReady(assetSlots.flow)) and the draw delegation + defensive renderer-null
 * guard.
 *
 * No real GPUDevice — every GPU-typed value is a cast stub. The Pass interface
 * splits `enabled` from `draw`, so the gate predicate is asserted independently
 * of the draw commands.
 */
import { describe, it, expect, vi } from 'vitest';
import { flowFieldPass } from '../../../../../src/services/engine/frame/passes/flowFieldPass';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { PassDeps } from '../../../../../src/@types/engine/frame/PassDeps';
import type { Mat4 } from 'wgpu-matrix';

function makeCtx(): ReadyFrameContext {
  return {
    isReady: true,
    cam: {} as never,
    vp: new Float32Array(16) as unknown as Mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    fovYRad: (60 * Math.PI) / 180,
    focusBlend: 0,
    visibleSourceMask: 0xffffffff,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: 0,
    },
    renderer: {} as never,
    postProcess: {} as never,
    volumeOffscreen: {} as never,
    texturedDisks: {} as never,
    foregroundVp: new Float64Array(16),
    foregroundNear: 0.001,
    foregroundFar: 1000,
    renderOrigin: [0, 0, 0],
  };
}

/**
 * Build an EngineState stub with the flow settings + load status the gate
 * reads, plus a fade-registry stub whose `opacityOf` returns a fixed value
 * (the draw delegation folds it in; the enabled gate reads it for fade-out).
 *
 * The gate reads `slotReady(assetSlots.flow)`, so `loaded` is modelled as the
 * flow slot's `state().kind` ('ready' when loaded, else 'idle').
 */
function makeState(
  over: { enabled?: boolean; loaded?: boolean; opacity?: number } = {},
): EngineState {
  const ready = over.loaded ?? true;
  return {
    settings: { flow: { enabled: over.enabled ?? true } },
    assetSlots: {
      flow: { state: () => ({ kind: ready ? 'ready' : 'idle' }) },
    },
    subsystems: {
      fades: { opacityOf: vi.fn(() => over.opacity ?? 0.42) },
    },
  } as unknown as EngineState;
}

const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

describe('flowFieldPass.enabled', () => {
  it('returns false when the cube is not loaded (even if enabled)', () => {
    expect(
      flowFieldPass.enabled(makeState({ enabled: true, loaded: false, opacity: 1 }), makeCtx()),
    ).toBe(false);
  });

  it('returns true when enabled AND loaded', () => {
    expect(flowFieldPass.enabled(makeState({ enabled: true, loaded: true }), makeCtx())).toBe(true);
  });

  it('returns true when disabled but loaded and fade opacity > 0 (fade-out keep-alive)', () => {
    expect(
      flowFieldPass.enabled(makeState({ enabled: false, loaded: true, opacity: 0.3 }), makeCtx()),
    ).toBe(true);
  });

  it('returns false when disabled, loaded, and fade opacity is 0', () => {
    expect(
      flowFieldPass.enabled(makeState({ enabled: false, loaded: true, opacity: 0 }), makeCtx()),
    ).toBe(false);
  });
});

describe('flowFieldPass.draw', () => {
  it('delegates to flowFieldRenderer.draw with the pass, vp, viewport, settings.flow, and fade opacity', () => {
    const drawSpy = vi.fn();
    const deps = { flowFieldRenderer: { draw: drawSpy } } as unknown as PassDeps;
    const state = makeState({ opacity: 0.42 });
    flowFieldPass.draw(PASS_STUB, makeCtx(), state, deps);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const call = drawSpy.mock.calls[0]!;
    expect(call[0]).toBe(PASS_STUB);
    expect(call[2]).toEqual([1280, 720]);
    expect(call[3]).toBe(state.settings.flow);
    // The layer fade opacity (from fades.opacityOf) is folded in as the 5th arg.
    expect(call[4]).toBe(0.42);
  });

  it('does not throw when flowFieldRenderer is null (defensive null-check)', () => {
    const deps = { flowFieldRenderer: null } as unknown as PassDeps;
    expect(() => flowFieldPass.draw(PASS_STUB, makeCtx(), makeState(), deps)).not.toThrow();
  });
});
