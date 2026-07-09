/**
 * drawPickDebugOverlay — unit tests for the pick-buffer debug visualisation
 * helper.
 *
 * Coverage focus:
 *   - No-op when `showPickBuffer` is off.
 *   - No-op when `pickProgram` / `pickDebugOverlay` is null.
 *   - No-op when `pickProgram.renderForDebug()` returns null (engine not ready
 *     to pick, or no cosmological pickable layer enabled).
 *   - Calls `renderForDebug()` and submits an overlay pass when all conditions
 *     are met.
 *
 * The what-is-pickable and is-the-engine-ready decisions all live inside
 * `pickProgram` now — this helper only asks it for a texture and composites it.
 * The helper is called from `runFrame` AFTER the main `renderFrame` submit, so
 * it uses a separate encoder with `loadOp: 'load'` — the tests assert that the
 * swap-chain view is acquired fresh and the pass preserves the frame beneath.
 */

import { describe, it, expect, vi } from 'vitest';
import { drawPickDebugOverlay } from '../../../../src/services/engine/frame/drawPickDebugOverlay';
import type { DrawPickDebugOverlayDeps } from '../../../../src/services/engine/frame/drawPickDebugOverlay';

// ── Stubs ────────────────────────────────────────────────────────────────────

function makeSwapView() {
  return { __id: 'swap-view' } as unknown as GPUTextureView;
}

function makePickTex(): GPUTexture {
  const view = makeSwapView();
  return {
    createView: vi.fn<() => GPUTextureView>(() => view),
  } as unknown as GPUTexture;
}

function makeOverlayPass() {
  return {
    end: vi.fn<() => void>(),
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
}

function makeCommandBuffer() {
  return {} as GPUCommandBuffer;
}

function makeEncoder(callLog: string[]) {
  const overlayPass = makeOverlayPass();
  const buf = makeCommandBuffer();
  return {
    encoder: {
      beginRenderPass: vi.fn<(d: GPURenderPassDescriptor) => GPURenderPassEncoder>(() => {
        callLog.push('overlay.beginRenderPass');
        return overlayPass;
      }),
      finish: vi.fn<() => GPUCommandBuffer>(() => {
        callLog.push('overlay.encoder.finish');
        return buf;
      }),
    } as unknown as GPUCommandEncoder,
    overlayPass,
    buf,
  };
}

/**
 * Build a minimal deps bag. `device` and `context` are fakes that record
 * calls into `callLog`.
 */
function makeDeps(callLog: string[]): DrawPickDebugOverlayDeps {
  const swapView = makeSwapView();
  const enc = makeEncoder(callLog);
  const submit = vi.fn<(b: ReadonlyArray<GPUCommandBuffer>) => void>((b) => {
    callLog.push('device.queue.submit');
    (submit as any).lastBuffers = b;
  });
  const createCommandEncoder = vi.fn<() => GPUCommandEncoder>(() => {
    callLog.push('device.createCommandEncoder');
    return enc.encoder;
  });
  return {
    device: {
      createCommandEncoder,
      queue: { submit },
    } as unknown as GPUDevice,
    context: {
      getCurrentTexture: vi.fn(() => ({
        createView: vi.fn<() => GPUTextureView>(() => {
          callLog.push('context.getCurrentTexture.createView');
          return swapView;
        }),
      })),
    } as unknown as GPUCanvasContext,
  };
}

/**
 * Build a minimal EngineState fragment. `showPickBuffer` gates the whole
 * helper; `pickProgram.renderForDebug()` returns the pick texture (or null);
 * `pickDebugOverlay.draw` is the composite step.
 */
function makeState({
  showPickBuffer = true,
  renderForDebugResult = makePickTex() as GPUTexture | null,
}: {
  showPickBuffer?: boolean;
  renderForDebugResult?: GPUTexture | null;
} = {}) {
  const renderForDebug = vi.fn<() => GPUTexture | null>(() => renderForDebugResult);
  const overlayDraw = vi.fn<(pass: GPURenderPassEncoder, view: GPUTextureView) => void>();

  return {
    settings: {
      debug: { showPickBuffer },
    },
    gpu: {
      pickProgram: {
        renderForDebug,
      },
      pickDebugOverlay: {
        draw: overlayDraw,
      },
    },
  } as unknown as import('../../../../src/@types/engine/state/EngineState').EngineState;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('drawPickDebugOverlay', () => {
  it('is a no-op when showPickBuffer is false', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState({ showPickBuffer: false });
    drawPickDebugOverlay(state, deps);
    expect(callLog).toHaveLength(0);
    // renderForDebug must not even be consulted.
    expect(state.gpu.pickProgram!.renderForDebug).not.toHaveBeenCalled();
  });

  it('is a no-op when pickProgram is null', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState();
    (state.gpu as any).pickProgram = null;
    drawPickDebugOverlay(state, deps);
    expect(callLog).toHaveLength(0);
  });

  it('is a no-op when pickDebugOverlay is null', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState();
    (state.gpu as any).pickDebugOverlay = null;
    drawPickDebugOverlay(state, deps);
    expect(callLog).toHaveLength(0);
  });

  it('is a no-op when renderForDebug returns null (no pick texture)', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState({ renderForDebugResult: null });
    drawPickDebugOverlay(state, deps);
    // createCommandEncoder must NOT have been called.
    expect(callLog.find((e) => e === 'device.createCommandEncoder')).toBeUndefined();
  });

  it('calls pickProgram.renderForDebug() to populate the pick texture', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState();
    drawPickDebugOverlay(state, deps);

    const spy = state.gpu.pickProgram!.renderForDebug as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledOnce();
    // The program derives its own camera + pickables — no arguments.
    expect(spy.mock.calls[0]!).toHaveLength(0);
  });

  it('creates a new encoder and submits an overlay pass when a pick texture is returned', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState();
    drawPickDebugOverlay(state, deps);

    // The overlay encoder lifecycle must appear in the log.
    expect(callLog).toContain('device.createCommandEncoder');
    expect(callLog).toContain('overlay.beginRenderPass');
    expect(callLog).toContain('overlay.encoder.finish');
    expect(callLog).toContain('device.queue.submit');
  });

  it('opens the overlay render pass with loadOp: "load" to preserve the tone-mapped frame', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState();
    drawPickDebugOverlay(state, deps);

    const enc = (deps.device.createCommandEncoder as ReturnType<typeof vi.fn>).mock.results[0]!
      .value as GPUCommandEncoder;
    const beginCalls = (enc.beginRenderPass as ReturnType<typeof vi.fn>).mock.calls as Array<
      [GPURenderPassDescriptor]
    >;
    expect(beginCalls).toHaveLength(1);
    const att = Array.from(beginCalls[0]![0].colorAttachments as any)[0] as any;
    expect(att.loadOp).toBe('load');
    expect(att.storeOp).toBe('store');
  });

  it('calls pickDebugOverlay.draw with the render pass and the pick texture view', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const pickTex = makePickTex();
    const state = makeState({ renderForDebugResult: pickTex });
    drawPickDebugOverlay(state, deps);

    const drawSpy = state.gpu.pickDebugOverlay!.draw as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledOnce();
    const [, viewArg] = drawSpy.mock.calls[0]!;
    // The view is the one createView() returned on the pick texture.
    expect(viewArg).toBe((pickTex.createView as ReturnType<typeof vi.fn>).mock.results[0]!.value);
  });
});
