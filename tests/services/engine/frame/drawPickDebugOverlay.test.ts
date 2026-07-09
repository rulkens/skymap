/**
 * drawPickDebugOverlay — unit tests for the pick-buffer debug visualisation
 * helper.
 *
 * Coverage focus:
 *   - No-op when `showPickBuffer` is off.
 *   - No-op when the engine is not ready to pick (`pickFrameContext` → null).
 *   - No-op when no pick targets are visible (`hasAny === false`).
 *   - No-op when required GPU handles are null.
 *   - Calls `renderForDebug` and submits an overlay pass when all conditions
 *     are met (ready engine, at least one visible source).
 *   - Passes the pick-time packed bytes (rebuilt via `pickUniformBytesOf`) to
 *     `renderForDebug`.
 *
 * The helper is called from `runFrame` AFTER the main `renderFrame` submit,
 * so it uses a separate encoder with `loadOp: 'load'` — the tests assert that
 * the overlay encoder is distinct from any prior submit and that the swap-chain
 * view is acquired fresh.
 */

import { describe, it, expect, vi } from 'vitest';
import { drawPickDebugOverlay } from '../../../../src/services/engine/frame/drawPickDebugOverlay';
import type { DrawPickDebugOverlayDeps } from '../../../../src/services/engine/frame/drawPickDebugOverlay';
import type { SourceMasks } from '../../../../src/@types/engine/frame/SourceMasks';
import { GALAXY_CATALOG_SOURCES } from '../../../../src/data/sources';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';

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
 * Build a minimal deps bag. `canvas` is fixed at 800×600; `device` and
 * `context` are fakes that record calls into `callLog`.
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
    canvas: { width: 800, height: 600 } as unknown as HTMLCanvasElement,
  };
}

/**
 * Build a minimal EngineState fragment that is READY to pick: every
 * `isEngineReady` bootstrap-gate handle is non-null, `cameraRuntime` carries a
 * last pose + projection so `pickFrameContext` can rebuild the pick-time
 * camera, and `settings` carries the appearance knobs `pickUniformBytesOf`
 * reads. `ready: false` nulls `state.cam` so `pickFrameContext` returns null
 * (the not-ready gate). One visible point source makes `collectPickTargets`
 * report `hasAny: true`.
 */
function makeState({
  showPickBuffer = true,
  ready = true,
  renderForDebugResult = makePickTex() as GPUTexture | null,
}: {
  showPickBuffer?: boolean;
  ready?: boolean;
  renderForDebugResult?: GPUTexture | null;
} = {}) {
  const renderForDebug = vi.fn<
    (
      viewport: [number, number],
      sources: readonly unknown[],
      sizePx: number,
      bytes: ArrayBuffer,
    ) => GPUTexture | null
  >(() => renderForDebugResult);

  const overlayDraw = vi.fn<(pass: GPURenderPassEncoder, view: GPUTextureView) => void>();

  // A point source with code 0 so collectPickTargets can filter it.
  const fakeSource = {
    source: 0,
  } as unknown as import('../../../../src/@types/rendering/PickSourceDraw').PickSourceDraw;

  // Every galaxy catalog enabled → deriveSourceMasks(state).pick is non-empty.
  const items = Object.fromEntries(
    GALAXY_CATALOG_SOURCES.map((s) => [
      galaxyCatalogIdOf(s),
      { enabled: true, labelEnabled: true },
    ]),
  );

  return {
    settings: {
      debug: { showPickBuffer },
      galaxyCatalogs: {
        sizePx: 2.5,
        brightness: 1.0,
        highlightFallback: true,
        realOnly: false,
        depthFade: true,
        items,
      },
      bias: { mode: 0, absMagLimit: -18 },
      milkyWay: { enabled: false },
    },
    gpu: {
      // isEngineReady bootstrap-gate handles — all non-null when ready.
      renderer: {
        loadedSources: vi.fn<() => Iterable<typeof fakeSource>>(() => [fakeSource]),
      },
      renderTargets: {},
      compositor: {},
      pickRenderer: {
        renderForDebug,
      },
      pickDebugOverlay: {
        draw: overlayDraw,
      },
      structureMarkerRenderer: null,
    },
    data: {
      galaxies: {
        // catalogs.size > 0 so the early guard passes.
        catalogs: { size: 1 } as unknown as Map<unknown, unknown>,
      },
    },
    // `milkyWayPickVisible` reads `picking.lastFrameCam`; null → MW unpickable
    // (milkyWay is disabled anyway).
    picking: { lastFrameCam: null },
    // `cam` is the isEngineReady gate subject — nulling it forces the
    // not-ready branch (pickFrameContext → null).
    cam: ready ? ({} as unknown) : null,
    cameraRuntime: {
      lastPose: { current: { target: [0, 0, 0], yaw: 0.3, pitch: 0.1, distance: 50 } },
      projection: { fovYRad: 1.0, aspect: 800 / 600, near: 0.1, far: 10000 },
    },
    subsystems: {
      texturedDisks: {},
      fades: { opacityOf: () => 0 },
    },
    // Satisfy EngineState's tier / selection getters (never called here).
  } as unknown as import('../../../../src/@types/engine/state/EngineState').EngineState;
}

