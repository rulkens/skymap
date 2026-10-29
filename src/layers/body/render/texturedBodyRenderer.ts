/**
 * texturedBodyRenderer — one lit, textured unit sphere shared by every textured body
 * except Earth, whose atmosphere/specular path diverges into its own renderer. The
 * uploaded `uvSphereMesh` is NOT the surface: the vertex stage inflates it into a
 * shell that CIRCUMSCRIBES the body and the fragment recovers the analytic sphere per
 * pixel, so the silhouette is a pixel-exact circle at the radius the atmosphere shell
 * rays against, not a polygon inscribed 0.2–0.4% inside it whose sliver the background
 * shows through (maths in `shaders/lib/analyticSphere.wesl`). Each body owns its own
 * uniform buffer + bind group, so no per-frame write can race another body's draw.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { TexturedBodyRenderer } from '../@types/TexturedBodyRenderer';
import type { AtlasTileRect } from '../../../@types/data/AtlasTileRect';
import type { BodyTextureId } from '../../../@types/data/BodyTextureId';
import type { TextureKind } from '../../../@types/data/TextureKind';
import { uvSphereMesh } from '../../../utils/math/uvSphereMesh';
import { BODY_SPHERE_RINGS, BODY_SPHERE_SEGMENTS } from '../../../data/bodies/sphereTessellation';
import { generateMipChain, mipLevelCount } from '../../../services/gpu/lib/generateMipChain';
import { resolveDepthCompare } from '../../../utils/gpu/resolveDepthCompare';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { TEXTURED_BODY_UNIFORM_FLOATS } from './packTexturedBodyUniforms';
import vsCode from '../../../services/gpu/shaders/bodies/texturedBody/vertex.wesl?static';
import fsCode from '../../../services/gpu/shaders/bodies/texturedBody/fragment.wesl?static';

/** 176 bytes (44 f32), derived from the packer's count so it cannot drift. */
const UNIFORM_BUFFER_SIZE = TEXTURED_BODY_UNIFORM_FLOATS * 4;

/**
 * Per-kind sphere-map config: bind-group binding, GPU format and 1×1 placeholder
 * texel. Layout, placeholders and bind groups are all derived from these rows.
 * `normal` is LINEAR `rgba8unorm`: its RG channels carry slope data, which an
 * sRGB decode would corrupt. Bindings 0 (uniform), 1 (sampler), 3 (ring) are fixed.
 */
const KIND_CFG = {
  surface: { binding: 2, format: 'rgba8unorm-srgb', placeholder: [128, 128, 128, 255] },
  normal: { binding: 4, format: 'rgba8unorm', placeholder: [128, 128, 255, 255] }, // LINEAR — RG are slope data, never -srgb; [128,128,255] decodes to (0,0,1) = flat
} as const satisfies Partial<
  Record<
    TextureKind,
    {
      binding: number;
      format: GPUTextureFormat;
      placeholder: readonly [number, number, number, number];
    }
  >
>;

type SphereMapKind = keyof typeof KIND_CFG;
const SPHERE_MAP_KINDS = Object.keys(KIND_CFG) as SphereMapKind[];

/** Per-body GPU resources; own uniform buffer so no shared uniform is clobbered mid-frame.
 *  Two texture layers per kind: `maps` (committed full-res) and `placeholders`
 *  (atlas-tile stand-in, overriding the shared 1×1). `ringTexture` null ⇒ shared placeholder. */
type BodyResources = {
  uniformBuffer: GPUBuffer;
  maps: Map<TextureKind, GPUTexture>;
  placeholders: Map<TextureKind, GPUTexture>;
  ringTexture: GPUTexture | null;
  bindGroup: GPUBindGroup;
};

/**
 * @param reversedZ this slab's depth convention (`SLAB_REVERSED_Z`), resolved
 *   through `resolveDepthCompare`.
 */
