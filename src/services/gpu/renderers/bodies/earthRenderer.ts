/**
 * earthRenderer — true-scale, texture-mapped Earth drawn into the opaque
 * near-field foreground target.
 *
 * The geometry is a cube-sphere (`cubeSphereMesh`'s six level-0 faces
 * concatenated into one indexed mesh) rather than the shared `uvSphereMesh`: a
 * UV sphere collapses every longitude into a single vertex at each pole, so
 * the cap triangles degenerate and the equirectangular map puckers there. The
 * cube-sphere stays pole-pinch-free, and its `(face, level, tileX, tileY)`
 * parameters set up a future terrain quadtree without a mesh swap. Shading is
 * the shared `lib/pbr.wesl` `pbrDirect` microfacet core plus the shared
 * `AMBIENT` floor; the uniform layout is `lib/sphere.wesl`'s
 * `EarthSurfaceUniforms` (128 bytes), packed CPU-side by
 * `packEarthSurfaceUniforms`.
 *
 * **Precondition — draw at most once per frame:** the uniform buffer is a
 * single non-dynamic slot; a second same-frame `draw` with different uniforms
 * would race `queue.writeBuffer` against the pending `queue.submit`. Earth is
 * a single body, so this holds by construction.
 *
 * ### Layered textures, oldest arrival wins nothing
 *
 * Each map (`surface`, `material`, `night`, `normal`, `clouds`) has a 1×1
 * placeholder created at construction (format from `isLinearTextureKind`, so a
 * placeholder can never disagree with the real map that later shadows it) —
 * the fragment always samples something, so Earth is visible-but-plain before
 * any bitmap lands rather than black or absent. `setMap` uploads the real
 * bitmap into a separate `committed` map; `setPlaceholderMap` can additionally
 * upgrade the 1×1 stand-in to a cropped tile of the shared low-res body atlas.
 * Because the two live in different maps, neither setter can free the other's
 * texture — a low-res tile landing after the hi-res map can't clobber it, and
 * no commit path has to ask which arrived first.
 *
 * ### uv / texture orientation
 *
 * `cubeSphereMesh` emits v south-to-north; bitmaps upload with `flipY: true` so
 * texture v=0 matches. u needs no remap either — see `earth/fragment.wesl`'s
 * uv-orientation note for the full derivation.
 *
 * ### Bind group layout
 *
 * Explicit `bindGroupLayout`, never `layout: 'auto'`: `setMap` rebuilds the
 * bind group against a stable layout object when a texture swaps, and an auto
 * layout does not cross pipelines (`feedback_webgpu_auto_layout_trap`).
 * Binding 0 is the uniform (both stages); 1 is the shared sampler; 2–6 are the
 * per-kind textures (from `KIND_CFG`); 7–9 are the surface virtual texture's
 * page table, atlas, and its own sampler.
 *
 * ### The surface virtual texture (bindings 7–9)
 *
 * `earthTileSubsystem` owns a page table + atlas this renderer does not
 * allocate; the fragment blends it on top of the two owned layers, and every
 * failure path (no manifest, no atlas, a 404 on every tile) lands on the
 * picture Earth draws without it. Bindings 7–8 get 1×1 placeholders in the
 * same spirit as the per-kind ones, since the bind-group layout is fixed at
 * pipeline creation while the atlas (67 MB) allocates only once the tile
 * subsystem first engages. Binding 9 is a SECOND sampler: the atlas needs
 * `clamp-to-edge` on both axes (a slot's neighbour in the atlas is an
 * unrelated tile, so `repeat` would bleed a stranger across the seam) and no
 * mipmap filter (one atlas level; sampled with `textureSampleLevel`).
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { EarthRenderer } from '../../../../@types/rendering/EarthRenderer';
import type { AtlasTileRect } from '../../../../@types/data/AtlasTileRect';
import type { TextureKind } from '../../../../@types/data/TextureKind';
import { cubeSphereMesh } from '../../../../utils/math/cubeSphereMesh';
import { generateMipChain, mipLevelCount } from '../../lib/generateMipChain';
import { isLinearTextureKind } from '../../../../utils/scene/isLinearTextureKind';
import { EARTH_SURFACE_UNIFORM_FLOATS } from '../../../../utils/gpu/packEarthSurfaceUniforms';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import vsCode from '../../shaders/bodies/earth/vertex.wesl?static';
import fsCode from '../../shaders/bodies/earth/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';

/** Per-face grid subdivision: 6 × 48² ≈ 13.8k quads total, trivial for one
 *  hero-body draw. Fixed subdivision, no runtime LOD — a future terrain LOD
 *  can subdivide per-tile via the generator's (face, level, tileX, tileY)
 *  addressing without touching this build. */
