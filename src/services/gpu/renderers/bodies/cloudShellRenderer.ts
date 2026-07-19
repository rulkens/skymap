/**
 * cloudShellRenderer — the body-agnostic translucent cloud shell drawn just
 * above a planet's opaque surface.
 *
 * Where `earthRenderer` draws the opaque globe, this draws the thin translucent
 * deck of clouds ABOVE it: one closed unit-sphere mesh (`uvSphereMesh`), textured
 * by an equirectangular cloud map (RGB colour + `.a` coverage) and dimmed by the
 * shared sun-relative Lambert term so the deck goes dark on the night side. It is
 * emitted with straight-alpha OVER blending over the opaque foreground the
 * spheres already stamped.
 *
 * ## One shared renderer, body-agnostic
 *
 * The shell holds NO body-specific facts — no Earth radius, no
 * `CLOUD_SHELL_PARAMS`. The caller's `composeBodyMvp` scales the unit sphere to
 * the shell radius (just above the surface) and places it in the host body's
 * frame, and the caller packs the per-draw `CloudShellUniforms` (MVP +
 * body-local sun direction + opacity) through `packCloudShellUniforms`. So `draw`
 * needs no body identity, just the packed uniforms and this renderer's single
 * cloud texture — and Venus / Titan opt into the exact same renderer + pipeline
 * later by binding their own map. A single Earth-today shell draws once per frame,
 * so one non-dynamic uniform buffer suffices (the caller must issue at most one
 * `draw` per frame, else the `queue.writeBuffer` would race the pending
 * `queue.submit` — the same precondition every single-buffer body renderer holds).
 *
 * ## Closed sphere, not a disc
 *
 * The geometry is a closed `uvSphereMesh` (not the ring's flat disc): the shell
 * wraps the whole body. The UV sphere's polar pinch is a non-issue here — the
 * poles sit under an opaque, translucent cloud deck rather than a photographic
 * surface, so the puckering the surface renderer avoided (with a cube-sphere)
 * never reads. Positions (slot 0, stride 12) + uvs (slot 1, stride 8) are
 * uploaded as two tightly-packed VBOs, mirroring the mesh's two output arrays.
 *
 * ## Placeholder posture (transparent until the map lands)
 *
 * The cloud map is fetched asynchronously by the `bodyTextures` slot family.
 * Until it commits, binding 2 holds a 1×1 TRANSPARENT `rgba8unorm-srgb`
 * placeholder, so the shell draws nothing (alpha 0) rather than a solid ball —
 * the branch-free "bind a real texture always" posture the body renderers share.
 * `setTexture` swaps in the resident map (sized fresh, `flipY: true` to match the
 * surface's south-first v, full mip chain) and rebuilds the bind group against
 * the stable explicit layout (the `feedback_webgpu_auto_layout_trap`).
 *
 * ## Pipeline state
 *
 * Colour: the caller's `targetFormat` (the `foreground:0` row's `rgba16float`)
 * with straight-alpha OVER blending — the shell is a translucent overlay drawn
 * AFTER the opaque spheres. Depth: the caller's `depthFormat` (`depth32float`)
 * with `depthCompare: 'less'` but `depthWriteEnabled: false` — the shell is
 * depth-TESTED against the opaque planet (so the far half is correctly occluded)
 * but writes no depth (a translucent overlay must not stamp z). `frontFace: 'ccw'`
 * + `cullMode: 'back'` (a CLOSED sphere with outward `uvSphereMesh` winding — NOT
 * two-sided; contrast the ring's `cullMode: 'none'` flat annulus). The shell is
 * static: it rides the host body's frame with no independent spin or drift.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { CloudShellRenderer } from '../../../../@types/rendering/CloudShellRenderer';
import { uvSphereMesh } from '../../../../utils/math/uvSphereMesh';
import { generateMipChain, mipLevelCount } from '../../lib/generateMipChain';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import vsCode from '../../shaders/bodies/cloudShell/vertex.wesl?static';
import fsCode from '../../shaders/bodies/cloudShell/fragment.wesl?static';

/** UV-sphere tessellation — 48×24, shared with every sphere body renderer for a
 *  smooth silhouette at close range without overwhelming vertex throughput. */
