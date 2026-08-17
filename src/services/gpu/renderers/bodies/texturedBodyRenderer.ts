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

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { TexturedBodyRenderer } from '../../../../@types/rendering/TexturedBodyRenderer';
import type { AtlasTileRect } from '../../../../@types/data/AtlasTileRect';
import type { BodyTextureId } from '../../../../@types/data/BodyTextureId';
import type { TextureKind } from '../../../../@types/data/TextureKind';
import { uvSphereMesh } from '../../../../utils/math/uvSphereMesh';
import {
  BODY_SPHERE_RINGS,
  BODY_SPHERE_SEGMENTS,
} from '../../../../data/bodies/sphereTessellation';
import { generateMipChain, mipLevelCount } from '../../lib/generateMipChain';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import vsCode from '../../shaders/bodies/texturedBody/vertex.wesl?static';
import fsCode from '../../shaders/bodies/texturedBody/fragment.wesl?static';

/** `TexturedBodyUniforms` is 112 bytes (28 f32): the 80-byte lit prefix + two
 *  ring ratios + two Minnaert limb params + camPosLocal vec3 + one pad float.
 *  Written from `packTexturedBodyUniforms`. */
const UNIFORM_BUFFER_SIZE = 112;

/**
 * Per-kind sphere-map config — THE EXTENSION POINT. Each row names a
 * `TextureKind`'s bind-group binding, GPU texture format, and 1×1 placeholder
 * texel; the bind-group layout, the per-kind placeholder textures, and every
 * body's bind group are all derived by iterating these rows. Two rows today:
 * `surface` (binding 2, sRGB colour) and `normal` (binding 4, LINEAR
 * `rgba8unorm` — the RG channels carry slope data, so an sRGB decode would
 * corrupt them). A further map role is one more row and the whole path — layout,
 * placeholders, bind group, `setMap` — extends with no new branch.
 *
 * Bindings 0 (uniform), 1 (sampler), and 3 (ring) are fixed and hand-written;
 * only the sphere-map bindings live here.
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

/** The `TextureKind`s that have a `KIND_CFG` row — the sphere maps this renderer
 *  binds. Narrowed to the config's own keys so iteration stays exhaustive. */
type SphereMapKind = keyof typeof KIND_CFG;
const SPHERE_MAP_KINDS = Object.keys(KIND_CFG) as SphereMapKind[];

/** Per-body GPU resources. Each body owns its uniform buffer + bind group so no
 *  shared uniform can be clobbered mid-frame.
 *
 *  Two independent texture layers per sphere-map kind, never one:
 *  - `maps` — the COMMITTED layer, a full-resolution map this body owns.
 *  - `placeholders` — this body's stand-in for a kind it has not committed,
 *    overriding the shared 1×1. Seeded by `setPlaceholderMap` from an atlas tile.
 *
 *  `ringTexture` is `null` while the body uses the shared ring placeholder. */
type BodyResources = {
  uniformBuffer: GPUBuffer;
  maps: Map<TextureKind, GPUTexture>;
  placeholders: Map<TextureKind, GPUTexture>;
  ringTexture: GPUTexture | null;
  bindGroup: GPUBindGroup;
};

/**
 * @param reversedZ selects this slab's depth convention (single-sourced in
 *   `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
 *   `true` ⇒ reversed-Z greater-wins. Resolved through `resolveDepthCompare`.
 */