const CUBESPHERE_FACE_RESOLUTION = 48;

/** `EarthSurfaceUniforms` is 128 bytes (32 f32) — see `lib/sphere.wesl` for the
 *  full byte layout. Size derives from the packer's f32 count so this can
 *  never drift from the layout it writes. Written from
 *  `packEarthSurfaceUniforms`. */
const UNIFORM_BUFFER_SIZE = EARTH_SURFACE_UNIFORM_FLOATS * 4;

/**
 * Per-kind map config: ties each `TextureKind` to a bind-group binding and a
 * 1×1 placeholder texel. The bind-group layout, placeholder textures, and bind
 * group are all derived by iterating these rows, so a binding number exists
 * once rather than at three separate sites. Mirrors `texturedBodyRenderer`'s
 * `KIND_CFG`.
 *
 * FORMAT is not a row: it comes from `isLinearTextureKind(kind)`, the same
 * predicate `setMap` uses, so a placeholder can never contradict the real map.
 *
 * Typed as a total `Record<TextureKind, …>`: a new kind is a compile error
 * here until it gets a binding, which the fragment shader needs anyway.
 */
const KIND_CFG = {
  // Mid-blue, opaque — a visible-but-plain sphere until the Blue Marble lands.
  surface: { binding: 2, placeholder: [70, 110, 160, 255] },
  // roughness=1 (R), ocean mask=0 (G) → matte, glint-free until the map lands.
  material: { binding: 3, placeholder: [255, 0, 0, 255] },
  // Black → no emissive city-lights term; the dark side is lit only by `AMBIENT`.
  night: { binding: 4, placeholder: [0, 0, 0, 255] },
  // Flat tangent-space normal: RG=128 → nxy=(0,0), so nz reconstructs to 1 → the
  // shading normal equals the geometric normal → no relief until the map lands.
  normal: { binding: 5, placeholder: [128, 128, 255, 255] },
  // Transparent → cloud alpha reads 0, so the surface fragment's ground shadow
  // and night occlusion (both keyed on cloud alpha) stay inert until the Blue
  // Marble cloud map lands.
  clouds: { binding: 6, placeholder: [0, 0, 0, 0] },
} as const satisfies Record<
  TextureKind,
  { binding: number; placeholder: readonly [number, number, number, number] }
>;

/** Every `TextureKind`, in `KIND_CFG` declaration order — the iteration order for
 *  the layout entries, the placeholder textures, and the bind group. */
const MAP_KINDS = Object.keys(KIND_CFG) as TextureKind[];

/** The surface virtual texture's three bindings — siblings of `KIND_CFG` rather
 *  than rows in it (see the module header): each is a single, differently-typed
 *  resource, so there is no shared row shape to invent. */
const TILE_PAGE_TABLE_BINDING = 7;
const TILE_ATLAS_BINDING = 8;
const TILE_SAMPLER_BINDING = 9;

/** Concatenate the six whole level-0 cube-sphere faces into one indexed mesh:
 *  sum vertex/index counts, then copy each face's positions/uvs/tangents
 *  end-to-end and re-base its indices by the running vertex count. Sizes
 *  aren't known up-front (per-triangle seam duplication appends a variable
 *  handful of vertices), hence the two-pass measure-then-fill. */
function concatCubeSphereFaces(resolution: number): {
  positions: Float32Array;
  uvs: Float32Array;
  tangents: Float32Array;
  indices: Uint32Array;
} {
  const faces: ReturnType<typeof cubeSphereMesh>[] = [];
  for (let face = 0; face < 6; face++) {
    faces.push(cubeSphereMesh(face, 0, 0, 0, resolution));
  }

  let totalPos = 0;
  let totalUv = 0;
  let totalTan = 0;
  let totalIdx = 0;
  for (const f of faces) {
    totalPos += f.positions.length;
    totalUv += f.uvs.length;
    totalTan += f.tangents.length;
    totalIdx += f.indices.length;
  }

  const positions = new Float32Array(totalPos);
  const uvs = new Float32Array(totalUv);
  const tangents = new Float32Array(totalTan);
  const indices = new Uint32Array(totalIdx);

  let posOff = 0;
  let uvOff = 0;
  let tanOff = 0;
  let idxOff = 0;
  let vertexBase = 0; // running vertex count = index rebase offset for this face
  for (const f of faces) {
    positions.set(f.positions, posOff);
    uvs.set(f.uvs, uvOff);
    tangents.set(f.tangents, tanOff);
    for (let k = 0; k < f.indices.length; k++) {
      indices[idxOff + k] = (f.indices[k] as number) + vertexBase;
    }
    posOff += f.positions.length;
    uvOff += f.uvs.length;
    tanOff += f.tangents.length;
    idxOff += f.indices.length;
    vertexBase += f.positions.length / 3;
  }

  return { positions, uvs, tangents, indices };
}

