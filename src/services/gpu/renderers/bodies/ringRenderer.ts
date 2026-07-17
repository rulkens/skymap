/**
 * ringRenderer — the translucent planetary-ring renderer (Saturn's rings).
 *
 * The other half of the ring system. `texturedBodyRenderer` casts the ring's
 * shadow ON the planet (binding 3 of the sphere fragment); this draws the ring
 * ITSELF — a two-sided translucent annulus in the host body's equatorial plane,
 * textured by a radial alpha strip, with the planet's shadow cast ON the ring
 * (analytic ray-sphere, no shadow map — see `ring/fragment.wesl`).
 *
 * ## One shared renderer, ring-agnostic geometry
 *
 * The geometry is a unit DISC (`annulusMesh` with inner radius 0), not a
 * ring-specific annulus: the per-draw `RingUniforms.innerRatio` punches the hole
 * in the fragment (radii below it are discarded) and normalizes the radius for
 * the strip. So ONE geometry + ONE pipeline serve any ring the scene draws
 * (Saturn alone today), and `draw` needs no ring identity — just the packed
 * uniforms and this renderer's single strip texture. The host body's frame rides
 * in through the MVP (`composeBodyMvp(..., outerRadiusMpc, orientation)`), so the
 * disc lands in the planet's equatorial plane at the ring's outer radius by
 * construction.
 *
 * ## Placeholder posture
 *
 * The radial strip is fetched asynchronously by the `saturn-ring` `bodyTextures`
 * slot. Until it commits, binding 2 holds a 1×1 TRANSPARENT placeholder, so the
 * ring draws nothing (alpha 0) rather than a solid disc — the same branch-free
 * "bind a real texture always" posture the body renderers use. The layer also
 * gates its draw on the strip being resident, so in practice the placeholder is
 * never drawn.
 *
 * ## Pipeline state (spec §8)
 *
 * Colour: the caller's `targetFormat` (the `foreground:0` row's `rgba16float`)
 * with straight-alpha OVER blending — the ring is the sole translucent overlay
 * in the opaque foreground group, drawn AFTER the spheres. Depth: the caller's
 * `depthFormat` (`depth32float`) with `depthCompare: 'less'` but
 * `depthWriteEnabled: false` — the ring is depth-TESTED against the opaque
 * planet (so the far half is correctly occluded) but writes no depth (a
 * translucent overlay must not stamp z). `cullMode: 'none'` makes the annulus
 * two-sided. Explicit bind-group layout (not `'auto'`) so the texture swap
 * rebuilds the bind group against a stable layout — the
 * `feedback_webgpu_auto_layout_trap`.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { RingRenderer } from '../../../../@types/rendering/RingRenderer';
import { annulusMesh } from '../../../../utils/math/annulusMesh';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import vsCode from '../../shaders/bodies/ring/vertex.wesl?static';
import fsCode from '../../shaders/bodies/ring/fragment.wesl?static';

/** Radial tessellation of the ring disc — 128 segments give a smooth circular
 *  edge at close range without meaningful vertex cost (one disc, drawn once). */
const SEGMENTS = 128;

/** `RingUniforms` is 96 bytes (24 f32): the 80-byte lit prefix (with
 *  planetRadiusRatio filling the vec3's tail) + innerRatio + 3 pad. Written from
 *  `packRingUniforms`. */
const UNIFORM_BUFFER_SIZE = 96;

export function createRingRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
): RingRenderer {
  // ── Geometry: a unit disc (inner radius 0) ────────────────────────────────
  //
  // The hole is punched per-draw by the fragment from the uniform inner ratio,
  // so the geometry is ring-agnostic. Only positions are uploaded — the fragment
  // derives the radial strip u from the local position + inner ratio, so there is
  // no uv attribute (the disc could not bake a ring-specific radial u anyway).
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

  // ── Uniform buffer (one ring record) ──────────────────────────────────────
  const uniformBuffer = device.createBuffer({
    label: 'ring-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Sampler ───────────────────────────────────────────────────────────────
  //
  // Linear across the strip; `clamp-to-edge` on both axes so the inner / outer
  // edges don't wrap. No mip chain — the strip is a single row.
  const sampler = device.createSampler({
    label: 'ring-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // ── Placeholder strip (1×1 transparent) ───────────────────────────────────
  //
  // A transparent texel stands in until the radial strip bitmap arrives, so the
  // ring draws nothing (alpha 0) rather than a solid disc before the asset lands.
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

  // ── Bind group layout (explicit, not 'auto') ──────────────────────────────
  //
  // Binding 0: `RingUniforms`, VERTEX (mvp) + FRAGMENT (sunDirLocal + ratios).
  // Binding 1: sampler. Binding 2: the radial alpha strip.
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

  // ── Shader modules + pipeline ─────────────────────────────────────────────
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
          // Straight-alpha OVER: the ring is a translucent overlay blended over
          // the opaque spheres already in the foreground target.
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
    },
    primitive: {
      topology: 'triangle-list',
      // Two-sided: a thin ring is lit + visible from both faces.
      cullMode: 'none',
    },
    depthStencil: {
      format: depthFormat,
      // Depth-TESTED against the opaque planet (far ring half occluded) but
      // writes NO depth — a translucent overlay must not stamp z.
      depthWriteEnabled: false,
      depthCompare: 'less',
    },
  });

  // ── setTexture ────────────────────────────────────────────────────────────

  function setTexture(bitmap: ImageBitmap): void {
    texture.destroy();
    texture = device.createTexture({
      label: 'ring-strip-texture',
      size: [bitmap.width, bitmap.height, 1],
      format: 'rgba8unorm-srgb',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
      bitmap.width,
      bitmap.height,
      1,
    ]);
    bindGroup = buildBindGroup();
  }

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void {
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount);
  }

  // ── destroy ───────────────────────────────────────────────────────────────

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
