/**
 * texturedBodyRenderer — the shared textured-sphere renderer for every textured
 * body except Earth: the seven other major planets, the Moon, and the four
 * Galilean moons. Earth keeps its own renderer (its atmosphere/specular path
 * diverges); the twelve remaining bodies are the same lit, textured unit sphere
 * and share this one pipeline.
 *
 * ## Per-body resources = the single-uniform-clobber fix, by construction
 *
 * The bodies differ only in surface texture and per-frame MVP + lighting
 * uniforms, so a naive design would bind ONE uniform buffer and rewrite it
 * before each body's draw. That is exactly the `starRenderer` gap and the
 * documented WebGPU hazard: interleaving `queue.writeBuffer` with `queue.submit`
 * in one frame does NOT preserve order, so two bodies drawn from one mutated
 * buffer can both render with whichever matrix won the race. Instead each body
 * id owns its OWN uniform buffer + bind group in a `Map`; `draw` writes a body's
 * buffer immediately before that body's own indexed draw. A later body writes a
 * DIFFERENT buffer — no shared state for the race to corrupt. The cost is one
 * 112-byte buffer + one bind group per body (~12 of each), trivially cheap.
 *
 * ## Placeholder posture (visible-but-plain before the bitmap lands)
 *
 * A body's surface bitmap is fetched asynchronously by the proximity-gated
 * `bodyTextures` slot family. Rather than branch the fragment on a "has-texture"
 * flag, every body binds a real texture at all times: a per-kind 1×1 placeholder
 * until `setMap` swaps in the real map. So the geometry is a plain lit sphere
 * before the asset arrives, never black or absent.
 *
 * ## Per-kind sphere maps = the extension point (KIND_CFG)
 *
 * The sphere-map bindings are not hardcoded — they are derived from a `KIND_CFG`
 * table keyed by `TextureKind`. Today it holds ONE row (`surface` at binding 2),
 * so the layout, placeholders, and bind group are byte-identical to a hardcoded
 * single map. A later feature (an airless-body tangent-space `normal` map) adds
 * ONE row to that table and both the bind-group layout and every body's bind
 * group pick it up automatically — no second hardcoded branch. `setMap(id, kind,
 * bmp)` is the single per-kind upload entry.
 *
 * ## The ring binding is a real texture on every body (branch on data, not code)
 *
 * Binding 3 is the ring-alpha strip for Saturn's ring-on-planet shadow. Only
 * Saturn ships a real strip (via `setRingTexture`); every other body keeps a
 * shared 1×1 TRANSPARENT placeholder. Binding a real texture on all bodies keeps
 * ONE pipeline + ONE layout for the whole set — the fragment short-circuits on
 * `ringOuterRatio == 0` and never samples the placeholder. The alternative (two
 * pipelines, or a nullable binding) would fork the whole draw path on Saturn.
 *
 * ## Per-body mip generation
 *
 * `setMap` sizes the body texture with a full mip chain
 * (`mipLevelCount(w,h)` levels + `RENDER_ATTACHMENT` usage), uploads level 0,
 * and runs `generateMipChain` so the surface doesn't shimmer as the body shrinks
 * toward the sub-pixel glint handoff. The sampler is the first in the repo to
 * set `mipmapFilter: 'linear'`, consuming that chain.
 *
 * ## Pipeline state
 *
 * Matches `earthRenderer` / the `foreground:0` row: `rgba16float` colour +
 * `depth32float` depth (`depthWriteEnabled`, `depthCompare: 'less'`), opaque
 * replace, CCW front face + back-cull (matches `uvSphereMesh`'s outward
 * winding). Explicit bind-group layout (not `'auto'`) so texture swaps rebuild
 * bind groups against a stable layout — the `feedback_webgpu_auto_layout_trap`.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { TexturedBodyRenderer } from '../../../../@types/rendering/TexturedBodyRenderer';
import type { BodyTextureId } from '../../../../@types/data/BodyTextureId';
import type { TextureKind } from '../../../../@types/data/TextureKind';
import { uvSphereMesh } from '../../../../utils/math/uvSphereMesh';
import { generateMipChain, mipLevelCount } from '../../lib/generateMipChain';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import vsCode from '../../shaders/bodies/texturedBody/vertex.wesl?static';
import fsCode from '../../shaders/bodies/texturedBody/fragment.wesl?static';

/** UV-sphere tessellation — 48×24, shared with every sphere body renderer for a
 *  smooth silhouette at close range without overwhelming vertex throughput. */
const SEGMENTS = 48;
const RINGS = 24;

/** `TexturedBodyUniforms` is 112 bytes (28 f32): the 80-byte lit prefix + two
 *  ring ratios + two Minnaert limb params + camPosLocal vec3 + one pad float.
 *  Written from `packTexturedBodyUniforms`. */
const UNIFORM_BUFFER_SIZE = 112;

/**
 * Per-kind sphere-map config — THE EXTENSION POINT. Each row names a
 * `TextureKind`'s bind-group binding, GPU texture format, and 1×1 placeholder
 * texel; the bind-group layout, the per-kind placeholder textures, and every
 * body's bind group are all derived by iterating these rows. Today it holds ONE
 * row (`surface`), so the output is byte-identical to a hardcoded single surface
 * map at binding 2. A later feature adds e.g. a `normal` row and the whole path
 * — layout, placeholders, bind group, `setMap` — extends with no new branch.
 *
 * Bindings 0 (uniform), 1 (sampler), and 3 (ring) are fixed and hand-written;
 * only the sphere-map bindings live here.
 */