/**
 * @param reversedZ selects this slab's depth convention (single-sourced in
 *   `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
 *   `true` ⇒ reversed-Z greater-wins. Resolved through `resolveDepthCompare`.
 */
export function createEarthRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
): EarthRenderer {
  // ── Geometry upload ───────────────────────────────────────────────────────
  //
  // Positions (f32x3 @ slot 0), uvs (f32x2 @ slot 1), and tangents (f32x3 @
  // slot 2) go into three separate VBOs mirroring the mesh's three output
  // arrays with no repack. Tangents (the mesh's unit +u=east direction) feed
  // the fragment's tangent-space normal mapping.
  const mesh = concatCubeSphereFaces(CUBESPHERE_FACE_RESOLUTION);
  const indexCount = mesh.indices.length;

  const positionBuffer = device.createBuffer({
    label: 'earth-position-vbo',
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

  const uvBuffer = device.createBuffer({
    label: 'earth-uv-vbo',
    size: mesh.uvs.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(uvBuffer, 0, mesh.uvs);

  const tangentBuffer = device.createBuffer({
    label: 'earth-tangent-vbo',
    size: mesh.tangents.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(tangentBuffer, 0, mesh.tangents);

  const indexBuffer = device.createBuffer({
    label: 'earth-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  // ── Uniform buffer (one Earth-surface record) ─────────────────────────────
  //
  // A single Earth is drawn per frame, so one 128-byte `EarthSurfaceUniforms`
  // block suffices — no multi-slot dynamic-offset buffer needed.
  const uniformBuffer = device.createBuffer({
    label: 'earth-uniform-buffer',
    size: UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Sampler ───────────────────────────────────────────────────────────────
  //
  // `mipmapFilter: 'linear'` trilinearly blends the mip chain `setMap` builds,
  // so the surface stops shimmering as Earth shrinks toward the sub-pixel
  // glint handoff. `repeat` on u lets the duplicated seam column blend across
  // the longitude wrap; `clamp-to-edge` on v avoids sampling past the poles.
  const sampler = device.createSampler({
    label: 'earth-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
  });

  // The tile atlas cannot share the sampler above: `repeat` on u is right for
  // an equirectangular whole-globe map and wrong for an atlas, where the texel
  // past a slot's edge belongs to an unrelated tile — hence `clamp-to-edge` on
  // both axes. The atlas has a single mip level, so `mipmapFilter` stays at its
  // 'nearest' default; the fragment samples with `textureSampleLevel`.
  const tileSampler = device.createSampler({
    label: 'earth-tile-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // ── The two per-kind texture layers ───────────────────────────────────────
  //
  // `placeholders` holds one 1×1 texture per kind, alive from construction to
  // teardown. `committed` holds the real map once `setMap` uploads one, and
  // `buildBindGroup` prefers it — keeping the placeholder alive underneath
  // rather than overwriting a single cell is what makes arrival order
  // irrelevant (see the module header).
  const placeholders = new Map<TextureKind, GPUTexture>();
  for (const kind of MAP_KINDS) {
    const placeholder = device.createTexture({
      label: `earth-placeholder-${kind}`,
      size: [1, 1, 1],
      format: isLinearTextureKind(kind) ? 'rgba8unorm' : 'rgba8unorm-srgb',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: placeholder },
      new Uint8Array(KIND_CFG[kind].placeholder),
      { bytesPerRow: 4, rowsPerImage: 1 },
      [1, 1, 1],
    );
    placeholders.set(kind, placeholder);
  }

  const committed = new Map<TextureKind, GPUTexture>();

  // ── Virtual-texture placeholders ──────────────────────────────────────────
  //
  // Bindings 7 and 8 must be satisfiable from construction, because the layout
  // is fixed at pipeline creation while the tile subsystem allocates nothing
  // until the virtual texture first engages (see the module header).
  //
  // The page table is `rgba8uint` — slot column, slot row, level, blend
  // weight, read with `textureLoad`, never filtered or normalised. All-zero is
  // the identity: weight 0 means "sample the base". WebGPU zero-initialises a
  // fresh texture, but the zeros are written explicitly here because that
  // value is load-bearing rather than incidental.
  const placeholderPageTable = device.createTexture({
    label: 'earth-placeholder-tile-page-table',
    size: [1, 1, 1],
    format: 'rgba8uint',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: placeholderPageTable },
    new Uint8Array([0, 0, 0, 0]),
    { bytesPerRow: 4, rowsPerImage: 1 },
    [1, 1, 1],
  );

  // Same sRGB format as the real atlas (`earthTileSubsystem`'s `ATLAS_FORMAT`).
  // Its contents are unreachable while the page table reads weight 0, so the
  // texel value is arbitrary; transparent black also stays inert under any
  // blend that ignores the weight.
  const placeholderTileAtlas = device.createTexture({
    label: 'earth-placeholder-tile-atlas',
    size: [1, 1, 1],
    format: 'rgba8unorm-srgb',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: placeholderTileAtlas },
    new Uint8Array([0, 0, 0, 0]),
    { bytesPerRow: 4, rowsPerImage: 1 },
    [1, 1, 1],
  );

  // The tile subsystem's views once it has engaged, `null` before. Views
  // rather than textures: this renderer does not own either resource and must
  // never destroy them.
  let tilePageTableView: GPUTextureView | null = null;
  let tileAtlasView: GPUTextureView | null = null;

  // ── Bind group layout (explicit, not 'auto') ──────────────────────────────
  //
  // See the module header for why. Binding 0: uniform, both stages. Binding 1:
  // shared sampler. Bindings 2–6: the map textures (from `KIND_CFG`). Binding
  // 7: the page table, `sampleType: 'uint'` (integer data, `textureLoad` only —
  // the same rule that keeps normal maps off `-srgb`). Binding 8: the tile
  // atlas, filterable float. Binding 9: the tile sampler.
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'earth-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
      ...MAP_KINDS.map((kind) => ({
        binding: KIND_CFG[kind].binding,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' as const },
      })),
      {
        binding: TILE_PAGE_TABLE_BINDING,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'uint' as const },
      },
      {
        binding: TILE_ATLAS_BINDING,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' as const },
      },
      {
        binding: TILE_SAMPLER_BINDING,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' as const },
      },
    ],
  });

  // Resolve every map binding as committed-over-placeholder; the two
  // virtual-texture bindings resolve the same way one layer shallower (the
  // subsystem's view once engaged, otherwise the 1×1 stand-in).
  function buildBindGroup(): GPUBindGroup {
    return device.createBindGroup({
      label: 'earth-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: sampler },
        ...MAP_KINDS.map((kind) => ({
          binding: KIND_CFG[kind].binding,
          resource: (committed.get(kind) ?? placeholders.get(kind)!).createView(),
        })),
        {
          binding: TILE_PAGE_TABLE_BINDING,
          resource: tilePageTableView ?? placeholderPageTable.createView(),
        },
        {
          binding: TILE_ATLAS_BINDING,
          resource: tileAtlasView ?? placeholderTileAtlas.createView(),
        },
        { binding: TILE_SAMPLER_BINDING, resource: tileSampler },
      ],
    });
  }
  let bindGroup = buildBindGroup();

  // `createShaderModuleWithDevLog` prints the linked WGSL + getCompilationInfo
  // errors in dev so a WESL-import failure is diagnosable.
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'earth.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'earth.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'earth-pipeline',
    layout: device.createPipelineLayout({
      label: 'earth-pipeline-layout',
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
        {
          arrayStride: 12, // 3 × f32 tangent (unit +u=east)
          attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x3' }],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // No blend descriptor = opaque replace; the fragment emits alpha=1
          // and the foreground composite blends the whole layer.
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw', // CCW = outward-facing (matches cubeSphereMesh winding)
      cullMode: 'back', // discard inward-facing (inner-surface) triangles
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', reversedZ),
    },
  });

  function setMap(kind: TextureKind, bitmap: ImageBitmap): void {
    // sRGB colour (surface/night/clouds) samples through `rgba8unorm-srgb` so
    // the hardware de-gammas on read; linear-packed data (material/normal)
    // samples through plain `rgba8unorm` so its numeric channels are read raw.
    // `isLinearTextureKind` is the single home for that axis, shared with the
    // fetcher's decode path and the filename helper.
    const format: GPUTextureFormat = isLinearTextureKind(kind) ? 'rgba8unorm' : 'rgba8unorm-srgb';
    const levels = mipLevelCount(bitmap.width, bitmap.height);
    const fresh = device.createTexture({
      label: `earth-${kind}`,
      size: [bitmap.width, bitmap.height, 1],
      format,
      mipLevelCount: levels,
      // RENDER_ATTACHMENT is required: generateMipChain renders each level
      // below 0 as a downsample pass.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // flipY:true so texture v=0 is the image's bottom (south) row, matching
    // the mesh's south-first v. The material map is co-registered with the
    // albedo, so it takes the same flip.
    device.queue.copyExternalImageToTexture({ source: bitmap, flipY: true }, { texture: fresh }, [
      bitmap.width,
      bitmap.height,
      1,
    ]);
    generateMipChain(device, fresh);
    // Retire ONLY a prior committed texture of this kind — never the
    // placeholder, which stays alive under the committed layer for the whole
    // renderer lifetime (the out-of-order-arrival protection: no arrival order
    // can leave a binding pointing at a destroyed texture).
    committed.get(kind)?.destroy();
    committed.set(kind, fresh);
    bindGroup = buildBindGroup();
  }

  /**
   * Upgrade ONE kind's stand-in from its 1×1 to a tile of the shared low-res
   * body atlas — structurally `setMap`, except the texture lands in
   * `placeholders` rather than `committed` (so a committed hi-res map shadows
   * it whichever order the two arrive in), and only `rect` of the source
   * bitmap is copied.
   */
  function setPlaceholderMap(kind: TextureKind, atlas: ImageBitmap, rect: AtlasTileRect): void {
    const format: GPUTextureFormat = isLinearTextureKind(kind) ? 'rgba8unorm' : 'rgba8unorm-srgb';
    const levels = mipLevelCount(rect.w, rect.h);
    const fresh = device.createTexture({
      label: `earth-placeholder-${kind}`,
      size: [rect.w, rect.h, 1],
      format,
      mipLevelCount: levels,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    // `origin` and `flipY` INTERACT: `origin` is the top-left corner of the
    // source sub-region in UNFLIPPED source coordinates (unaffected by
    // `flipY` — WebGPU §GPUCopyExternalImageSourceInfo), then `flipY: true`
    // applies to the SELECTED REGION alone, so the tile lands with the same
    // orientation a standalone `setMap` upload of that image would have. The
    // mock device rasterises nothing, so a wrong-row crop here is green in CI
    // and visibly wrong on screen — this is the one interaction no test catches.
    device.queue.copyExternalImageToTexture(
      { source: atlas, origin: { x: rect.x, y: rect.y }, flipY: true },
      { texture: fresh },
      [rect.w, rect.h, 1],
    );
    generateMipChain(device, fresh);
    // Retire ONLY the prior PLACEHOLDER for this kind, never the committed map
    // — mirror image of `setMap`'s rule; there is no `clearMap` and nothing is
    // ever evicted.
    placeholders.get(kind)?.destroy();
    placeholders.set(kind, fresh);
    bindGroup = buildBindGroup();
  }

  /**
   * Point bindings 7 and 8 at the tile subsystem's page table and atlas in
   * place of the 1×1 stand-ins, and rebuild the bind group. Call on the
   * transition, not per frame: `getTileResources()` is stable by identity once
   * it stops returning `null`, so rebuilding every frame would be pure waste.
   */
  function setTileResources(pageTable: GPUTextureView, atlas: GPUTextureView): void {
    tilePageTableView = pageTable;
    tileAtlasView = atlas;
    bindGroup = buildBindGroup();
  }

  function draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void {
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setVertexBuffer(1, uvBuffer);
    pass.setVertexBuffer(2, tangentBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint32');
    pass.drawIndexed(indexCount);
  }

  function destroy(): void {
    positionBuffer.destroy();
    uvBuffer.destroy();
    tangentBuffer.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
    // Both layers: the committed maps and the placeholders that outlived them
    // — neither setter frees the other's layer, so teardown is the only place
    // both are released.
    for (const texture of committed.values()) texture.destroy();
    for (const placeholder of placeholders.values()) placeholder.destroy();
    committed.clear();
    placeholders.clear();
    // The virtual texture's own stand-ins. Their real counterparts are NOT
    // released here: `earthTileSubsystem` allocated the page table and the
    // atlas and destroys them on its own teardown.
    placeholderPageTable.destroy();
    placeholderTileAtlas.destroy();
    tilePageTableView = null;
    tileAtlasView = null;
  }

  const renderer: EarthRenderer = {
    label: 'earthRenderer',
    setMap,
    setPlaceholderMap,
    setTileResources,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
