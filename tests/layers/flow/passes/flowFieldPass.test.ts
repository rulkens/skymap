/**
 * flowFieldPass tests — the enabled() gate (settings.flow.enabled AND the
 * runtime slot's committed state) and the draw delegation to the runtime's
 * own renderer. No real GPUDevice — every GPU-typed value is a cast stub.
 */
import { describe, it, expect, vi } from 'vitest';
import { flowFieldPass } from '../../../../src/layers/flow/passes/flowFieldPass';
import { makeCosmoSlab } from '../../../fixtures/makeCosmoSlab';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { FlowRuntime } from '../../../../src/layers/flow/@types/FlowRuntime';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { Mat4 } from 'wgpu-matrix';

function makeCtx(): FrameView {
  return {
    snapshot: {
      isReady: true,
      nowMs: 0,
      simDays: 0,
      focusBlend: 0,
      layersSettling: false,
      visibleSourceMask: 0xffffffff,
      focus: {
        center: [0, 0, 0] as Readonly<[number, number, number]>,
        apparentRadiusMpc: 1,
        physicalRadiusMpc: 0,
        blend: 0,
      },
      renderTargets: {} as never,
      cursorTexPx: null,
      renderedTargets: new Set<string>(),
    },
    viewSlot: 0,
    viewKind: 'frame',
    // Nothing in this file reads bodyPose.
    bodyPose: () => null,
    cam: {} as never,
    vp: new Float32Array(16) as unknown as Mat4,
    slabs: [],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720,
    fovYRad: (60 * Math.PI) / 180,
  } as unknown as FrameView;
}

/** Minimal SlabView matching the ctx above. `slab` is unused by this layer. */
function makeView(): SlabView {
  return {
    slab: makeCosmoSlab(),
    vp: new Float32Array(16),
    camPos: [0, 0, 5],
    viewportPx: [1280, 720],
  };
}

/** Build an EngineState stub with just the settings + fade-registry the gate reads. */
function makeState(over: { enabled?: boolean; opacity?: number } = {}): EngineState {
  return {
    settings: { flow: { enabled: over.enabled ?? true } },
    subsystems: {
      fades: { opacityOf: vi.fn(() => over.opacity ?? 0.42) },
      clipPlayer: { clipOpacityOf: () => 1 },
    },
  } as unknown as EngineState;
}

/**
 * A runtime whose `slot.committed()` models the load status directly — the
 * gate reads `runtime.slot`, not `state.assetSlots.flow`, now that the pass
 * closes over the Layer's own Runtime.
 */
function makeRuntime(
  over: { loaded?: boolean; draw?: (...args: unknown[]) => void } = {},
): FlowRuntime {
  const ready = over.loaded ?? true;
  return {
    slot: {
      committed: () =>
        ready ? { kind: 'ready', req: undefined, value: undefined, loadedAtMs: 0 } : null,
    },
    renderer: { draw: over.draw ?? vi.fn() },
  } as unknown as FlowRuntime;
}

const PASS_STUB = {
  setPipeline: vi.fn(),
  setBindGroup: vi.fn(),
  draw: vi.fn(),
} as unknown as GPURenderPassEncoder;

describe('flowFieldPass.enabled', () => {
  it('returns false when the cube is not loaded (even if enabled)', () => {
    const pass = flowFieldPass(makeRuntime({ loaded: false }));
    expect(pass.enabled(makeState({ enabled: true, opacity: 1 }), makeCtx(), makeView())).toBe(
      false,
    );
  });

  it('returns true when enabled AND loaded', () => {
    const pass = flowFieldPass(makeRuntime({ loaded: true }));
    expect(pass.enabled(makeState({ enabled: true }), makeCtx(), makeView())).toBe(true);
  });

  it('returns true when disabled but loaded and fade opacity > 0 (fade-out keep-alive)', () => {
    const pass = flowFieldPass(makeRuntime({ loaded: true }));
    expect(pass.enabled(makeState({ enabled: false, opacity: 0.3 }), makeCtx(), makeView())).toBe(
      true,
    );
  });

  it('returns false when disabled, loaded, and fade opacity is 0', () => {
    const pass = flowFieldPass(makeRuntime({ loaded: true }));
    expect(pass.enabled(makeState({ enabled: false, opacity: 0 }), makeCtx(), makeView())).toBe(
      false,
    );
  });
});

describe('flowFieldPass.draw', () => {
  it('delegates to the runtime renderer.draw with the pass, vp, viewport, settings.flow, and fade opacity', () => {
    const drawSpy = vi.fn();
    const pass = flowFieldPass(makeRuntime({ draw: drawSpy }));
    const state = makeState({ opacity: 0.42 });
    const view = makeView();
    pass.draw(PASS_STUB, view, makeCtx(), state);
    expect(drawSpy).toHaveBeenCalledTimes(1);
    const call = drawSpy.mock.calls[0]!;
    expect(call[0]).toBe(PASS_STUB);
    expect(call[1]).toBe(view.vp);
    expect(call[2]).toEqual(view.viewportPx);
    expect(call[3]).toBe(state.settings.flow);
    // The layer fade opacity (from fades.opacityOf) is folded in as the 5th arg.
    expect(call[4]).toBe(0.42);
  });
});
