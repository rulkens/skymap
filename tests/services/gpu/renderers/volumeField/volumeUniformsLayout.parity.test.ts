/**
 * VolumeUniforms WESL↔renderer parity: `volumeFieldRenderer.ts` packs the struct by hand-literal
 * float index, so a field added or reordered in `fragment.wesl` would shift every later field
 * silently. This lays out the struct from the shader, drives the REAL `draw` with a distinct
 * sentinel per field, and asserts each lands where the struct says. The `cam` prefix is opaque here
 * (its own parity lives in `cameraUniforms.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { mat4, type Mat4 } from 'wgpu-matrix';
import { createVolumeFieldRenderer } from '../../../../../src/services/gpu/renderers/volumeField/volumeFieldRenderer';
import { buildCubeModelMatrix } from '../../../../../src/utils/math/buildCubeModelMatrix';
import type { ScalarCube } from '../../../../../src/@types/data/volume/ScalarCube';
import type { VolumeFieldSettings } from '../../../../../src/@types/settings/VolumeFieldSettings';
import { weslStructLayout } from '../../../../helpers/wesl/weslStructLayout';

const SHADERS = join(process.cwd(), 'src/services/gpu/shaders/scalarVolume');
const fragment = readFileSync(join(SHADERS, 'fragment.wesl'), 'utf-8');
const vertex = readFileSync(join(SHADERS, 'vertex.wesl'), 'utf-8');

const CUBE: ScalarCube = {
  dims: [4, 5, 6],
  channels: 1,
  voxels: new Uint16Array(4 * 5 * 6),
  frameKind: 'equatorial-cartesian',
  origin: [-101, -102, -103],
  voxelSize: 7,
  rotation: [0, 0, 0, 1],
  valueMin: 0,
  valueMax: 1,
};

function mockDevice(): GPUDevice {
  return {
    createTexture: vi.fn(() => ({ createView: vi.fn(() => ({})), destroy: vi.fn() })),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })),
    createSampler: vi.fn(() => ({})),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroupLayout: vi.fn(() => ({})),
    createPipelineLayout: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({})),
    createBindGroup: vi.fn(() => ({})),
    queue: { writeBuffer: vi.fn(), writeTexture: vi.fn() },
  } as unknown as GPUDevice;
}

describe('VolumeUniforms layout', () => {
  const struct = weslStructLayout(fragment, 'VolumeUniforms', 'uniform');

  it('every field the WGSL struct declares lands at its offset', () => {
    const device = mockDevice();
    const renderer = createVolumeFieldRenderer(device, 'rgba16float', {} as never);
    renderer.upload('field', CUBE, {
      paletteId: 'viridis',
      contrastCenter: 405,
      envelope: { inner: 406, outer: 407 },
    });
    const settings = {
      enabled: true,
      intensity: 401,
      densityScale: 402,
      contrast: 403,
      paletteId: 'viridis',
      trim: 404,
      exposure: 408,
    } as VolumeFieldSettings;
    const pass = {
      setPipeline: vi.fn(),
      setVertexBuffer: vi.fn(),
      setIndexBuffer: vi.fn(),
      setBindGroup: vi.fn(),
      setBlendConstant: vi.fn(),
      drawIndexed: vi.fn(),
    } as unknown as GPURenderPassEncoder;
    // Construction writes the cube corners as a Float32Array too.
    vi.mocked(device.queue.writeBuffer).mockClear();
    renderer.draw(
      pass,
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      1000,
      [301, 302, 303],
      () => settings,
      () => 1,
      { jitterIndex: 409, steps: 410, weight: 1 },
    );

    const writes = vi.mocked(device.queue.writeBuffer).mock.calls;
    const uniformWrite = writes.find((call) => call[2] instanceof Float32Array);
    if (!uniformWrite) throw new Error('draw wrote no uniform scratch');
    const scratch = uniformWrite[2] as Float32Array;
    const model = buildCubeModelMatrix(CUBE);
    const sentinels: Record<string, ArrayLike<number>> = {
      modelMatrix: model,
      invModelMatrix: mat4.inverse(model),
      cameraPosWorld: [301, 302, 303],
      intensity: [401],
      densityScale: [402],
      contrast: [403],
      trim: [404],
      contrastCenter: [405],
      envelopeInner: [406],
      envelopeOuter: [407],
      exposure: [408],
      jitterIndex: [409],
      steps: [410],
    };
    for (const { name, type, offset } of struct.fields) {
      if (type === 'CameraUniforms') continue;
      const expected = sentinels[name];
      if (!expected) throw new Error(`no sentinel for field '${name}'`);
      const at = offset / 4;
      expect(Array.from(scratch.subarray(at, at + expected.length)), name).toEqual(
        Array.from(expected, (v) => Math.fround(v)),
      );
    }

    // The scratch's buffer is the one draw wrote; its creation size is the binding's size.
    const buffers = vi.mocked(device.createBuffer).mock;
    const created = buffers.results.findIndex((result) => result.value === uniformWrite[0]);
    expect(struct.size).toBe(272);
    expect(buffers.calls[created]?.[0].size).toBe(struct.size);
    expect(scratch.byteLength).toBe(struct.size);
  });

  it("vertex.wesl's VolumeUniforms is a prefix of fragment.wesl's", () => {
    const prefix = weslStructLayout(vertex, 'VolumeUniforms', 'uniform').fields;
    expect(prefix.length).toBeGreaterThan(0);
    expect(prefix).toEqual(struct.fields.slice(0, prefix.length));
  });
});
