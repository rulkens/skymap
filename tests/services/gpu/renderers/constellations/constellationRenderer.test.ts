import { describe, it, expect, vi } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import {
  createConstellationRenderer,
  CONSTELLATION_UNIFORM_BYTES,
  CONSTELLATION_HALFWIDTH_F32,
  CONSTELLATION_INTENSITY_F32,
  CONSTELLATION_COLOR_F32,
} from '../../../../../src/services/gpu/renderers/constellations/constellationRenderer';
import {
  writeCameraPrefix,
  CAMERA_UNIFORM_BYTES,
} from '../../../../../src/services/gpu/lib/cameraUniforms';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import type { ConstellationsArtifact } from '../../../../../src/@types/loading/ConstellationsArtifact';
import type { FadeUniformsBgl } from '../../../../../src/@types/rendering/FadeUniformsBgl';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/** Minimal GPUDevice mock — same shape as the filamentRenderer test. */
function mockDevice(renderPipelines?: GPURenderPipelineDescriptor[]): GPUDevice {
  return {
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn((desc: GPURenderPipelineDescriptor) => {
      renderPipelines?.push(desc);
      return { getBindGroupLayout: vi.fn(() => ({})) };
    }),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn() },
  } as unknown as GPUDevice;
}

const mockFadeBgl = {} as unknown as FadeUniformsBgl;

function oneSegmentArtifact(): ConstellationsArtifact {
  return {
    version: 1,
    constellations: [
      {
        name: 'Test',
        labelAnchorPc: [0, 0, 0],
        segments: [{ aPc: [1, 2, 3], aAppMag: 0.5, bPc: [4, 5, 6], bAppMag: 1.5 }],
      },
    ],
  };
}

describe('createConstellationRenderer.hasData', () => {
  it('is false before upload, true after a non-empty artifact', () => {
    const renderer = createConstellationRenderer(mockDevice(), 'rgba16float', mockFadeBgl);
    expect(renderer.hasData()).toBe(false);
    renderer.upload(oneSegmentArtifact());
    expect(renderer.hasData()).toBe(true);
  });

  it('stays false when the uploaded artifact has zero segments', () => {
    const renderer = createConstellationRenderer(mockDevice(), 'rgba16float', mockFadeBgl);
    renderer.upload({ version: 1, constellations: [] });
    expect(renderer.hasData()).toBe(false);
  });

  it('bakes the given targetFormat into the pipeline colour target', () => {
    const pipelines: GPURenderPipelineDescriptor[] = [];
    createConstellationRenderer(mockDevice(pipelines), 'rgba16float', mockFadeBgl);
    expect(pipelines).toHaveLength(1);
    const target = Array.from(pipelines[0]!.fragment!.targets!)[0]!;
    expect(target!.format).toBe('rgba16float');
  });
});

/**
 * The precision seam (Item 4): `draw` re-expresses each cached ABSOLUTE endpoint
 * camera-relative (`pos − camPos`) into the instance buffer every frame, pairing
 * with the caller's f64-rebased vp — the `starPointsLayer` fix that kills the
 * close-approach cancellation. This pins that the per-frame instance write is the
 * absolute endpoints minus camPos, with the apparent-magnitude slots passed
 * through untouched.
 */
