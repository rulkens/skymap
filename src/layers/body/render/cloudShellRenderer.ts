/**
 * cloudShellRenderer: the body-agnostic translucent cloud shell above a planet's
 * opaque surface. One closed `uvSphereMesh`, an equirectangular cloud map (RGB +
 * `.a` coverage), the shared sun-relative Lambert term, straight-alpha OVER. It
 * holds no body facts: the caller scales the unit sphere via `composeBodyMvp` and
 * packs `CloudShellUniforms`. One non-dynamic uniform buffer, so at most one `draw`
 * per frame (else `queue.writeBuffer` races the pending `queue.submit`).
 * Depth-TESTED against the opaque planet but never written. `draw`'s `inside`
 * picks the front-cull pipeline: back-cull would discard every triangle once the
 * camera is within the sphere. Pipelines use explicit layouts, never 'auto'.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { CloudShellRenderer } from '../@types/CloudShellRenderer';
import { uvSphereMesh } from '../../../utils/math/uvSphereMesh';
import { CLOUD_SHELL_UNIFORM_FLOATS } from './packCloudShellUniforms';
import { resolveDepthCompare } from '../../../utils/gpu/resolveDepthCompare';
import { generateMipChain, mipLevelCount } from '../../../services/gpu/lib/generateMipChain';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import vsCode from '../../../services/gpu/shaders/bodies/cloudShell/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/bodies/cloudShell/fragment.wesl?static';

/** 128x64. A UV-sphere facet centre sags to 1 - cos^2(pi/SEGMENTS) of the radius, which
 *  MUST stay below the shell margin (`CLOUD_SHELL_PARAMS.radiusRatio - 1 = 0.002`) or
 *  the opaque globe pokes through every facet. 48x24 sags 0.00428 (globe shows
 *  through); 128x64 sags 0.00060. */
const SEGMENTS = 128;
const RINGS = 64;

/** Derived from the packer's f32 count so the buffer cannot drift from the layout. */
const UNIFORM_BUFFER_SIZE = CLOUD_SHELL_UNIFORM_FLOATS * 4;

/**
 * @param reversedZ selects this slab's depth convention (single-sourced in
 *   `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
 *   `true` ⇒ reversed-Z greater-wins. Resolved through `resolveDepthCompare`.
 */
export function createCloudShellRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): CloudShellRenderer {
  const mesh = uvSphereMesh(SEGMENTS, RINGS);
  const indexCount = mesh.indices.length;

  const positionBuffer = device.createBuffer({
    label: 'cloudShell-position-vbo',
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

  const uvBuffer = device.createBuffer({
    label: 'cloudShell-uv-vbo',
    size: mesh.uvs.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uvBuffer, 0, mesh.uvs);

  const indexBuffer = device.createBuffer({
    label: 'cloudShell-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  const uniformBuffer = device.createBuffer({
    label: 'cloudShell-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // `repeat` on u wraps the duplicated seam column; `clamp-to-edge` on v avoids
  // sampling past the poles.
  const sampler = device.createSampler({
    label: 'cloudShell-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
  });

  // Transparent until the map lands, so the shell draws nothing rather than a solid
  // ball. Same `rgba8unorm-srgb` format as the real map.
  const placeholder = device.createTexture({
    label: 'cloudShell-placeholder-map',
    size: [1, 1, 1],
    format: 'rgba8unorm-srgb',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: placeholder },
    new Uint8Array([0, 0, 0, 0]),
    { bytesPerRow: 4, rowsPerImage: 1 },
    [1, 1, 1],
  );

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'cloudShell-bgl',
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

  // The real map, or null while the placeholder stands in (before commit, after release).
  let committed: GPUTexture | null = null;
  function buildBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'cloudShell-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: (committed ?? placeholder).createView() },
      ],
    });
  }
  let bindGroup = buildBindGroup();

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'cloudShell.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'cloudShell.fragment');

  const pipelineLayout = device.createPipelineLayout({
    label: 'cloudShell-pipeline-layout',
    bindGroupLayouts: [bindGroupLayout],
  });
  const vertexState: GPUVertexState = {
    module: vsModule,
    entryPoint: 'vs',
    buffers: [
      {
        arrayStride: 12, // 3 × f32 position
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
      },
      {
        arrayStride: 8, // 2 × f32 uv
        attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
      },
    ],
  };
  const fragmentState: GPUFragmentState = {
    module: fsModule,
    entryPoint: 'fs',
    targets: [
      {
        format: targetFormat,
        blend: {
          color: {
            srcFactor: 'src-alpha',
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
  };
  const depthStencilState: GPUDepthStencilState = {
    format: depthFormat,
    depthWriteEnabled: false,
    depthCompare: resolveDepthCompare('nearer', reversedZ),
  };

  // The pair differs ONLY in `cullMode`, so they cannot cover different pixels.
  function createShellPipeline(label: string, cullMode: GPUCullMode): GPURenderPipeline {
    return device.createRenderPipeline({
      label,
      layout: pipelineLayout,
      vertex: vertexState,
      fragment: fragmentState,
      primitive: { topology: 'triangle-list', frontFace: 'ccw', cullMode },
      depthStencil: depthStencilState,
    });
  }
  const outsidePipeline = createShellPipeline('cloudShell-pipeline-outside', 'back');
  const insidePipeline = createShellPipeline('cloudShell-pipeline-inside', 'front');

  function setTexture(bitmap: ImageBitmap): void {
    committed?.destroy();
    const levels = mipLevelCount(bitmap.width, bitmap.height);
    const texture = device.createTexture({
      label: 'cloudShell-map-texture',
      size: [bitmap.width, bitmap.height, 1],
      format: 'rgba8unorm-srgb',
      mipLevelCount: levels,
      // RENDER_ATTACHMENT: generateMipChain renders each level below 0.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // flipY so v=0 is the south row, matching the mesh and the surface.
    device.queue.copyExternalImageToTexture({ source: bitmap, flipY: true }, { texture }, [
      bitmap.width,
      bitmap.height,
      1,
    ]);
    generateMipChain(device, texture);
    committed = texture;
    bindGroup = buildBindGroup();
  }

  function clearTexture(): void {
    if (committed === null) return;
    committed.destroy();
    committed = null;
    bindGroup = buildBindGroup();
  }

  function draw(pass: GPURenderPassEncoder, uniforms: Float32Array, inside: boolean): void {
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    pass.setPipeline(inside ? insidePipeline : outsidePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, uvBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount);
  }

  function destroy(): void {
    positionBuffer.destroy();
    uvBuffer.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
    committed?.destroy();
    placeholder.destroy();
  }

  const renderer: CloudShellRenderer = {
    label: 'cloudShellRenderer',
    setTexture,
    clearTexture,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
