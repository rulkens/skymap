/**
 * ringRenderer: the translucent planetary-ring renderer (Saturn's). A two-sided
 * annulus in the host's equatorial plane, textured by a radial alpha strip, with
 * the planet's shadow cast on it analytically (`ring/fragment.wesl`);
 * `texturedBodyRenderer` casts the ring's shadow ON the planet. The geometry is a
 * unit DISC (`annulusMesh` inner radius 0): `RingUniforms.innerRatio` punches the
 * hole per draw, so one geometry and pipeline serve any ring and `draw` needs no
 * ring identity. Depth-TESTED against the planet (reversed-Z `greater`), no depth
 * write; `cullMode: 'none'`. Explicit bind-group layout, never 'auto'.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { RingRenderer } from '../@types/RingRenderer';
import { annulusMesh } from '../../../utils/math/annulusMesh';
import { resolveDepthCompare } from '../../../utils/gpu/resolveDepthCompare';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import vsCode from '../../../services/gpu/shaders/bodies/ring/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/bodies/ring/fragment.wesl?static';

/** Radial tessellation of the ring disc. */
const SEGMENTS = 128;

/** `RingUniforms` byte size; see `packRingUniforms`. */
const UNIFORM_BUFFER_SIZE = 96;

/** @param reversedZ this slab's depth convention (`SLAB_REVERSED_Z`), resolved by `resolveDepthCompare`. */
export function createRingRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): RingRenderer {
  // Positions only: the fragment derives the strip u from the local position and inner ratio.
  const mesh = annulusMesh(SEGMENTS, 0);
  const indexCount = mesh.indices.length;

  const positionBuffer = device.createBuffer({
    label: 'ring-position-vbo',
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

  const indexBuffer = device.createBuffer({
    label: 'ring-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  const uniformBuffer = device.createBuffer({
    label: 'ring-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // `clamp-to-edge` so the inner / outer edges don't wrap; no mip chain (a single row).
  const sampler = device.createSampler({
    label: 'ring-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // Transparent until the strip lands, so the ring draws nothing rather than a solid disc.
  let texture = device.createTexture({
    label: 'ring-placeholder-strip',
    size: [1, 1, 1],
    format: 'rgba8unorm-srgb',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    new Uint8Array([0, 0, 0, 0]),
    { bytesPerRow: 4, rowsPerImage: 1 },
    [1, 1, 1],
  );

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'ring-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });

  function buildBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'ring-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: texture.createView() },
      ],
    });
  }
  let bindGroup = buildBindGroup();

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'ring.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'ring.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'ring-pipeline',
    layout: device.createPipelineLayout({
      label: 'ring-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 12, // 3 × f32 position
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // Premultiplied OVER: the fragment premultiplies its reflected colour by
          // coverage itself (see its header), hence 'one', not 'src-alpha'.
          blend: {
            color: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'none',
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: false,
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  function setTexture(bitmap: ImageBitmap): void {
    texture.destroy();
    texture = device.createTexture({
      label: 'ring-strip-texture',
      size: [bitmap.width, bitmap.height, 1],
      format: 'rgba8unorm-srgb',
      // RENDER_ATTACHMENT: Dawn rejects copyExternalImageToTexture without it.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
      bitmap.width,
      bitmap.height,
      1,
    ]);
    bindGroup = buildBindGroup();
  }

  function draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void {
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount);
  }

  function destroy(): void {
    positionBuffer.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
    texture.destroy();
  }

  const renderer: RingRenderer = {
    label: 'ringRenderer',
    setTexture,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
