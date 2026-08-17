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
    renderedTargets: new Set<string>(),
    cam,
    vp,
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
      lastOutput: { quads: [], disks: [] },
      hasInFlightWork: () => false,
    } as any,
    ...overrides,
  };
}

/** Minimal SlabView matching the ctx above. `slab` is unused by this layer. */
function makeView(ctx: ReadyFrameContext): SlabView {
  return {
    slab: {
      index: COSMO,
      nearMpc: 0.01,
      farMpc: 50000,
      vp: new Float64Array(16),
      originRelative: false,
      precision: 'f32',
      reversedZ: false,
    },
    vp: ctx.vp as unknown as Float32Array,
    camPos: [ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2]],
    viewportPx: [ctx.canvasSize.width, ctx.canvasSize.height],
  };
}

function makeProceduralDiskRenderer() {
  return { draw: vi.fn() } as any;
}

describe('proceduralDisksLayer', () => {
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

  it('drawPick() restores the @group(0) camera prefix AFTER pickDisks', () => {
    // pickDisks binds the disk camera at slot 0; the Milky-Way + structure
    // rows drawn after this one read the shared point-pick camera prefix, so
    // drawPick must call pickRenderer.bindCamera(pass) to put it back —
    // ordered strictly after the disk pick. (See ContentLayer.drawPick's
    // postcondition.)
    const callLog: string[] = [];
    const proceduralDiskRenderer = {
      pickDisks: vi.fn(() => callLog.push('pickDisks')),
    };
    const pickRenderer = {
      bindCamera: vi.fn(() => callLog.push('bindCamera')),
    };
    const state = {
      gpu: {
        focusUniform: { bindGroup: {} as GPUBindGroup },
        proceduralDiskRenderer,
        pickRenderer,
      },
    } as unknown as EngineState;
    const pass = {} as GPURenderPassEncoder;
    const ctx = makeCtx();
    proceduralDisksLayer.drawPick!(pass, makeView(ctx), ctx, state);

    expect(proceduralDiskRenderer.pickDisks).toHaveBeenCalledTimes(1);
    expect(pickRenderer.bindCamera).toHaveBeenCalledTimes(1);
    expect(pickRenderer.bindCamera).toHaveBeenCalledWith(pass);
    // Restore lands AFTER the disk pick, never before.
    expect(callLog).toEqual(['pickDisks', 'bindCamera']);
  });

  it('drawPick() is a no-op when state.gpu.proceduralDiskRenderer is null', () => {
    const state = {
      gpu: {
        focusUniform: { bindGroup: {} as GPUBindGroup },
        proceduralDiskRenderer: null,
        pickRenderer: { bindCamera: vi.fn() },
      },
    } as unknown as EngineState;
    const pass = {} as GPURenderPassEncoder;
    const ctx = makeCtx();
    expect(() => proceduralDisksLayer.drawPick!(pass, makeView(ctx), ctx, state)).not.toThrow();
    // Null disk renderer → early return before the restore.
    const bindCamera = (
      state.gpu.pickRenderer as unknown as { bindCamera: ReturnType<typeof vi.fn> }
    ).bindCamera;
    expect(bindCamera).not.toHaveBeenCalled();
  });
});
