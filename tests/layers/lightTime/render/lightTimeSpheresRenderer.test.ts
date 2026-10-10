import { describe, it, expect, vi } from 'vitest';

import { createLightTimeSpheresRenderer } from '../../../../src/layers/lightTime/render/lightTimeSpheresRenderer';
import { LIGHT_TIME_SPHERES } from '../../../../src/data/lightTime/lightTimeSpheres';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

// Float indices of the uniform block — `src/services/gpu/shaders/lightTime/io.wesl`, restated so a silent
// renderer-side shift fails here rather than on screen.
const COUNT = 11;
const RECT = 12;
const SLOT_0 = 16;
const SLOT_FLOATS = 8;

const CENTRE: Vec3 = [5e-6, -2e-6, 1e-6];
// yaw = pitch = 0 looks along −Z, so an eye at centre + (0, 0, d) faces the centre.
const CAM = { yaw: 0, pitch: 0, fovYRad: Math.PI / 3, aspect: 1 } as OrbitCamera;

/** Draws once and returns the uniform floats the renderer uploaded. */
function drawUniforms(camPos: Vec3, opacities: readonly number[]): Float32Array {
  const writeBuffer = vi.fn();
  const device = {
    createShaderModule: () => ({ getCompilationInfo: () => Promise.resolve({ messages: [] }) }),
    createBuffer: () => ({ destroy: vi.fn() }),
    createBindGroupLayout: () => ({}),
    createBindGroup: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipeline: () => ({}),
    queue: { writeBuffer },
  } as unknown as GPUDevice;
  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
  } as unknown as GPURenderPassEncoder;
  createLightTimeSpheresRenderer(device, 'rgba16float').draw(pass, CAM, camPos, [800, 800], {
    centre: CENTRE,
    opacities,
  });
  return writeBuffer.mock.calls[0]![2] as Float32Array;
}

const opacitiesWith = (entries: Record<number, number>) =>
  LIGHT_TIME_SPHERES.map((_, i) => entries[i] ?? 0);

describe('createLightTimeSpheresRenderer', () => {
  it('packs only visible spheres, in table order, with c = |ro|² − 1 and the count', () => {
    const second = LIGHT_TIME_SPHERES[0]!.radiusMpc;
    const hour = LIGHT_TIME_SPHERES[2]!.radiusMpc;
    const eyeDist = 5 * hour;
    const u = drawUniforms(
      [CENTRE[0], CENTRE[1], CENTRE[2] + eyeDist],
      opacitiesWith({ 0: 0.25, 2: 0.5 }),
    );

    expect(u[COUNT]).toBe(2);
    // Slot 0 is the light-second (row 0), slot 1 the light-hour (row 2): row 1 is skipped.
    const roSecond = eyeDist / second;
    expect(u[SLOT_0 + 2]! / roSecond).toBeCloseTo(1, 5);
    expect(u[SLOT_0 + 3]).toBe(0.25);
    expect(u[SLOT_0 + 4]! / (roSecond * roSecond - 1)).toBeCloseTo(1, 5);
    expect(u[SLOT_0 + SLOT_FLOATS + 2]).toBeCloseTo(5, 4);
    expect(u[SLOT_0 + SLOT_FLOATS + 3]).toBe(0.5);
    expect(u[SLOT_0 + SLOT_FLOATS + 4]).toBeCloseTo(24, 3);
  });

  it('bounds the rect below full screen when the camera is outside the largest visible sphere', () => {
    const hour = LIGHT_TIME_SPHERES[2]!.radiusMpc;
    const outside = drawUniforms(
      [CENTRE[0], CENTRE[1], CENTRE[2] + 5 * hour],
      opacitiesWith({ 2: 1 }),
    );
    expect(outside[RECT + 2]).toBeLessThan(1);
  });
});
