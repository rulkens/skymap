import { describe, it, expect, vi } from 'vitest';
import type { mat4 } from 'gl-matrix';
import { texturedQuadsPass } from '../../../../../src/services/engine/frame/passes/texturedQuadsPass';
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
    renderer: { draw: vi.fn() } as any,
    postProcess: {
      view: {} as GPUTextureView,
      draw: vi.fn(),
      resize: vi.fn(),
      destroy: vi.fn(),
    } as any,
    volumeOffscreen: { view: {} as GPUTextureView, resize: vi.fn(), destroy: vi.fn() } as any,
    texturedImpostors: {
      runFrame: vi.fn(),
      lastOutput: { quads: [], disks: [] },
      hasInFlightWork: () => false,
    } as any,
  };
}

function makeSettings(overrides: Partial<RenderFrameSettings> = {}): RenderFrameSettings {
  return { galaxyTexturesEnabled: true, ...overrides } as RenderFrameSettings;
}

function makeDeps(): PassDeps {
  return {
    texturedQuadRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    texturedDiskRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    proceduralDiskRenderer: { draw: vi.fn() } as any,
    filamentRenderer: null,
    scalarVolumeRenderer: null,
    milkyWayRenderer: { draw: vi.fn() } as any,
    catalogs: new Map(),
    famousMeta: [],
    famousXrefs: {},
    milkyWayITimeSec: 0,
  } as PassDeps;
}

describe('texturedQuadsPass', () => {
  it('is named "textured-quads"', () => {
    expect(texturedQuadsPass.name).toBe('textured-quads');
  });

  it('enabled() returns false when galaxyTexturesEnabled is false', () => {
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks: [], quads: [{}] } } },
    } as unknown as EngineState;
    expect(
      texturedQuadsPass.enabled(state, makeCtx(), makeSettings({ galaxyTexturesEnabled: false })),
    ).toBe(false);
  });

  it('enabled() returns false when subsystem is null', () => {
    const state = { subsystems: { texturedImpostors: null } } as unknown as EngineState;
    expect(texturedQuadsPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('enabled() returns false when quads array is empty (even if disks has entries)', () => {
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks: [{}], quads: [] } } },
    } as unknown as EngineState;
    expect(texturedQuadsPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('enabled() returns true when quads array is non-empty', () => {
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks: [], quads: [{}] } } },
    } as unknown as EngineState;
    expect(texturedQuadsPass.enabled(state, makeCtx(), makeSettings())).toBe(true);
  });

  it('draw() invokes texturedQuadRenderer.draw and never texturedDiskRenderer.draw', () => {
    const quads = [{ x: 2 }];
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks: [{}], quads } } },
    } as unknown as EngineState;
    const deps = makeDeps();
    texturedQuadsPass.draw({} as GPURenderPassEncoder, makeCtx(), state, makeSettings(), deps);
    expect(deps.texturedQuadRenderer.draw).toHaveBeenCalledTimes(1);
    expect(deps.texturedDiskRenderer.draw).not.toHaveBeenCalled();
  });

  it('draw() is a no-op when quads array is empty', () => {
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks: [{}], quads: [] } } },
    } as unknown as EngineState;
    const deps = makeDeps();
    texturedQuadsPass.draw({} as GPURenderPassEncoder, makeCtx(), state, makeSettings(), deps);
    expect(deps.texturedQuadRenderer.draw).not.toHaveBeenCalled();
  });
});