const KIND_CFG = {
  surface: { binding: 2, format: 'rgba8unorm-srgb', placeholder: [128, 128, 128, 255] },
} as const satisfies Partial<
  Record<
    TextureKind,
    { binding: number; format: GPUTextureFormat; placeholder: readonly [number, number, number, number] }
  >
>;

/** The `TextureKind`s that have a `KIND_CFG` row — the sphere maps this renderer
 *  binds. Narrowed to the config's own keys so iteration stays exhaustive. */
type SphereMapKind = keyof typeof KIND_CFG;
const SPHERE_MAP_KINDS = Object.keys(KIND_CFG) as SphereMapKind[];

/** Per-body GPU resources. Each body owns its uniform buffer + bind group so no
 *  shared uniform can be clobbered mid-frame. `maps` holds only the sphere maps a
 *  body has committed (a missing kind falls back to the shared placeholder);
 *  `ringTexture` is `null` while the body uses the shared ring placeholder. */
type BodyResources = {
  uniformBuffer: GPUBuffer;
  maps: Map<TextureKind, GPUTexture>;
  ringTexture: GPUTexture | null;
  bindGroup: GPUBindGroup;
};

export function createTexturedBodyRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
): TexturedBodyRenderer {
  // ── Geometry upload (positions + uvs, like earthRenderer) ─────────────────
  const mesh = uvSphereMesh(SEGMENTS, RINGS);
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
  // One 1×1 placeholder texture PER sphere-map kind (mid-grey for `surface`),
  // each in that kind's own format + texel — derived by iterating KIND_CFG so a
  // new kind gets its placeholder for free. A transparent 1×1 ring texture stands
  // in for every non-ringed body. Binding real textures at all times keeps the
  // fragment branch-free and the layout identical across the whole body set.
  const placeholderMaps = new Map<SphereMapKind, GPUTexture>();
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
    placeholderMaps.set(kind, placeholder);
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
  //            surface today) are derived from KIND_CFG. Binding 3: ring-alpha
  //            strip (real placeholder if none).
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
      cullMode: 'back',
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // ── Per-body resources ────────────────────────────────────────────────────
  const bodies = new Map<BodyTextureId, BodyResources>();

  // Build a bind group from a body's current resources, falling back to the
  // shared placeholders while a body texture / ring texture is unset. Called at
  // first reference and rebuilt on every texture swap against the stable layout.
  function buildBindGroup(
    res: Pick<BodyResources, 'uniformBuffer' | 'maps' | 'ringTexture'>,
  ): GPUBindGroup {
    return device.createBindGroup({
      label: 'texturedBody-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: res.uniformBuffer } },
        { binding: 1, resource: sampler },
        // One sphere-map entry per KIND_CFG row: the body's committed texture, or
        // that kind's shared placeholder while it is unset. Derived, not
        // hardcoded — a new kind binds here automatically.
        ...SPHERE_MAP_KINDS.map((kind) => ({
          binding: KIND_CFG[kind].binding,
          resource: (res.maps.get(kind) ?? placeholderMaps.get(kind)!).createView(),
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
      ringTexture: null,
      bindGroup: buildBindGroup({ uniformBuffer, maps: new Map(), ringTexture: null }),
    };
    bodies.set(bodyId, res);
    return res;
  }

  // ── setMap ────────────────────────────────────────────────────────────────
  //
  // Upload a body's map for one `TextureKind`, keyed by KIND_CFG for its binding
  // + format. The old single-map `setTexture` parameterised by kind: create the
  // sized texture, upload level 0 flipped, generate the mip chain, store into the
  // body's `maps`, rebuild the bind group. Only kinds with a KIND_CFG row are
  // valid; the slot machinery upstream only routes those.

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
    res.bindGroup = buildBindGroup(res);
  }

  // ── clearTexture ──────────────────────────────────────────────────────────
  //
  // The eviction inverse of `setMap`: free ALL of a body's sphere maps and rebind
  // the shared placeholders. The `bodyTextures` slot's onRelease calls this so a
  // body leaving its proximity radius actually releases its (up to ~135 MB) GPU
  // textures — the slot family's eviction premise, not a leak. The ring texture
  // and the per-body uniform buffer are left intact: the ring rides its OWN slot
  // key (freed by that slot's onRelease), and keeping the uniform buffer keeps
  // the body drawable-but-plain without a realloc on re-approach.

  function clearTexture(bodyId: BodyTextureId): void {
    const res = bodies.get(bodyId);
    // A body with no resident maps (only ever drew the placeholders) has nothing
    // to free — a no-op keeps onRelease honest without a residency check upstream.
    if (res === undefined || res.maps.size === 0) return;
    for (const texture of res.maps.values()) texture.destroy();
    res.maps.clear();
    res.bindGroup = buildBindGroup(res);
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
    res.bindGroup = buildBindGroup(res);
  }

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, bodyId: BodyTextureId, uniforms: Float32Array): void {
    const res = resourcesFor(bodyId);
    // Write THIS body's own uniform buffer immediately before its draw — no
    // shared buffer for a later body's write to race (see the module header).
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
    for (const placeholder of placeholderMaps.values()) placeholder.destroy();
    placeholderRing.destroy();
    for (const res of bodies.values()) {
      res.uniformBuffer.destroy();
      for (const texture of res.maps.values()) texture.destroy();
      res.ringTexture?.destroy();
    }
    bodies.clear();
  }

  const renderer: TexturedBodyRenderer = {
    label: 'texturedBodyRenderer',
    setMap,
    clearTexture,
    setRingTexture,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
