/**
 * VolumeUniforms WESL↔renderer parity: `volumeFieldRenderer.ts` packs the struct by hand-literal
 * float index, so a field added or reordered in `io.wesl` would shift every later field
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
import type { GpuVolume } from '../../../../../src/@types/rendering/GpuVolume';
import type { VolumeFieldSettings } from '../../../../../src/@types/settings/VolumeFieldSettings';
import type { DetailRegionDraw } from '../../../../../src/@types/rendering/DetailRegionDraw';
import { weslStructLayout } from '../../../../helpers/wesl/weslStructLayout';

const SHADERS = join(process.cwd(), 'src/services/gpu/shaders/scalarVolume');
const io = readFileSync(join(SHADERS, 'io.wesl'), 'utf-8');

const VOLUME: GpuVolume = {
  texture: {
    createView: () => ({}),
    destroy: () => {},
  } as unknown as GPUTexture,
  placement: {
    dims: [4, 5, 6],
    frameKind: 'equatorial-cartesian',
    origin: [-101, -102, -103],
    voxelSize: 7,
    rotation: [0, 0, 0, 1],
  },
  gain: 417,
  nativeBox: { offset: [411, 412, 413], scale: [414, 415, 416] },
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
  const struct = weslStructLayout(io, 'VolumeUniforms', 'uniform');

  it('every field the WGSL struct declares lands at its offset', () => {
    const device = mockDevice();
    const renderer = createVolumeFieldRenderer({
      device,
      targetFormat: 'rgba16float',
      fadeBgl: {} as never,
      jitterMask: { createView: () => ({}) } as unknown as GPUTexture,
    });
    renderer.upload('field', VOLUME, {
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
      () => null,
      { jitterIndex: 409, steps: 410, weight: 1 },
    );

    const writes = vi.mocked(device.queue.writeBuffer).mock.calls;
    const uniformWrite = writes.find((call) => call[2] instanceof Float32Array);
    if (!uniformWrite) throw new Error('draw wrote no uniform scratch');
    const scratch = uniformWrite[2] as Float32Array;
    const model = buildCubeModelMatrix(VOLUME.placement);
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
      gain: [417],
      baseVoxelMpc: [7],
      nativeBoxOffset: [411, 412, 413],
      nativeBoxScale: [414, 415, 416],
    };
    for (const { name, type, offset } of struct.fields) {
      if (type === 'CameraUniforms' || name.startsWith('_pad')) continue;
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
    expect(struct.size).toBe(304);
    expect(buffers.calls[created]?.[0].size).toBe(struct.size);
    expect(scratch.byteLength).toBe(struct.size);
  });

  // A stage declaring its own copy would drift from the struct this test lays out.
  it.each(['vertex.wesl', 'fragment.wesl'])('%s takes VolumeUniforms from io.wesl', (file) => {
    const stage = readFileSync(join(SHADERS, file), 'utf-8');
    expect(stage).toMatch(/^import package::scalarVolume::io::VolumeUniforms;$/m);
    expect(stage).not.toMatch(/struct\s+VolumeUniforms\b/);
  });
});

describe('RegionUniforms layout', () => {
  const struct = weslStructLayout(io, 'RegionUniforms', 'uniform');

  it('every RegionUniforms field lands at its offset', () => {
    const device = mockDevice();
    const renderer = createVolumeFieldRenderer({
      device,
      targetFormat: 'rgba16float',
      fadeBgl: {} as never,
      jitterMask: { createView: () => ({}) } as unknown as GPUTexture,
    });
    renderer.upload('field', VOLUME, {
      paletteId: 'viridis',
      contrastCenter: 0,
      envelope: { inner: 2, outer: 2 },
    });
    renderer.attachRegion('field', {
      createView: () => ({}),
      destroy: () => {},
    } as unknown as GPUTexture);
    const regionBuffer = vi.mocked(device.createBuffer).mock.results.at(-1)?.value;
    const region: DetailRegionDraw = {
      settledLo: [501, 502, 503],
      settledHi: [504, 505, 506],
      texScale: [507, 508, 509],
      voxelMpc: 510,
      fade: {
        intoLo: [511, 512, 513],
        intoHi: [514, 515, 516],
        outLo: [517, 518, 519],
        outHi: [520, 521, 522],
        w: 523,
      },
    };
    renderer.draw(
      {
        setPipeline: vi.fn(),
        setVertexBuffer: vi.fn(),
        setIndexBuffer: vi.fn(),
        setBindGroup: vi.fn(),
        setBlendConstant: vi.fn(),
        drawIndexed: vi.fn(),
      } as unknown as GPURenderPassEncoder,
      new Float32Array(16) as unknown as Mat4,
      [320, 180],
      1000,
      [0, 0, 0],
      () => ({ enabled: true, intensity: 1, paletteId: 'viridis' }) as VolumeFieldSettings,
      () => 1,
      () => region,
      { jitterIndex: 0, steps: 1, weight: 1 },
    );

    const write = vi.mocked(device.queue.writeBuffer).mock.calls.find((c) => c[0] === regionBuffer);
    if (!write) throw new Error('draw wrote no region block');
    const scratch = write[2] as Float32Array;
    const fade = region.fade!;
    const sentinels: Record<string, ArrayLike<number>> = {
      settledLo: region.settledLo,
      voxelMpc: [region.voxelMpc],
      settledHi: region.settledHi,
      fadeW: [fade.w],
      texScale: region.texScale,
      intoLo: fade.intoLo,
      intoHi: fade.intoHi,
      outLo: fade.outLo,
      outHi: fade.outHi,
    };
    expect(struct.fields.map((f) => f.name)).toEqual(Object.keys(sentinels));
    for (const { name, offset } of struct.fields) {
      const expected = sentinels[name]!;
      const at = offset / 4;
      expect(Array.from(scratch.subarray(at, at + expected.length)), name).toEqual(
        Array.from(expected),
      );
    }

    const buffers = vi.mocked(device.createBuffer).mock;
    const created = buffers.results.findIndex((result) => result.value === regionBuffer);
    expect(struct.size).toBe(112);
    expect(buffers.calls[created]?.[0].size).toBe(struct.size);
    expect(scratch.byteLength).toBe(struct.size);
  });
});