export function createTexturedBodyRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): TexturedBodyRenderer {
  // ── Geometry upload (positions + uvs, like earthRenderer) ─────────────────
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

  // ── Sampler (mip-consuming) ───────────────────────────────────────────────
  //
  // `mipmapFilter: 'linear'` trilinearly blends the mip chain `setMap`
  // builds — the first sampler in the repo to consume mips. `repeat` on u lets
  // the mesh's duplicated seam column blend across the longitude wrap;
  // `clamp-to-edge` on v avoids sampling past the poles (same as earth).
  const sampler = device.createSampler({
    label: 'texturedBody-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
  });

  // ── Shared placeholders ───────────────────────────────────────────────────
  //
  // One 1×1 texture per sphere-map kind (mid-grey for `surface`), in that kind's own
  // format, plus a TRANSPARENT one for the ring binding. Every body binds a real
  // texture at all times, which is what keeps the fragment branch-free and the layout
  // identical across the whole set; these are the resolver's default layer.
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

  // ── Bind group layout (explicit, not 'auto') ──────────────────────────────
  //
  // Binding 0: `TexturedBodyUniforms`, VERTEX (mvp) + FRAGMENT (sunDirLocal +
  //            ring ratios). Binding 1: sampler. Sphere-map bindings (binding 2 =
  //            surface, binding 4 = normal) are derived from KIND_CFG. Binding 3:
  //            ring-alpha strip (real placeholder if none).
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'texturedBody-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      // One texture entry per sphere-map kind, at that kind's configured binding.
      ...SPHERE_MAP_KINDS.map((kind) => ({
        binding: KIND_CFG[kind].binding,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' as const },
      })),
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });

  // ── Shader modules + pipeline ─────────────────────────────────────────────
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
      // No blend descriptor = opaque replace; the fragment emits alpha=1 and the
      // foreground composite blends the whole layer.
      targets: [{ format: targetFormat }],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw', // outward-facing (matches uvSphereMesh winding)
      // The proxy is invisible scaffolding, so its FAR hemisphere is the one to
      // keep. Front faces would vanish the moment the camera crossed inside the
      // 5% shell — a legal close approach — and take the body with them; the far
      // hemisphere still covers the whole disc from in there, because the near
      // hemisphere is behind the eye.
      cullMode: 'front',
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  // ── Per-body resources ────────────────────────────────────────────────────
  const bodies = new Map<BodyTextureId, BodyResources>();

  // What a body shows for a kind it has NOT committed: its own override if it has
  // one, else the shared 1×1. Keeping the two layers separate keeps the chain in
  // `buildBindGroup` TWO-term — a third `?? shared` term would move the precedence
  // rule into every rebuild site and force `clearMap` to know what to fall back TO.
  // The lookup goes through `bodies`, never a passed-in map, so no caller can resolve
  // against a stale copy.
  function placeholderFor(bodyId: BodyTextureId, kind: SphereMapKind): GPUTexture {
    return bodies.get(bodyId)?.placeholders.get(kind) ?? sharedPlaceholders.get(kind)!;
  }

  // Build a bind group from a body's current resources, falling back to the
  // resolved placeholder while a body texture / ring texture is unset. Called at
  // first reference and rebuilt on every texture swap against the stable layout.
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
        // One sphere-map entry per KIND_CFG row: the body's committed texture, or
        // its resolved placeholder while that kind is unset. Derived, not
        // hardcoded — a new kind binds here automatically.
        ...SPHERE_MAP_KINDS.map((kind) => ({
          binding: KIND_CFG[kind].binding,
          resource: (res.maps.get(kind) ?? placeholderFor(bodyId, kind)).createView(),
        })),
        { binding: 3, resource: (res.ringTexture ?? placeholderRing).createView() },
      ],
    });
  }

  // Lazily create a body's resources on first reference (draw or texture swap):
  // a fresh uniform buffer + a bind group pointing at the shared placeholders.
  // Memoised in `bodies`, so a body allocates exactly one uniform buffer + one
  // bind group across its lifetime (rebuilt in place on a texture swap).
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

  // ── setMap ────────────────────────────────────────────────────────────────
  //
  // Upload a body's map for one `TextureKind`, taking binding + format from that
  // kind's KIND_CFG row. The full mip chain is what stops the surface shimmering as
  // the body shrinks toward the sub-pixel glint handoff.

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
      // RENDER_ATTACHMENT is required: generateMipChain renders each level below
      // 0 as a downsample pass (see its module header).
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // flipY:true so texture v=0 is the image's bottom (south) row, matching the
    // mesh's south-first v — the same orientation earth uses.
    device.queue.copyExternalImageToTexture({ source: bitmap, flipY: true }, { texture }, [
      bitmap.width,
      bitmap.height,
      1,
    ]);
    generateMipChain(device, texture);
    res.maps.set(kind, texture);
    res.bindGroup = buildBindGroup(bodyId, res);
  }

  // ── setPlaceholderMap ─────────────────────────────────────────────────────
  //
  // Seed ONE body's placeholder override for one kind from a tile of the shared
  // low-resolution body atlas. Structurally `setMap`, bar two differences that carry
  // the design: the texture lands in `res.placeholders`, not `res.maps`, so a
  // committed hi-res map shadows it whichever order the two arrive in and `clearMap`
  // falls back onto it; and only `rect` of the source bitmap is copied. Cropping at
  // upload keeps the atlas a TRANSPORT format — no shader change, no UV remap, no
  // seam gutters, and no atlas texture bound anywhere.

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
      // Same as `setMap`: generateMipChain renders each level below 0.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // COORDINATE CONVENTION — `origin` and `flipY` INTERACT, and this is the one
    // place a wrong assumption survives every test: the mock device rasterises
    // nothing, so a mirrored or wrong-row crop is green in CI and visibly wrong
    // on screen.
    //
    // `origin` is the minimum corner of the source sub-region in UNFLIPPED source
    // coordinates — top-left origin, y increasing DOWNWARD, unaffected by `flipY`
    // (WebGPU §GPUCopyExternalImageSourceInfo: "The origin option is still relative
    // to the top-left corner of the source image, increasing downward"), which is
    // the space `atlasTileRect` computes in. `flipY: true` then applies to the
    // SELECTED REGION alone, so texture v=0 is the tile's south row — `setMap`'s
    // convention, shared with earthRenderer.
    device.queue.copyExternalImageToTexture(
      { source: atlas, origin: { x: rect.x, y: rect.y }, flipY: true },
      { texture },
      [rect.w, rect.h, 1],
    );
    generateMipChain(device, texture);
    // Store BEFORE the rebuild: `buildBindGroup` resolves the placeholder through
    // `bodies`, so the override has to be visible there for the new bind group to
    // pick it up.
    res.placeholders.set(kind, texture);
    res.bindGroup = buildBindGroup(bodyId, res);
  }

  // ── clearMap ──────────────────────────────────────────────────────────────
  //
  // The eviction inverse of `setMap`: free ONE kind's sphere map and rebind whatever
  // the resolver gives for that (body, kind), so a cleared kind never has to be told
  // what to fall back TO.
  //
  // Per-KIND, not per-body: `surface` and `normal` clamp to INDEPENDENT tiers (the
  // Moon's surface ceiling is `large`, its normal ceiling `medium`), so a tier switch
  // can evict one slot alone. A per-body clear would destroy the sibling texture too,
  // and since its clamped tier is unchanged the demand loop would never re-fetch it —
  // the map would stay gone until an unrelated tier change.
  //
  // The ring texture and uniform buffer survive: the ring rides its OWN slot key, and
  // keeping the buffer keeps the body drawable-but-plain without a realloc.

  function clearMap(bodyId: BodyTextureId, kind: TextureKind): void {
    const res = bodies.get(bodyId);
    if (res === undefined) return;
    const texture = res.maps.get(kind);
    // Kind not resident (only ever drew this kind's placeholder) → nothing to free.
    // A no-op keeps onRelease honest without a residency check upstream.
    if (texture === undefined) return;
    texture.destroy();
    res.maps.delete(kind);
    res.bindGroup = buildBindGroup(bodyId, res);
  }

  // ── hasMap ────────────────────────────────────────────────────────────────
  //
  // Residency answered by the thing that draws it: does this (body, kind) binding
  // hold a real texture rather than the shared 1×1? The frame's flat-vs-textured
  // split asks HERE and not the loading system, because a committed slot is only a
  // proxy for the fact — when the two diverge, both layers take opposite branches
  // and draw the body twice into `foreground:0`. Either texture layer counts: a body
  // whose only map is its placeholder override still draws as textured.

  function hasMap(bodyId: BodyTextureId, kind: TextureKind): boolean {
    const res = bodies.get(bodyId);
    if (res === undefined) return false;
    return res.maps.has(kind) || res.placeholders.has(kind);
  }

  // ── setRingTexture ────────────────────────────────────────────────────────

  function setRingTexture(bodyId: BodyTextureId, bitmap: ImageBitmap): void {
    const res = resourcesFor(bodyId);
    res.ringTexture?.destroy();
    const texture = device.createTexture({
      label: `texturedBody-ring-${bodyId}`,
      size: [bitmap.width, bitmap.height, 1],
      format: 'rgba8unorm-srgb',
      // RENDER_ATTACHMENT is required by copyExternalImageToTexture even though
      // we never render INTO the strip — Dawn rejects the upload without it.
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

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, bodyId: BodyTextureId, uniforms: Float32Array): void {
    const res = resourcesFor(bodyId);
    // Write THIS body's own uniform buffer immediately before its draw: interleaving
    // `writeBuffer` with `submit` does not preserve order, so a shared buffer would
    // let a later body's write decide this body's matrix.
    device.queue.writeBuffer(res.uniformBuffer, 0, uniforms);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, res.bindGroup);
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
    for (const placeholder of sharedPlaceholders.values()) placeholder.destroy();
    placeholderRing.destroy();
    for (const res of bodies.values()) {
      res.uniformBuffer.destroy();
      // Both texture layers: the per-body placeholder overrides are textures this
      // renderer owns as much as the committed maps, so teardown frees them too.
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
