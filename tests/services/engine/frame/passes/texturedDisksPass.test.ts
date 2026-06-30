import { describe, it, expect, vi } from 'vitest';
import type { Mat4 } from 'wgpu-matrix';
import { texturedDisksPass } from '../../../../../src/services/engine/frame/passes/texturedDisksPass';
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

function makeCtx(): ReadyFrameContext {
  const cam = makeCam();
  return {
    isReady: true,
    cam,
    vp: new Float32Array(16) as unknown as Mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
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
      lastOutput: { disks: [] },
      hasInFlightWork: () => false,
    } as any,
    foregroundVp: new Float64Array(16),
    foregroundNear: 0.001,
    foregroundFar: 1000,
    renderOrigin: [0, 0, 0],
  };
}

function makeDeps(): PassDeps {
  return {
    texturedDiskRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    proceduralDiskRenderer: { draw: vi.fn() } as any,
    filamentRenderer: null,
    volumeFieldRenderer: null,
    flowFieldRenderer: null,
    milkyWayRenderer: { draw: vi.fn() } as any,
    horizonShellRenderer: { draw: vi.fn() } as any,
    milkyWayITimeSec: 0,
  } as PassDeps;
}

describe('texturedDisksPass', () => {
  it('is named "textured-disks"', () => {
    expect(texturedDisksPass.name).toBe('textured-disks');
  });

  it('enabled() returns false when state.settings.thumbnails.enabled is false', () => {
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks: [{}], quads: [] } } },
      settings: { thumbnails: { enabled: false } },
    } as unknown as EngineState;
    expect(texturedDisksPass.enabled(state, makeCtx())).toBe(false);
  });

  it('enabled() returns false when subsystem is null', () => {
    const state = {
      subsystems: { texturedDisks: null },
      settings: { thumbnails: { enabled: true } },
    } as unknown as EngineState;
    expect(texturedDisksPass.enabled(state, makeCtx())).toBe(false);
  });

  it('enabled() returns false when disks array is empty', () => {
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks: [] } } },
      settings: { thumbnails: { enabled: true } },
    } as unknown as EngineState;
    expect(texturedDisksPass.enabled(state, makeCtx())).toBe(false);
  });

  it('enabled() returns true when disks array is non-empty', () => {
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks: [{}] } } },
      settings: { thumbnails: { enabled: true } },
    } as unknown as EngineState;
    expect(texturedDisksPass.enabled(state, makeCtx())).toBe(true);
  });

  it('draw() invokes texturedDiskRenderer.draw', () => {
    const disks = [{ x: 1 }];
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks } } },
      gpu: { focusUniform: { bindGroup: {} as GPUBindGroup } },
    } as unknown as EngineState;
    const deps = makeDeps();
    texturedDisksPass.draw({} as GPURenderPassEncoder, makeCtx(), state, deps);
    expect(deps.texturedDiskRenderer.draw).toHaveBeenCalledTimes(1);
  });

  it('draw() is a no-op when disks array is empty', () => {
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks: [] } } },
    } as unknown as EngineState;
    const deps = makeDeps();
    texturedDisksPass.draw({} as GPURenderPassEncoder, makeCtx(), state, deps);
    expect(deps.texturedDiskRenderer.draw).not.toHaveBeenCalled();
  });
});