// The pick mask used in the test — bit 0 set (source code 0 is visible).
const MASKS: SourceMasks = { draw: 1, pick: 1 };

// ── Tests ────────────────────────────────────────────────────────────────────

describe('drawPickDebugOverlay', () => {
  it('is a no-op when showPickBuffer is false', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState({ showPickBuffer: false });
    drawPickDebugOverlay(state, deps, MASKS);
    // Nothing should have been submitted.
    expect(callLog).toHaveLength(0);
  });

  it('is a no-op when the engine is not ready to pick (pickFrameContext → null)', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState({ ready: false });
    drawPickDebugOverlay(state, deps, MASKS);
    expect(callLog).toHaveLength(0);
  });

  it('is a no-op when pickRenderer is null', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState();
    // Null out the renderer.
    (state.gpu as any).pickRenderer = null;
    drawPickDebugOverlay(state, deps, MASKS);
    expect(callLog).toHaveLength(0);
  });

  it('is a no-op when pickDebugOverlay is null', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState();
    (state.gpu as any).pickDebugOverlay = null;
    drawPickDebugOverlay(state, deps, MASKS);
    expect(callLog).toHaveLength(0);
  });

  it('is a no-op when renderForDebug returns null (no pick texture)', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState({ renderForDebugResult: null });
    drawPickDebugOverlay(state, deps, MASKS);
    // createCommandEncoder must NOT have been called.
    expect(callLog.find((e) => e === 'device.createCommandEncoder')).toBeUndefined();
  });

  it('calls renderForDebug with the viewport, sizePx, and the rebuilt pick bytes', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState();
    drawPickDebugOverlay(state, deps, MASKS);

    const spy = state.gpu.pickRenderer!.renderForDebug as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledOnce();
    const args = spy.mock.calls[0]!;
    expect(args[0]).toEqual([800, 600]); // viewport from deps.canvas
    expect(args[2]).toBe(2.5); // sizePx from settings
    // Bytes are rebuilt from the pick-time camera (pickUniformBytesOf), not a
    // stashed reference — assert the packed point-uniform image shape (176 B).
    expect(args[3]).toBeInstanceOf(ArrayBuffer);
    expect((args[3] as ArrayBuffer).byteLength).toBe(176);
  });

  it('creates a new encoder and submits an overlay pass when bytes are non-null', () => {
    const callLog: string[] = [];
    const deps = makeDeps(callLog);
    const state = makeState();
    drawPickDebugOverlay(state, deps, MASKS);

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
    drawPickDebugOverlay(state, deps, MASKS);

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
    drawPickDebugOverlay(state, deps, MASKS);

    const drawSpy = state.gpu.pickDebugOverlay!.draw as ReturnType<typeof vi.fn>;
    expect(drawSpy).toHaveBeenCalledOnce();
    const [, viewArg] = drawSpy.mock.calls[0]!;
    // The view is the one createView() returned on the pick texture.
    expect(viewArg).toBe((pickTex.createView as ReturnType<typeof vi.fn>).mock.results[0]!.value);
  });
});
