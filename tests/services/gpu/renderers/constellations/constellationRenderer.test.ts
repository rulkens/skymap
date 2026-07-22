import { describe, it, expect, vi } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import {
  createConstellationRenderer,
  CONSTELLATION_UNIFORM_BYTES,
  CONSTELLATION_HALFWIDTH_F32,
  CONSTELLATION_INTENSITY_F32,
} from '../../../../../src/services/gpu/renderers/constellations/constellationRenderer';
import { writeCameraPrefix, CAMERA_UNIFORM_BYTES } from '../../../../../src/services/gpu/lib/cameraUniforms';
import type { ConstellationsArtifact } from '../../../../../src/@types/loading/ConstellationsArtifact';
import type { FadeUniformsBgl } from '../../../../../src/@types/rendering/FadeUniformsBgl';

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