export function createTexturedBodyRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): TexturedBodyRenderer {
  const mesh = uvSphereMesh(BODY_SPHERE_SEGMENTS, BODY_SPHERE_RINGS);
  const indexCount = mesh.indices.length;

  const positionBuffer = device.createBuffer({
    label: 'texturedBody-position-vbo',
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

  const uvBuffer = device.createBuffer({
    label: 'texturedBody-uv-vbo',
    size: mesh.uvs.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uvBuffer, 0, mesh.uvs);

  const indexBuffer = device.createBuffer({
    label: 'texturedBody-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  // `repeat` on u lets the mesh's duplicated seam column blend across the
  // longitude wrap; `clamp-to-edge` on v avoids sampling past the poles.
  const sampler = device.createSampler({
    label: 'texturedBody-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
  });

  // Every body always binds a real texture (keeps the fragment branch-free); the
  // ring placeholder is TRANSPARENT.
  const sharedPlaceholders = new Map<SphereMapKind, GPUTexture>();
  for (const kind of SPHERE_MAP_KINDS) {
    const cfg = KIND_CFG[kind];
    const placeholder = device.createTexture({
      label: `texturedBody-placeholder-${kind}`,
      size: [1, 1, 1],
      format: cfg.format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: placeholder },
      new Uint8Array(cfg.placeholder),
      { bytesPerRow: 4, rowsPerImage: 1 },
      [1, 1, 1],
    );
    sharedPlaceholders.set(kind, placeholder);
  }

  const placeholderRing = device.createTexture({
    label: 'texturedBody-placeholder-ring',
    size: [1, 1, 1],
    format: 'rgba8unorm-srgb',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: placeholderRing },
    new Uint8Array([0, 0, 0, 0]),
    { bytesPerRow: 4, rowsPerImage: 1 },
    [1, 1, 1],
  );

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'texturedBody-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ...SPHERE_MAP_KINDS.map((kind) => ({
        binding: KIND_CFG[kind].binding,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' as const },
      })),
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'texturedBody.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'texturedBody.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'texturedBody-pipeline',
    layout: device.createPipelineLayout({
      label: 'texturedBody-pipeline-layout',
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
      targets: [{ format: targetFormat }],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw', // outward-facing (matches uvSphereMesh winding)
      // Keep the FAR hemisphere: front faces vanish once the camera crosses inside
      // the 5% shell (a legal close approach), taking the body with them.
      cullMode: 'front',
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  const bodies = new Map<BodyTextureId, BodyResources>();

  // What a body shows for a kind it has NOT committed: its own override, else the
  // shared 1×1. Looked up through `bodies`, never a passed-in map, to avoid stale copies.
  function placeholderFor(bodyId: BodyTextureId, kind: SphereMapKind): GPUTexture {
    return bodies.get(bodyId)?.placeholders.get(kind) ?? sharedPlaceholders.get(kind)!;
  }

  function buildBindGroup(
    bodyId: BodyTextureId,
    res: Pick<BodyResources, 'uniformBuffer' | 'maps' | 'ringTexture'>,
  ): GPUBindGroup {
    return device.createBindGroup({
      label: 'texturedBody-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: res.uniformBuffer } },
        { binding: 1, resource: sampler },
        ...SPHERE_MAP_KINDS.map((kind) => ({
          binding: KIND_CFG[kind].binding,
          resource: (res.maps.get(kind) ?? placeholderFor(bodyId, kind)).createView(),
        })),
        { binding: 3, resource: (res.ringTexture ?? placeholderRing).createView() },
      ],
    });
  }

  function resourcesFor(bodyId: BodyTextureId): BodyResources {
    const existing = bodies.get(bodyId);
    if (existing) return existing;
    const uniformBuffer = device.createBuffer({
      label: `texturedBody-uniform-${bodyId}`,
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const res: BodyResources = {
      uniformBuffer,
      maps: new Map(),
      placeholders: new Map(),
      ringTexture: null,
      bindGroup: buildBindGroup(bodyId, { uniformBuffer, maps: new Map(), ringTexture: null }),
    };
    bodies.set(bodyId, res);
    return res;
  }

  // The full mip chain stops shimmer as the body shrinks toward the sub-pixel glint handoff.
  function setMap(bodyId: BodyTextureId, kind: TextureKind, bitmap: ImageBitmap): void {
    const cfg = KIND_CFG[kind as SphereMapKind];
    const res = resourcesFor(bodyId);
    res.maps.get(kind)?.destroy();
    const levels = mipLevelCount(bitmap.width, bitmap.height);
    const texture = device.createTexture({
      label: `texturedBody-${kind}-${bodyId}`,
      size: [bitmap.width, bitmap.height, 1],
      format: cfg.format,
      mipLevelCount: levels,
      // RENDER_ATTACHMENT: generateMipChain renders each level below 0.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // flipY so texture v=0 is the south row, matching the mesh's south-first v.
    device.queue.copyExternalImageToTexture({ source: bitmap, flipY: true }, { texture }, [
      bitmap.width,
      bitmap.height,
      1,
    ]);
    generateMipChain(device, texture);
    res.maps.set(kind, texture);
    res.bindGroup = buildBindGroup(bodyId, res);
  }

  // Lands in `res.placeholders`, not `res.maps`, so a committed hi-res map shadows
  // it in either arrival order and `clearMap` falls back onto it. Only `rect` is
  // copied: the atlas stays a transport format (no UV remap, no atlas bound).
  function setPlaceholderMap(
    bodyId: BodyTextureId,
    kind: TextureKind,
    atlas: ImageBitmap,
    rect: AtlasTileRect,
  ): void {
    const cfg = KIND_CFG[kind as SphereMapKind];
    const res = resourcesFor(bodyId);
    res.placeholders.get(kind)?.destroy();
    const levels = mipLevelCount(rect.w, rect.h);
    const texture = device.createTexture({
      label: `texturedBody-placeholder-${kind}-${bodyId}`,
      size: [rect.w, rect.h, 1],
      format: cfg.format,
      mipLevelCount: levels,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // `origin` and `flipY` INTERACT, and the mock device rasterises nothing, so a
    // mirrored crop passes CI. `origin` is in UNFLIPPED source coordinates (top-left,
    // y down; the space `atlasTileRect` computes in); `flipY` then applies to the
    // SELECTED REGION alone, so v=0 is the tile's south row.
    device.queue.copyExternalImageToTexture(
      { source: atlas, origin: { x: rect.x, y: rect.y }, flipY: true },
      { texture },
      [rect.w, rect.h, 1],
    );
    generateMipChain(device, texture);
    // Store BEFORE the rebuild: `buildBindGroup` resolves the placeholder through `bodies`.
    res.placeholders.set(kind, texture);
    res.bindGroup = buildBindGroup(bodyId, res);
  }

  // Per-KIND, not per-body: `surface` and `normal` clamp to INDEPENDENT tiers (the
  // Moon's surface ceiling is `large`, its normal `medium`), so a tier switch can
  // evict one alone. A per-body clear would destroy the sibling, whose unchanged
  // tier means the demand loop would never re-fetch it. The ring texture rides its
  // OWN slot key and survives.
  function clearMap(bodyId: BodyTextureId, kind: TextureKind): void {
    const res = bodies.get(bodyId);
    if (res === undefined) return;
    const texture = res.maps.get(kind);
    if (texture === undefined) return;
    texture.destroy();
    res.maps.delete(kind);
    res.bindGroup = buildBindGroup(bodyId, res);
  }

  // The flat-vs-textured split asks HERE, not the loading system: a committed slot is
  // only a proxy, and when the two diverge both layers draw the body twice into
  // `foreground:0`. Either texture layer counts.
  function hasMap(bodyId: BodyTextureId, kind: TextureKind): boolean {
    const res = bodies.get(bodyId);
    if (res === undefined) return false;
    return res.maps.has(kind) || res.placeholders.has(kind);
  }

  function setRingTexture(bodyId: BodyTextureId, bitmap: ImageBitmap): void {
    const res = resourcesFor(bodyId);
    res.ringTexture?.destroy();
    const texture = device.createTexture({
      label: `texturedBody-ring-${bodyId}`,
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
    res.ringTexture = texture;
    res.bindGroup = buildBindGroup(bodyId, res);
  }

  function draw(pass: GPURenderPassEncoder, bodyId: BodyTextureId, uniforms: Float32Array): void {
    const res = resourcesFor(bodyId);
    // Per-body buffer: `writeBuffer` interleaved with `submit` does not preserve
    // order, so a shared buffer would let a later body's write decide this matrix.
    device.queue.writeBuffer(res.uniformBuffer, 0, uniforms);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, res.bindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, uvBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount);
  }

  function destroy(): void {
    positionBuffer.destroy();
    uvBuffer.destroy();
    indexBuffer.destroy();
    for (const placeholder of sharedPlaceholders.values()) placeholder.destroy();
    placeholderRing.destroy();
    for (const res of bodies.values()) {
      res.uniformBuffer.destroy();
      for (const texture of res.maps.values()) texture.destroy();
      for (const placeholder of res.placeholders.values()) placeholder.destroy();
      res.ringTexture?.destroy();
    }
    bodies.clear();
  }

  const renderer: TexturedBodyRenderer = {
    label: 'texturedBodyRenderer',
    setMap,
    setPlaceholderMap,
    clearMap,
    hasMap,
    setRingTexture,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
