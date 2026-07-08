import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { proceduralDisksPass } from '../../../../../src/services/engine/frame/passes/proceduralDisksPass';
import type { PassDeps } from '../../../../../src/@types/engine/frame/PassDeps';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
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

function makeDeps(): PassDeps {
  return {
    texturedQuadRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    texturedDiskRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    proceduralDiskRenderer: { draw: vi.fn() } as any,
    filamentRenderer: null,
    volumeFieldRenderer: null,
    flowFieldRenderer: null,
    milkyWayCloudRenderer: { draw: vi.fn() } as any,
    horizonShellRenderer: { draw: vi.fn() } as any,
  } as PassDeps;
}

describe('proceduralDisksPass', () => {
  it('is named "procedural-disks"', () => {
    expect(proceduralDisksPass.name).toBe('procedural-disks');
  });

  it('enabled() returns false when subsystems.proceduralDisks is null', () => {
    const state = {
      subsystems: { proceduralDisks: null },
      settings: { thumbnails: { enabled: true } },
    } as unknown as EngineState;
    expect(proceduralDisksPass.enabled(state, makeCtx())).toBe(false);
  });

  it('enabled() returns false when state.settings.thumbnails.enabled is false', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [{}] } } },
      settings: { thumbnails: { enabled: false } },
    } as unknown as EngineState;
    expect(proceduralDisksPass.enabled(state, makeCtx())).toBe(false);
  });

  it('enabled() returns false when lastOutput.instances is empty', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [] } } },
      settings: { thumbnails: { enabled: true } },
    } as unknown as EngineState;
    expect(proceduralDisksPass.enabled(state, makeCtx())).toBe(false);
  });

  it('enabled() returns true with a non-empty lastOutput', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [{}] } } },
      settings: { thumbnails: { enabled: true } },
    } as unknown as EngineState;
    expect(proceduralDisksPass.enabled(state, makeCtx())).toBe(true);
  });

  it('draw() forwards instances to proceduralDiskRenderer.draw', () => {
    const instances = [{ x: 1 }, { x: 2 }];
    const focusBindGroup = {} as GPUBindGroup;
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances } } },
      gpu: { focusUniform: { bindGroup: focusBindGroup } },
    } as unknown as EngineState;
    const deps = makeDeps();
    const pass = {} as GPURenderPassEncoder;
    proceduralDisksPass.draw(pass, makeCtx(), state, deps);
    expect(deps.proceduralDiskRenderer.draw).toHaveBeenCalledTimes(1);
    const call = (deps.proceduralDiskRenderer.draw as any).mock.calls[0];
    // Args: (pass, vp, viewport, camPos, pxPerRad, focusBindGroup, instances).
    expect(call[5]).toBe(focusBindGroup);
    expect(call[6]).toBe(instances);
  });
});
