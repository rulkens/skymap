/**
 * Parity guard for the Milky Way cloud's `@group(0)`: `milkyWayCloudRenderer` packs it by hand
 * and both sprite passes read it through `milkyWay/sprites/io.wesl`. The WESL side is laid out
 * from the struct text; the TS side is observed in the renderer's upload under a stub device.
 */
import { describe, expect, it, vi } from 'vitest';
import { mat4 } from 'wgpu-matrix';
import { createMilkyWayCloudRenderer } from '../../../../src/layers/milkyWay/render/milkyWayCloudRenderer';
import { MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE } from '../../../../src/data/milkyWay/milkyWayCloudUniformBufferSize';
import type { FrameBoost } from '../../../../src/@types/engine/frame/FrameBoost';
import type { MilkyWayCloudDrawArgs } from '../../../../src/layers/milkyWay/@types/MilkyWayCloudDrawArgs';
import type { MilkyWayTuning } from '../../../../src/@types/settings/MilkyWayTuning';
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

const UNIFORMS = layoutOf('src/services/gpu/shaders/milkyWay/sprites/io.wesl', 'Uniforms');
const BOOST_AT = UNIFORMS.offsets.get('boost')! / 4;

const BOOST: FrameBoost = {
  shipMpc: [0, 0, 0],
  dir: [0, 1, 0],
  beta: 0.5,
  gamma: 1.25,
  contraction: true,
  doppler: true,
  headlight: 1,
};

/** The star pass's upload for one draw with `boost` under `model`. */
function uploadedImage(boost: FrameBoost | null, model: Float32Array): Float32Array {
  const writeBuffer = vi.fn();
  const device = {
    createBuffer: vi.fn(() => ({
      destroy: vi.fn(),
      getMappedRange: () => new ArrayBuffer(48),
      unmap: vi.fn(),
    })),
    createShaderModule: vi.fn(() => ({
      getCompilationInfo: () => Promise.resolve({ messages: [] }),
    })),
    createBindGroup: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: vi.fn(() => ({})) })),
    queue: { writeBuffer },
  } as unknown as GPUDevice;
  const renderer = createMilkyWayCloudRenderer({ device, targetFormat: 'rgba16float' });
  writeBuffer.mockClear();
  const args: MilkyWayCloudDrawArgs = {
    vp: new Float32Array(16),
    viewportPx: [640, 360],
    pxPerRad: 500,
    camPosModel: [1, 2, 3],
    model,
    fadeAlpha: 1,
    tuning: {} as MilkyWayTuning,
    boost,
    buffers: { starBuf: {} as GPUBuffer, starCount: 1, dustBuf: null, dustCount: 0 },
  };
  renderer.drawStars(
    {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    } as unknown as GPURenderPassEncoder,
    args,
  );
  return Float32Array.from(writeBuffer.mock.calls[0]![2] as Float32Array);
}

describe('milkyWay/sprites/io.wesl ↔ milkyWayCloudRenderer uniform parity', () => {
  it('appends the boost at float 52 and the struct is the buffer size', () => {
    expect(BOOST_AT).toBe(52);
    expect(UNIFORMS.layout.size).toBe(MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE);
    expect(uploadedImage(null, mat4.identity() as Float32Array).byteLength).toBe(
      MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE,
    );
  });

  it('milky way uniforms with a null boost are the identity block', () => {
    const image = uploadedImage(null, mat4.identity() as Float32Array);
    expect(Array.from(image.subarray(BOOST_AT, BOOST_AT + 8))).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  // The model maps its +x onto world +y (a 90° turn about z, under the cloud's uniform scale),
  // so a world +y direction of travel is model +x.
  it('dir is rotated into model space', () => {
    const model = mat4.scale(mat4.rotationZ(Math.PI / 2), [3, 3, 3]) as Float32Array;
    const image = uploadedImage(BOOST, model);
    const dir = Array.from(image.subarray(BOOST_AT, BOOST_AT + 3));
    expect(dir[0]).toBeCloseTo(1, 6);
    expect(dir[1]).toBeCloseTo(0, 6);
    expect(dir[2]).toBeCloseTo(0, 6);
    expect(Array.from(image.subarray(BOOST_AT + 3, BOOST_AT + 8))).toEqual([0.5, 1.25, 1, 1, 1]);
  });
});
