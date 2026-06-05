/**
 * flowFieldPass tests — the enabled() gate (settings.flow.enabled AND
 * data.flow.loaded) and the draw delegation + defensive renderer-null guard.
 *
 * No real GPUDevice — every GPU-typed value is a cast stub. The Pass interface
 * splits `enabled` from `draw`, so the gate predicate is asserted independently
 * of the draw commands.
 */
import { describe, it, expect, vi } from 'vitest';
import { flowFieldPass } from '../../../../../src/services/engine/frame/passes/flowFieldPass';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { RenderFrameSettings } from '../../../../../src/@types/engine/frame/RenderFrameSettings';
import type { PassDeps } from '../../../../../src/@types/engine/frame/PassDeps';
import type { mat4 } from 'gl-matrix';

function makeCtx(): ReadyFrameContext {
  return {
    isReady: true,
    cam: {} as never,
    vp: new Float32Array(16) as unknown as mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    renderer: {} as never,
    postProcess: {} as never,
    volumeOffscreen: {} as never,
    texturedDisks: {} as never,
  };
}

/** Build an EngineState stub with the flow settings + load status the gate reads. */
function makeState(over: { enabled?: boolean; loaded?: boolean } = {}): EngineState {
  return {
    settings: { flow: { enabled: over.enabled ?? true } },
    data: { flow: { loaded: over.loaded ?? true } },
  } as unknown as EngineState;
}

const SETTINGS = {} as RenderFrameSettings;
const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

describe('flowFieldPass.enabled', () => {
  it('returns false when flow.enabled is false', () => {
    expect(
      flowFieldPass.enabled(makeState({ enabled: false, loaded: true }), makeCtx(), SETTINGS),
    ).toBe(false);
  });

  it('returns false when the cube is not loaded', () => {
    expect(
      flowFieldPass.enabled(makeState({ enabled: true, loaded: false }), makeCtx(), SETTINGS),
    ).toBe(false);
  });

  it('returns true when enabled AND loaded', () => {
    expect(
      flowFieldPass.enabled(makeState({ enabled: true, loaded: true }), makeCtx(), SETTINGS),
    ).toBe(true);
  });
});

describe('flowFieldPass.draw', () => {
  it('delegates to flowFieldRenderer.draw with the pass, vp, viewport, and settings.flow', () => {
    const drawSpy = vi.fn();
    const deps = { flowFieldRenderer: { draw: drawSpy } } as unknown as PassDeps;
    const state = makeState();
    flowFieldPass.draw(PASS_STUB, makeCtx(), state, SETTINGS, deps);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const call = drawSpy.mock.calls[0]!;
    expect(call[0]).toBe(PASS_STUB);
    expect(call[2]).toEqual([1280, 720]);
    expect(call[3]).toBe(state.settings.flow);
  });

  it('does not throw when flowFieldRenderer is null (defensive null-check)', () => {
    const deps = { flowFieldRenderer: null } as unknown as PassDeps;
    expect(() =>
      flowFieldPass.draw(PASS_STUB, makeCtx(), makeState(), SETTINGS, deps),
    ).not.toThrow();
  });
});
