import { describe, it, expect, vi } from 'vitest';
import type { mat4 } from 'gl-matrix';
import { texturedImpostorsPass } from '../../../../../src/services/engine/frame/passes/texturedImpostorsPass';
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
    postProcess: { view: {} as GPUTextureView, draw: vi.fn(), resize: vi.fn(), destroy: vi.fn() } as any,
    thumbnails: { runFrame: vi.fn() } as any,
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

describe('texturedImpostorsPass', () => {
  it('is named "textured-impostors"', () => {
    expect(texturedImpostorsPass.name).toBe('textured-impostors');
  });

  it('enabled() returns false when both lastOutput arrays are empty', () => {
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks: [], quads: [] } } },
    } as unknown as EngineState;
    expect(texturedImpostorsPass.enabled(state, makeCtx(), makeSettings())).toBe(false);
  });

  it('enabled() returns true with a non-empty disks array', () => {
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks: [{}], quads: [] } } },
    } as unknown as EngineState;
    expect(texturedImpostorsPass.enabled(state, makeCtx(), makeSettings())).toBe(true);
  });

  it('draw() invokes texturedQuadRenderer first then texturedDiskRenderer', () => {
    const disks = [{ x: 1 }];
    const quads = [{ x: 2 }];
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks, quads } } },
    } as unknown as EngineState;
    const deps = makeDeps();
    texturedImpostorsPass.draw({} as GPURenderPassEncoder, makeCtx(), state, makeSettings(), deps);
    expect(deps.texturedQuadRenderer.draw).toHaveBeenCalledTimes(1);
    expect(deps.texturedDiskRenderer.draw).toHaveBeenCalledTimes(1);
    // Order: quads first, then disks (matches the legacy thumbnailSubsystem
    // dispatch order at lines 955-967).
    const quadOrder = (deps.texturedQuadRenderer.draw as any).mock.invocationCallOrder[0];
    const diskOrder = (deps.texturedDiskRenderer.draw as any).mock.invocationCallOrder[0];
    expect(quadOrder).toBeLessThan(diskOrder);
  });

  it('draw() skips quad call when quads array is empty', () => {
    const state = {
      subsystems: { texturedImpostors: { lastOutput: { disks: [{}], quads: [] } } },
    } as unknown as EngineState;
    const deps = makeDeps();
    texturedImpostorsPass.draw({} as GPURenderPassEncoder, makeCtx(), state, makeSettings(), deps);
    expect(deps.texturedQuadRenderer.draw).not.toHaveBeenCalled();
    expect(deps.texturedDiskRenderer.draw).toHaveBeenCalledTimes(1);
  });
});