describe('createConstellationRenderer.draw camera-relative write', () => {
  it('uploads endpoints as (absolute − camPos) with magnitudes untouched', () => {
    const writeBuffer = vi.fn();
    const device = {
      createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
      createShaderModule: vi.fn(() => ({
        getCompilationInfo: () => Promise.resolve({ messages: [] }),
      })),
      createBindGroupLayout: vi.fn(() => ({})),
      createPipelineLayout: vi.fn(() => ({})),
      createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: vi.fn(() => ({})) })),
      createBindGroup: vi.fn(() => ({})),
      queue: { writeBuffer },
    } as unknown as GPUDevice;

    const renderer = createConstellationRenderer(device, 'rgba16float', mockFadeBgl);
    renderer.upload(oneSegmentArtifact()); // aPc [1,2,3] mag 0.5, bPc [4,5,6] mag 1.5

    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setIndexBuffer: vi.fn(),
      setVertexBuffer: vi.fn(),
      drawIndexed: vi.fn(),
    } as unknown as GPURenderPassEncoder;

    const PC = SCALE_UNITS.PC_TO_MPC;
    const camPos: Vec3 = [0.5 * PC, 1 * PC, 1.5 * PC];
    writeBuffer.mockClear();
    renderer.draw(
      pass,
      mat4.identity() as Float32Array,
      [1920, 1080],
      0.9,
      1,
      1,
      camPos,
      [0.42, 0.58, 0.9],
    );

    // The instance write is the only writeBuffer whose payload is a Float32Array
    // (uniform + fade writes hand ArrayBuffers).
    const instanceWrite = writeBuffer.mock.calls.find((c) => c[2] instanceof Float32Array);
    expect(instanceWrite).toBeDefined();
    const data = instanceWrite![2] as Float32Array;
    // aWorld = aPc·PC − camPos; magnitudes pass through.
    expect(data[0]).toBeCloseTo(1 * PC - camPos[0], 12);
    expect(data[1]).toBeCloseTo(2 * PC - camPos[1], 12);
    expect(data[2]).toBeCloseTo(3 * PC - camPos[2], 12);
    expect(data[3]).toBe(Math.fround(0.5));
    // bWorld = bPc·PC − camPos.
    expect(data[4]).toBeCloseTo(4 * PC - camPos[0], 12);
    expect(data[5]).toBeCloseTo(5 * PC - camPos[1], 12);
    expect(data[6]).toBeCloseTo(6 * PC - camPos[2], 12);
    expect(data[7]).toBe(Math.fround(1.5));
  });
});

/**
 * Uniform byte-layout parity with `shaders/constellations/io.wesl`'s `Uniforms`
 * struct: the two scalar params must sit immediately AFTER the shared 80-byte
 * CameraUniforms prefix (halfWidthPx at byte 80, intensity at 84), and the whole
 * struct must round up to a 16-byte multiple. Drift here is invisible until the
 * GPU reads the wrong offset (or iOS drops the frame) — the WGSL/TS parity
 * keep-rule. Tied to the shared `CAMERA_UNIFORM_BYTES` so a change to the prefix
 * size is caught, not restated.
 */
describe('constellation uniform layout parity', () => {
  it('places halfWidthPx + intensity right after the camera prefix, in a 16-aligned struct', () => {
    expect(CONSTELLATION_HALFWIDTH_F32 * 4).toBe(CAMERA_UNIFORM_BYTES); // byte 80
    expect(CONSTELLATION_INTENSITY_F32 * 4).toBe(CAMERA_UNIFORM_BYTES + 4); // byte 84
    expect(CONSTELLATION_UNIFORM_BYTES % 16).toBe(0);
    expect(CONSTELLATION_UNIFORM_BYTES).toBeGreaterThanOrEqual(CAMERA_UNIFORM_BYTES + 8);
  });

  it('aligns the lineColor vec3 to a 16-byte boundary that fits inside the struct', () => {
    // vec3<f32> requires 16-byte alignment; the WGSL struct places it at byte 96,
    // so a misaligned f32-index here would make the GPU read the wrong lanes.
    expect((CONSTELLATION_COLOR_F32 * 4) % 16).toBe(0);
    expect(CONSTELLATION_COLOR_F32 * 4 + 12).toBeLessThanOrEqual(CONSTELLATION_UNIFORM_BYTES);
  });

  it('the camera prefix write never collides with the scalar slots', () => {
    const buf = new ArrayBuffer(CONSTELLATION_UNIFORM_BYTES);
    const f32 = new Float32Array(buf);
    writeCameraPrefix(f32, mat4.identity() as Float32Array, [1920, 1080]);
    f32[CONSTELLATION_HALFWIDTH_F32] = 0.9;
    f32[CONSTELLATION_INTENSITY_F32] = 0.7;
    // viewportPx (prefix) still intact at floats 16/17 — the scalar writes landed
    // past it, not on it.
    expect(f32[16]).toBe(1920);
    expect(f32[17]).toBe(1080);
    expect(f32[CONSTELLATION_HALFWIDTH_F32]).toBe(Math.fround(0.9));
    expect(f32[CONSTELLATION_INTENSITY_F32]).toBe(Math.fround(0.7));
  });
});