const SEGMENTS = 48;
const RINGS = 24;

/** `CloudShellUniforms` is 80 bytes (20 f32): the 80-byte lit prefix (mvp +
 *  sunDirLocal) with `cloudOpacity` filling the vec3's trailing slot. Written
 *  from `packCloudShellUniforms` (`CLOUD_SHELL_UNIFORM_FLOATS × 4`). */
const UNIFORM_BUFFER_SIZE = 80;

export function createCloudShellRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
): CloudShellRenderer {
  // ── Geometry: a closed unit sphere (positions + uvs) ──────────────────────
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

  // ── Uniform buffer (one shell record) ─────────────────────────────────────
  const uniformBuffer = device.createBuffer({
    label: 'cloudShell-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Sampler (mip-consuming) ────────────────────────────────────────────────
  //
  // Trilinear (`mipmapFilter: 'linear'`) blends the mip chain `setTexture`
  // builds, so the deck stops shimmering as the body shrinks. `repeat` on u lets
  // the mesh's duplicated seam column wrap cleanly across the longitude seam;
  // `clamp-to-edge` on v avoids sampling past the poles — same as the surface.
  const sampler = device.createSampler({
    label: 'cloudShell-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
  });

  // ── Placeholder map (1×1 transparent) ──────────────────────────────────────
  //
  // A transparent texel stands in until the cloud bitmap arrives, so the shell
  // draws nothing (alpha 0) rather than a solid ball before the asset lands — the
  // branch-free "always bind a real texture" posture. `rgba8unorm-srgb` matches
  // the real map's colour format so the placeholder can't disagree with it.
  let texture = device.createTexture({
    label: 'cloudShell-placeholder-map',
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
  // Binding 0: `CloudShellUniforms`, VERTEX (mvp) + FRAGMENT (sunDirLocal +
  // opacity). Binding 1: sampler. Binding 2: the cloud colour+coverage map.
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

  function buildBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'cloudShell-bg',
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
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'cloudShell.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'cloudShell.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'cloudShell-pipeline',
    layout: device.createPipelineLayout({
      label: 'cloudShell-pipeline-layout',
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
        {
          arrayStride: 8, // 2 × f32 uv
          attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x2' }],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // Straight-alpha OVER: the shell is a translucent overlay blended over
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
      // A CLOSED sphere: outward-facing `uvSphereMesh` winding, back-cull the
      // inner surface (contrast the ring's two-sided `cullMode: 'none'` disc).
      frontFace: 'ccw',
      cullMode: 'back',
    },
    depthStencil: {
      format: depthFormat,
      // Depth-TESTED against the opaque planet (far shell half occluded) but
      // writes NO depth — a translucent overlay must not stamp z.
      depthWriteEnabled: false,
      depthCompare: 'less',
    },
  });

  // ── setTexture ────────────────────────────────────────────────────────────

  function setTexture(bitmap: ImageBitmap): void {
    texture.destroy();
    const levels = mipLevelCount(bitmap.width, bitmap.height);
    texture = device.createTexture({
      label: 'cloudShell-map-texture',
      size: [bitmap.width, bitmap.height, 1],
      format: 'rgba8unorm-srgb',
      mipLevelCount: levels,
      // RENDER_ATTACHMENT is required: generateMipChain renders each level below
      // 0 as a downsample pass (see its module header).
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // flipY:true so texture v=0 is the image's bottom (south) row, matching the
    // mesh's south-first v — the same orientation the surface uses (clouds are
    // co-registered equirectangular).
    device.queue.copyExternalImageToTexture({ source: bitmap, flipY: true }, { texture }, [
      bitmap.width,
      bitmap.height,
      1,
    ]);
    generateMipChain(device, texture);
    bindGroup = buildBindGroup();
  }

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void {
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, uvBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount);
  }

  // ── destroy ───────────────────────────────────────────────────────────────

  function destroy(): void {
    positionBuffer.destroy();
    uvBuffer.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
    texture.destroy();
  }

  const renderer: CloudShellRenderer = {
    label: 'cloudShellRenderer',
    setTexture,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
