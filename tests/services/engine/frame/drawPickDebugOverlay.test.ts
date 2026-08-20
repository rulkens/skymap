/**
 * drawPickDebugOverlay — unit tests for the pick-buffer debug visualisation
 * helper.
 *
 * Coverage focus:
 *   - No-op when `overlays['pick-buffer']` is off.
 *   - No-op when `pickProgram` / `pickDebugOverlay` is null.
 *   - No-op when `pickProgram.renderForDebug()` returns an empty array (engine
 *     not ready to pick, or no slab has an enabled pickable layer).
 *   - Calls `renderForDebug()` and submits an overlay pass when all conditions
 *     are met, drawing each returned slab texture far→near in ONE pass so the
 *     premultiplied OVER blend gives near-wins compositing.
 *
 * The what-is-pickable and is-the-engine-ready decisions all live inside
 * `pickProgram` now — this helper only asks it for the slab textures and
 * composites them.
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
 * Build a minimal EngineState fragment. `pickBufferOn` seeds
 * `debug.overlays['pick-buffer']`, the toggle that gates the whole helper;
 * `pickProgram.renderForDebug()` returns the slab pick textures far→near
 * (empty for nothing to show); `pickDebugOverlay.draw` is the composite
 * step, invoked once per returned texture.
 */
function makeState({
  pickBufferOn = true,
  renderForDebugResult = [makePickTex()] as readonly GPUTexture[],
}: {
  pickBufferOn?: boolean;
  renderForDebugResult?: readonly GPUTexture[];
} = {}) {
  const renderForDebug = vi.fn<() => readonly GPUTexture[]>(() => renderForDebugResult);
  const overlayDraw = vi.fn<(pass: GPURenderPassEncoder, view: GPUTextureView) => void>();

  return {
    settings: {
      debug: { overlays: { 'pick-buffer': pickBufferOn }, renderStrategy: 'auto' },
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
  it("is a no-op when overlays['pick-buffer'] is false", () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState({ pickBufferOn: false });
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

  it('is a no-op when renderForDebug returns an empty array (no pickable slab)', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState({ renderForDebugResult: [] });
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
    const state = makeState({ renderForDebugResult: [pickTex] });
    drawPickDebugOverlay(state, deps);

    const drawSpy = state.gpu.pickDebugOverlay!.draw as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledOnce();
    const [, viewArg] = drawSpy.mock.calls[0]!;
    // The view is the one createView() returned on the pick texture.
    expect(viewArg).toBe((pickTex.createView as ReturnType<typeof vi.fn>).mock.results[0]!.value);
  });

  it('composites every returned texture in one pass, far→near, in order', () => {
    // renderForDebug returns FAR → NEAR; the overlay must draw each texture into
    // the single pass in that order so the near slab (drawn last) composites on
    // top under the premultiplied OVER blend — mirroring frontmostPick.
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const farTex = makePickTex();
    const nearTex = makePickTex();
    const state = makeState({ renderForDebugResult: [farTex, nearTex] });
    drawPickDebugOverlay(state, deps);

    // A single overlay pass is opened, and draw is invoked once per texture.
    const beginCalls = (
      (deps.device.createCommandEncoder as ReturnType<typeof vi.fn>).mock.results[0]!
        .value as GPUCommandEncoder
    ).beginRenderPass as ReturnType<typeof vi.fn>;
    expect(beginCalls).toHaveBeenCalledOnce();

    const drawSpy = state.gpu.pickDebugOverlay!.draw as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledTimes(2);
    const viewOrder = drawSpy.mock.calls.map(([, view]) => view);
    expect(viewOrder).toEqual([
      (farTex.createView as ReturnType<typeof vi.fn>).mock.results[0]!.value,
      (nearTex.createView as ReturnType<typeof vi.fn>).mock.results[0]!.value,
    ]);
  });
});
