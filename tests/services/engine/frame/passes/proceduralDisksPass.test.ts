import { describe, it, expect, vi } from 'vitest';
import type { mat4 } from 'gl-matrix';
import { proceduralDisksPass } from '../../../../../src/services/engine/frame/passes/proceduralDisksPass';
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

function makeCtx(overrides: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
  const cam = makeCam();
  const vp = new Float32Array(16) as unknown as mat4;
  return {
    isReady: true,
    cam,
    vp,
    canvasSize: { width: 1280, height: 720 },
    drawCamPos: [0, 0, 5] as Readonly<[number, number, number]>,
    drawPxPerRad: 720 / (2 * Math.tan(cam.fovYRad / 2)),
    renderer: { draw: vi.fn() } as any,
    postProcess: { view: {} as GPUTextureView, draw: vi.fn(), resize: vi.fn(), destroy: vi.fn() } as any,
    thumbnails: { runFrame: vi.fn() } as any,
    ...overrides,
  };
}

function makeSettings(): RenderFrameSettings {
  return { galaxyTexturesEnabled: true } as RenderFrameSettings;
}

function makeDeps(): PassDeps {
  return {
    texturedQuadRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    texturedDiskRenderer: { draw: vi.fn(), bindAtlas: vi.fn() } as any,
    proceduralDiskRenderer: { draw: vi.fn() } as any,
    filamentRenderer: null,
    scalarVolumeRenderer: null,
    milkyWayRenderer: { draw: vi.fn() } as any,
    clouds: new Map(),
    famousMeta: [],
    famousXrefs: {},
    milkyWayITimeSec: 0,
  } as PassDeps;
}

describe('proceduralDisksPass', () => {
  it('is named "procedural-disks"', () => {
    expect(proceduralDisksPass.name).toBe('procedural-disks');
  });

  it('enabled() returns false when subsystems.proceduralDisks is null', () => {
    const state = { subsystems: { proceduralDisks: null } } as unknown as EngineState;
    expect(proceduralDisksPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('enabled() returns false when galaxyTexturesEnabled is false', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [{}] } } },
    } as unknown as EngineState;
    const settings = makeSettings();
    settings.galaxyTexturesEnabled = false;
    expect(proceduralDisksPass.enabled(state, makeCtx(), settings)).toBe(false);
  });

  it('enabled() returns false when lastOutput.instances is empty', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [] } } },
    } as unknown as EngineState;
    expect(proceduralDisksPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('enabled() returns true with a non-empty lastOutput', () => {
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances: [{}] } } },
    } as unknown as EngineState;
    expect(proceduralDisksPass.enabled(state, makeCtx(), makeSettings())).toBe(true);
  });

  it('draw() forwards instances to proceduralDiskRenderer.draw', () => {
    const instances = [{ x: 1 }, { x: 2 }];
    const state = {
      subsystems: { proceduralDisks: { lastOutput: { instances } } },
    } as unknown as EngineState;
    const deps = makeDeps();
    const pass = {} as GPURenderPassEncoder;
    proceduralDisksPass.draw(pass, makeCtx(), state, makeSettings(), deps);
    expect(deps.proceduralDiskRenderer.draw).toHaveBeenCalledTimes(1);
    const call = (deps.proceduralDiskRenderer.draw as any).mock.calls[0];
    expect(call[5]).toBe(instances);
  });
});
