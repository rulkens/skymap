import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { texturedDisksLayer } from '../../../../../src/services/engine/frame/passes/texturedDisksLayer';
import { makeCosmoSlab } from '../../../../fixtures/makeCosmoSlab';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../../src/@types/camera/OrbitCamera';

function makeCam(): OrbitCamera {
  return {
    target: [0, 0, 0] as unknown as Float32Array,
    distance: 5,
    yaw: 0,
    pitch: 0,
    fovYRad: (60 * Math.PI) / 180,
    aspect: 16 / 9,
    near: 0.001,
    far: 10000,
    position: new Float32Array([0, 0, 5]),
  } as unknown as OrbitCamera;
}

function makeCtx(): ReadyFrameContext {
  const cam = makeCam();
  return {
    isReady: true,
    viewSlot: 0,
    renderedTargets: new Set<string>(),
    // Nothing in this file reads bodyPose.
    bodyPose: () => null,
    cam,
    vp: new Float32Array(16) as unknown as Mat4,
    slabs: [],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
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
    galaxyPointRenderer: { draw: vi.fn() } as any,
    renderTargets: { viewOf: vi.fn(() => ({}) as GPUTextureView) } as any,
    texturedDisks: {
      lastOutput: { disks: [] },
      hasInFlightWork: () => false,
    } as any,
  };
}

/** Minimal SlabView matching the ctx above — `vp`/`camPos`/`viewportPx` are
 * what `draw` forwards to the renderer; `slab` is unused by this layer. */
function makeView(ctx: ReadyFrameContext): SlabView {
  return {
    slab: makeCosmoSlab(),
    vp: ctx.vp as unknown as Float32Array,
    camPos: [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]],
    viewportPx: [ctx.canvasSize.width, ctx.canvasSize.height],
  };
}

function makeTexturedDiskRenderer() {
  return { draw: vi.fn(), bindAtlas: vi.fn() } as any;
}

describe('texturedDisksLayer', () => {
  it('enabled() returns false when state.settings.thumbnails.enabled is false', () => {
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks: [{}], quads: [] } } },
      settings: { thumbnails: { enabled: false } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(texturedDisksLayer.enabled(state, ctx, makeView(ctx))).toBe(false);
  });

  it('enabled() returns false when subsystem is null', () => {
    const state = {
      subsystems: { texturedDisks: null },
      settings: { thumbnails: { enabled: true } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(texturedDisksLayer.enabled(state, ctx, makeView(ctx))).toBe(false);
  });

  it('enabled() returns false when disks array is empty', () => {
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks: [] } } },
      settings: { thumbnails: { enabled: true } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(texturedDisksLayer.enabled(state, ctx, makeView(ctx))).toBe(false);
  });

  it('enabled() returns true when disks array is non-empty', () => {
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks: [{}] } } },
      settings: { thumbnails: { enabled: true } },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(texturedDisksLayer.enabled(state, ctx, makeView(ctx))).toBe(true);
  });

  it('draw() invokes state.gpu.texturedDiskRenderer.draw', () => {
    const disks = [{ x: 1 }];
    const texturedDiskRenderer = makeTexturedDiskRenderer();
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks } } },
      gpu: { focusUniform: { bindGroup: {} as GPUBindGroup }, texturedDiskRenderer },
    } as unknown as EngineState;
    const ctx = makeCtx();
    texturedDisksLayer.draw({} as GPURenderPassEncoder, makeView(ctx), ctx, state);
    expect(texturedDiskRenderer.draw).toHaveBeenCalledTimes(1);
  });

  it('draw() is a no-op when disks array is empty', () => {
    const texturedDiskRenderer = makeTexturedDiskRenderer();
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks: [] } } },
      gpu: { texturedDiskRenderer },
    } as unknown as EngineState;
    const ctx = makeCtx();
    texturedDisksLayer.draw({} as GPURenderPassEncoder, makeView(ctx), ctx, state);
    expect(texturedDiskRenderer.draw).not.toHaveBeenCalled();
  });

  it('draw() is a no-op when state.gpu.texturedDiskRenderer is null (pre-bootstrap)', () => {
    const disks = [{ x: 1 }];
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks } } },
      gpu: { focusUniform: { bindGroup: {} as GPUBindGroup }, texturedDiskRenderer: null },
    } as unknown as EngineState;
    const ctx = makeCtx();
    expect(() =>
      texturedDisksLayer.draw({} as GPURenderPassEncoder, makeView(ctx), ctx, state),
    ).not.toThrow();
  });

  // Sky-cubemap capture roster (Task 13b, Ruling 6): the textured famous-
  // galaxy thumbnails (LMC/SMC/M31 at close approach) were missing from the
  // captured "sky", so the black-hole lens quad covered the real, textured
  // originals with a capture that never had them.
  it('is flagged skyCapture: true', () => {
    expect(texturedDisksLayer.skyCapture).toBe(true);
  });

  it('draw() forwards ctx.viewSlot to texturedDiskRenderer.draw as the 7th arg', () => {
    const disks = [{ x: 1 }];
    const texturedDiskRenderer = makeTexturedDiskRenderer();
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks } } },
      gpu: { focusUniform: { bindGroup: {} as GPUBindGroup }, texturedDiskRenderer },
    } as unknown as EngineState;
    const ctx = { ...makeCtx(), viewSlot: 3 };
    texturedDisksLayer.draw({} as GPURenderPassEncoder, makeView(ctx), ctx, state);
    expect(texturedDiskRenderer.draw).toHaveBeenCalledTimes(1);
    const call = texturedDiskRenderer.draw.mock.calls[0]!;
    expect(call[6]).toBe(3);
  });
});
