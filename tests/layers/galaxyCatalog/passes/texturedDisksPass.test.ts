import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { texturedDisksPass } from '../../../../src/layers/galaxyCatalog/passes/texturedDisksPass';
import { makeCosmoSlab } from '../../../fixtures/makeCosmoSlab';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { SlabView } from '../../../../src/@types/engine/frame/SlabView';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';

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

function makeCtx(): FrameView {
  const cam = makeCam();
  return {
    snapshot: {
      isReady: true,
      nowMs: 0,
      simDays: 0,
      focusBlend: 0,
      visibleSourceMask: 0xffffffff,
      focus: {
        center: [0, 0, 0] as Readonly<[number, number, number]>,
        apparentRadiusMpc: 1,
        physicalRadiusMpc: 0,
        blend: 0,
      },
      renderTargets: { viewOf: vi.fn(() => ({}) as GPUTextureView) } as any,
      cursorTexPx: null,
      renderedTargets: new Set<string>(),
    },
    viewSlot: 0,
    viewKind: 'frame',
    // Nothing in this file reads bodyPose.
    bodyPose: () => null,
    cam,
    vp: new Float32Array(16) as unknown as Mat4,
    slabs: [],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
  } as unknown as FrameView;
}

/** Minimal SlabView matching the ctx above — `vp`/`camPos`/`viewportPx` are
 * what `draw` forwards to the renderer; `slab` is unused by this layer. */
function makeView(ctx: FrameView): SlabView {
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

describe('texturedDisksPass', () => {
  it('enabled() returns false when state.settings.thumbnails.enabled is false', () => {
    const state = { settings: { thumbnails: { enabled: false } } } as unknown as EngineState;
    const runtime = { texturedDisks: { lastOutput: { disks: [{}], quads: [] } } } as never;
    const ctx = makeCtx();
    expect(texturedDisksPass(runtime).enabled(state, ctx, makeView(ctx))).toBe(false);
  });

  it('enabled() returns true when disks array is non-empty', () => {
    const state = { settings: { thumbnails: { enabled: true } } } as unknown as EngineState;
    const runtime = { texturedDisks: { lastOutput: { disks: [{}] } } } as never;
    const ctx = makeCtx();
    expect(texturedDisksPass(runtime).enabled(state, ctx, makeView(ctx))).toBe(true);
  });

  it('draw() forwards ctx.viewSlot to texturedDiskRenderer.draw as the 7th arg', () => {
    const disks = [{ x: 1 }];
    const texturedDiskRenderer = makeTexturedDiskRenderer();
    const state = {
      gpu: { focusUniform: { bindGroup: {} as GPUBindGroup } },
    } as unknown as EngineState;
    const runtime = { texturedDisks: { lastOutput: { disks } }, texturedDiskRenderer } as never;
    const ctx = { ...makeCtx(), viewSlot: 3 };
    texturedDisksPass(runtime).draw({} as GPURenderPassEncoder, makeView(ctx), ctx, state);
    expect(texturedDiskRenderer.draw).toHaveBeenCalledTimes(1);
    const call = texturedDiskRenderer.draw.mock.calls[0]!;
    expect(call[6]).toBe(3);
  });
});
