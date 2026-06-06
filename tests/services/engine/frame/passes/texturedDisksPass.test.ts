import { describe, it, expect, vi } from 'vitest';
import type { mat4 } from 'gl-matrix';
import { texturedDisksPass } from '../../../../../src/services/engine/frame/passes/texturedDisksPass';
import type { PassDeps } from '../../../../../src/@types/engine/frame/PassDeps';
import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { RenderFrameSettings } from '../../../../../src/@types/engine/frame/RenderFrameSettings';
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
    vp: new Float32Array(16) as unknown as mat4,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    focusBlend: 0,
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
  };
}

function makeSettings(overrides: Partial<RenderFrameSettings> = {}): RenderFrameSettings {
  return { galaxyTexturesEnabled: true, ...overrides } as RenderFrameSettings;
}

function makeDeps(): PassDeps {
  return {
    texturedDiskRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    proceduralDiskRenderer: { draw: vi.fn() } as any,
    filamentRenderer: null,
    scalarVolumeRenderer: null,
    milkyWayRenderer: { draw: vi.fn() } as any,
    horizonShellRenderer: { draw: vi.fn() } as any,
    catalogs: new Map(),
    famousMeta: [],
    milkyWayITimeSec: 0,
  } as PassDeps;
}

describe('texturedDisksPass', () => {
  it('is named "textured-disks"', () => {
    expect(texturedDisksPass.name).toBe('textured-disks');
  });

  it('enabled() returns false when galaxyTexturesEnabled is false', () => {
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks: [{}], quads: [] } } },
    } as unknown as EngineState;
    expect(
      texturedDisksPass.enabled(state, makeCtx(), makeSettings({ galaxyTexturesEnabled: false })),
    ).toBe(false);
  });

  it('enabled() returns false when subsystem is null', () => {
    const state = { subsystems: { texturedDisks: null } } as unknown as EngineState;
    expect(texturedDisksPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('enabled() returns false when disks array is empty', () => {
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks: [] } } },
    } as unknown as EngineState;
    expect(texturedDisksPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('enabled() returns true when disks array is non-empty', () => {
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks: [{}] } } },
    } as unknown as EngineState;
    expect(texturedDisksPass.enabled(state, makeCtx(), makeSettings())).toBe(true);
  });

  it('draw() invokes texturedDiskRenderer.draw', () => {
    const disks = [{ x: 1 }];
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks } } },
      gpu: { focusUniform: { bindGroup: {} as GPUBindGroup } },
    } as unknown as EngineState;
    const deps = makeDeps();
    texturedDisksPass.draw({} as GPURenderPassEncoder, makeCtx(), state, makeSettings(), deps);
    expect(deps.texturedDiskRenderer.draw).toHaveBeenCalledTimes(1);
  });

  it('draw() is a no-op when disks array is empty', () => {
    const state = {
      subsystems: { texturedDisks: { lastOutput: { disks: [] } } },
    } as unknown as EngineState;
    const deps = makeDeps();
    texturedDisksPass.draw({} as GPURenderPassEncoder, makeCtx(), state, makeSettings(), deps);
    expect(deps.texturedDiskRenderer.draw).not.toHaveBeenCalled();
  });
});
