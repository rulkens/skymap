import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { proceduralDisksLayer } from '../../../../../src/services/engine/frame/passes/proceduralDisksLayer';
import { COSMO } from '../../../../../src/services/engine/frame/slabs';
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

function makeCtx(overrides: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  const cam = makeCam();
  const vp = new Float32Array(16) as unknown as Mat4;
  return {
    isReady: true,
    cam,
    vp,
    slabs: [],
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    nowMs: 0,
    fovYRad: (60 * Math.PI) / 180,
    focusBlend: 0,
    visibleSourceMask: 0xffffffff,
    focus: {
      center: [0, 0, 0] as Readonly<[number, number, number]>,
      apparentRadiusMpc: 1,
      physicalRadiusMpc: 0,
      blend: 0,
    },
    renderer: { draw: vi.fn() } as any,
    postProcess: {
      view: {} as GPUTextureView,
      draw: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
    } as any,
    volumeOffscreen: { view: {} as GPUTextureView, resize: vi.fn(), destroy: vi.fn() } as any,
    texturedDisks: {
      runFrame: vi.fn(),
      lastOutput: { quads: [], disks: [] },
      hasInFlightWork: () => false,
    } as any,
    ...overrides,
  };
}

/** Minimal SlabView matching the ctx above. `slab` is unused by this layer. */
function makeView(ctx: ReadyFrameContext): SlabView {
  return {
    slab: { index: COSMO, nearMpc: 0.01, farMpc: 50000, vp: new Float64Array(16), originRelative: false, precision: 'f32' },
    vp: ctx.vp as unknown as Float32Array,
    camPos: [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]],
    viewportPx: [ctx.canvasSize.width, ctx.canvasSize.height],
  };
}

function makeProceduralDiskRenderer() {
  return { draw: vi.fn() } as any;
}

describe('proceduralDisksLayer', () => {
  it('is named "procedural-disks"', () => {
    expect(proceduralDisksLayer.name).toBe('procedural-disks');
  });

  it('carries the hdr/additive/cosmological migration-table fields', () => {
    expect(proceduralDisksLayer.slab).toBe(COSMO);
    expect(proceduralDisksLayer.target).toBe('hdr');
    expect(proceduralDisksLayer.blend).toBe('additive');
  });

  it('enabled() returns false when subsystems.proceduralDisks is null', () => {
    const state = {
      subsystems: { proceduralDisks: null },
      settings: { thumbnails: { enabled: true } },
    } as unknown as EngineState;
    expect(proceduralDisksLayer.enabled(state, makeCtx())).toBe(false);
  });

  it('enabled() returns false when state.settings.thumbnails.enabled is false', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [{}] } } },
      settings: { thumbnails: { enabled: false } },
    } as unknown as EngineState;
    expect(proceduralDisksLayer.enabled(state, makeCtx())).toBe(false);
  });

  it('enabled() returns false when lastOutput.instances is empty', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [] } } },
      settings: { thumbnails: { enabled: true } },
    } as unknown as EngineState;
    expect(proceduralDisksLayer.enabled(state, makeCtx())).toBe(false);
  });

  it('enabled() returns true with a non-empty lastOutput', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [{}] } } },
      settings: { thumbnails: { enabled: true } },
    } as unknown as EngineState;
    expect(proceduralDisksLayer.enabled(state, makeCtx())).toBe(true);
  });

  it('draw() forwards instances to state.gpu.proceduralDiskRenderer.draw', () => {
    const instances = [{ x: 1 }, { x: 2 }];
    const focusBindGroup = {} as GPUBindGroup;
    const proceduralDiskRenderer = makeProceduralDiskRenderer();
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances } } },
      gpu: { focusUniform: { bindGroup: focusBindGroup }, proceduralDiskRenderer },
    } as unknown as EngineState;
    const pass = {} as GPURenderPassEncoder;
    const ctx = makeCtx();
    proceduralDisksLayer.draw(pass, makeView(ctx), ctx, state);
    expect(proceduralDiskRenderer.draw).toHaveBeenCalledTimes(1);
    const call = (proceduralDiskRenderer.draw as any).mock.calls[0];
    // Args: (pass, vp, viewport, camPos, pxPerRad, focusBindGroup, instances).
    expect(call[5]).toBe(focusBindGroup);
    expect(call[6]).toBe(instances);
  });

  it('draw() is a no-op when state.gpu.proceduralDiskRenderer is null (pre-bootstrap)', () => {
    const instances = [{ x: 1 }];
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances } } },
      gpu: { focusUniform: { bindGroup: {} as GPUBindGroup }, proceduralDiskRenderer: null },
    } as unknown as EngineState;
    const pass = {} as GPURenderPassEncoder;
    const ctx = makeCtx();
    expect(() => proceduralDisksLayer.draw(pass, makeView(ctx), ctx, state)).not.toThrow();
  });
});
