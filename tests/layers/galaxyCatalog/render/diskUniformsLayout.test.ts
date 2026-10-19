/**
 * `instancedQuadRenderer` packs one `@group(0)` image for both disk pipelines; each io.wesl
 * declares its own `Uniforms`, so both must place the boost where the packer writes it, and the
 * packer must write it there.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createInstancedQuadRenderer,
  FLOATS_PER_INSTANCE,
  UNIFORM_BYTES,
} from '../../../../src/layers/galaxyCatalog/render/instancedQuadRenderer';
import type { FocusUniformsBgl } from '../../../../src/@types/rendering/FocusUniformsBgl';
import { layoutWgslStruct } from '../../../../tools/utils/wgsl/layoutWgslStruct';
import { parseWgslStructFields } from '../../../../tools/utils/wgsl/parseWgslStructFields';
import { readShaderSource } from '../../../../tools/utils/wgsl/readShaderSource';
import { wgslPrimitiveLayout } from '../../../../tools/utils/wgsl/wgslPrimitiveLayout';

const layoutOf = (path: string, name: string): ReturnType<typeof layoutWgslStruct> =>
  layoutWgslStruct(parseWgslStructFields(readShaderSource(path), name), (t) =>
    t === 'CameraUniforms'
      ? layoutOf('src/services/gpu/shaders/lib/camera.wesl', t).layout
      : t === 'BoostUniforms'
        ? layoutOf('src/services/gpu/shaders/lib/boost.wesl', t).layout
        : wgslPrimitiveLayout(t)!,
  );

describe('disk Uniforms ↔ instancedQuadRenderer layout', () => {
  it.each(['proceduralDisks', 'texturedDisks'])(
    '%s/io.wesl puts the boost at float 24 and is UNIFORM_BYTES long',
    (family) => {
      const u = layoutOf(`src/services/gpu/shaders/galaxyCatalog/${family}/io.wesl`, 'Uniforms');
      expect(u.offsets.get('boost')).toBe(24 * 4);
      expect(u.layout.size).toBe(UNIFORM_BYTES);
    },
  );

  it('the packer writes the boost at float 24', () => {
    const writeBuffer = vi.fn();
    const device = {
      createShaderModule: () => ({ getCompilationInfo: async () => ({ messages: [] }) }),
      createRenderPipeline: () => ({}),
      createPipelineLayout: () => ({}),
      createBindGroupLayout: () => ({}),
      createBuffer: () => ({ destroy: () => {} }),
      createBindGroup: () => ({}),
      queue: { writeBuffer },
    } as unknown as GPUDevice;
    const renderer = createInstancedQuadRenderer(device, {
      focusBgl: {} as unknown as FocusUniformsBgl,
      label: 'disk',
      vertexSource: '',
      fragmentSource: '',
      capacity: { kind: 'grow' },
      blend: 'additive',
      targetFormat: 'rgba16float',
    });
    const pass = { setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, draw() {} };
    renderer.draw({
      pass: pass as unknown as GPURenderPassEncoder,
      viewProj: new Float32Array(16),
      viewport: [512, 512],
      pxPerRad: 1000,
      instanceBytes: new Float32Array(FLOATS_PER_INSTANCE),
      instanceCount: 1,
      focusBindGroup: {} as GPUBindGroup,
      boost: {
        shipMpc: [0, 0, 0],
        dir: [0, 1, 0],
        beta: 0.75,
        gamma: 1.5,
        contraction: true,
        doppler: true,
        headlight: 1.5,
      },
    });
    const image = writeBuffer.mock.calls
      .map((call) => call[2] as Float32Array)
      .find((data) => data.length === UNIFORM_BYTES / 4)!;
    expect(Array.from(image.subarray(24, 32))).toEqual([0, 1, 0, 0.75, 1.5, 1, 1, 1.5]);
  });
});
