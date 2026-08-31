/**
 * flowFieldLayer tests — the enabled() gate (settings.flow.enabled AND
 * slotReady(assetSlots.flow)) and the draw delegation + defensive renderer-null
 * guard.
 *
 * No real GPUDevice — every GPU-typed value is a cast stub. The ContentLayer
 * interface splits `enabled` from `draw`, so the gate predicate is asserted
 * independently of the draw commands.
 */
import { describe, it, expect, vi } from 'vitest';
import { flowFieldLayer } from '../../../../../src/services/engine/frame/passes/flowFieldLayer';
import { COSMO } from '../../../../../src/services/engine/frame/slabs';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Mat4 } from 'wgpu-matrix';

function makeCtx(): ReadyFrameContext {
  return {
    isReady: true,
    renderedTargets: new Set<string>(),
    cam: {} as never,
    vp: new Float32Array(16) as unknown as Mat4,
    slabs: [],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    nowMs: 0,
    simDays: 0,
    fovYRad: (60 * Math.PI) / 180,
    focusBlend: 0,
    visibleSourceMask: 0xffffffff,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: 0,
    },
    galaxyPointRenderer: {} as never,
    renderTargets: {} as never,
    texturedDisks: {} as never,
  };
}

/** Minimal SlabView matching the ctx above. `slab` is unused by this layer. */
function makeView(): SlabView {
  return {
    slab: {
      index: COSMO,
      nearMpc: 0.01,
      farMpc: 50000,
      vp: new Float64Array(16),
      frame: { kind: 'world-mpc', originRelative: false },
      precision: 'f32',
      reversedZ: false,
    },
    vp: new Float32Array(16),
    camPos: [0, 0, 5],
    viewportPx: [1280, 720],
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
  over: { enabled?: boolean; loaded?: boolean; opacity?: number; flowFieldRenderer?: unknown } = {},
): EngineState {
  const ready = over.loaded ?? true;
  return {
    settings: { flow: { enabled: over.enabled ?? true } },
    assetSlots: {
      flow: { state: () => ({ kind: ready ? 'ready' : 'idle' }) },
    },
    subsystems: {
      fades: { opacityOf: vi.fn(() => over.opacity ?? 0.42) },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
    gpu: { flowFieldRenderer: over.flowFieldRenderer ?? null },
  } as unknown as EngineState;
}

const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

describe('flowFieldLayer.enabled', () => {
  it('returns false when the cube is not loaded (even if enabled)', () => {
    expect(
      flowFieldLayer.enabled(makeState({ enabled: true, loaded: false, opacity: 1 }), makeCtx()),
    ).toBe(false);
  });

  it('returns true when enabled AND loaded', () => {
    expect(flowFieldLayer.enabled(makeState({ enabled: true, loaded: true }), makeCtx())).toBe(
      true,
    );
  });

  it('returns true when disabled but loaded and fade opacity > 0 (fade-out keep-alive)', () => {
    expect(
      flowFieldLayer.enabled(makeState({ enabled: false, loaded: true, opacity: 0.3 }), makeCtx()),
    ).toBe(true);
  });

  it('returns false when disabled, loaded, and fade opacity is 0', () => {
    expect(
      flowFieldLayer.enabled(makeState({ enabled: false, loaded: true, opacity: 0 }), makeCtx()),
    ).toBe(false);
  });
});

describe('flowFieldLayer.draw', () => {
  it('delegates to state.gpu.flowFieldRenderer.draw with the pass, vp, viewport, settings.flow, and fade opacity', () => {
    const drawSpy = vi.fn();
    const state = makeState({ opacity: 0.42, flowFieldRenderer: { draw: drawSpy } });
    const view = makeView();
    flowFieldLayer.draw(PASS_STUB, view, makeCtx(), state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const call = drawSpy.mock.calls[0]!;
    expect(call[0]).toBe(PASS_STUB);
    expect(call[1]).toBe(view.vp);
    expect(call[2]).toEqual(view.viewportPx);
    expect(call[3]).toBe(state.settings.flow);
    // The layer fade opacity (from fades.opacityOf) is folded in as the 5th arg.
    expect(call[4]).toBe(0.42);
  });

  it('does not throw when flowFieldRenderer is null (defensive null-check)', () => {
    const state = makeState({ flowFieldRenderer: null });
    expect(() => flowFieldLayer.draw(PASS_STUB, makeView(), makeCtx(), state)).not.toThrow();
  });
});
