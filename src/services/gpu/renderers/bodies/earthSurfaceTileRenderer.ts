/**
 * earthSurfaceTileRenderer — one instanced indexed draw of the resident
 * virtual-texture surface patches (`cutSurfaceTiles`'s cut) over the base
 * globe: one shared template index buffer, one 80-byte `PatchInstance` per
 * patch, all geometry derived in `vertex.wesl`.
 *
 * Depth compare is `'nearer-or-equal'`, not `'nearer'`: this pipeline shares
 * the base globe's nominal radius, so ties must resolve in ITS favour. It
 * owns neither the tile atlas nor the base globe's material/night/cloud maps
 * — both arrive as views on every `draw` call.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type {
  EarthSurfaceTileRenderer,
  EarthSurfaceTileDrawArgs,
} from '../../../../@types/rendering/EarthSurfaceTileRenderer';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { IDENTITY_MAT3 } from '../../../../utils/math/identityMat3';
import { patchOriginRelEyeM } from '../../../../utils/scene/patchOriginRelEyeM';
import { surfacePatchIndices } from '../../../../utils/scene/surfacePatchIndices';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import vsCode from '../../shaders/bodies/earthSurfaceTile/vertex.wesl?static';
import fsCode from '../../shaders/bodies/earthSurfaceTile/fragment.wesl?static';
import {
  PATCH_INSTANCE_BYTES,
  SURFACE_TILE_UNIFORM_BYTES,
  writePatchInstance,
  writeSurfaceTileUniforms,
} from './earthSurfaceTileLayout';
import {
  EARTH_TILE_CROSSFADE_MS,
  HEIGHT_ATLAS_SLOTS_PER_ROW,
} from '../../../../data/bodies/earthTileParams';
import { HEIGHT_POSTS_PER_TILE } from '../../../../data/scene/heightTileFormat';

/**
 * @param resolution The template's `n`: it sizes the shared index buffer and
 *   reaches the vertex shader as `SurfaceTileUniforms.meshResolution`, which
 *   splits `vertex_index` into `(i, j)`. The two must be the same number.
 * @param reversedZ selects this slab's depth convention, resolved through
 *   `resolveDepthCompare` with intent `'nearer-or-equal'` (see the module header).
 */
export function createEarthSurfaceTileRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
  resolution: number,
): EarthSurfaceTileRenderer {
  // ── Samplers ──────────────────────────────────────────────────────────
  // baseSampler mirrors earthRenderer's whole-globe sampler (repeat u,
  // clamp v, trilinear — these views carry the base globe's own mip chain).
  const baseSampler = device.createSampler({
    label: 'earth-surface-tile-base-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
  });
  // atlasSampler mirrors earthRenderer's tileSampler: clamp both axes (only
  // guards the ATLAS TEXTURE's own edge — a resolved rect's edge, one slot
  // away from an unrelated tile's pixels, is guarded separately by the
  // fragment's own half-texel uv clamp, see fragment.wesl), single mip level.
  const atlasSampler = device.createSampler({
    label: 'earth-surface-tile-atlas-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // ── Shared template index buffer (every patch, every level) ──────────
  const indices = surfacePatchIndices(resolution);
  const indexCount = indices.length;
  const indexBuffer = device.createBuffer({
    label: 'earth-surface-tile-index-buffer',
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  // ── Bind group layout (explicit, not 'auto') ─────────────────────────
  // Binding 2 was the per-corner vertex array P6 deleted; the height atlas
  // took the free slot. 3–9 keep their numbers so the fragment's bindings
  // don't move (they need not be contiguous).
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'earth-surface-tile-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'read-only-storage', minBindingSize: PATCH_INSTANCE_BYTES },
      },
      // r32float read with `textureLoad` from BOTH stages (vertex displaces,
      // fragment takes its normal from the cell): `sampleType: 'float'` fails
      // validation unless `float32-filterable` is requested, and `device.ts`
      // does not request it.
      {
        binding: 2,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'unfilterable-float' },
      },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      // 8 was the whole-globe normal map, now the base globe's alone: a patch
      // takes its normal from the height field, and compositing both would
      // shade the same relief twice (spec §7.2).
      { binding: 9, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'earthSurfaceTile.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'earthSurfaceTile.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'earth-surface-tile-pipeline',
    layout: device.createPipelineLayout({
      label: 'earth-surface-tile-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    // Positions are derived from the instance record — no vertex buffers.
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [{ format: targetFormat }], // opaque replace, alpha=1
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw', // matches surfacePatchIndices' east x north = outward winding
      cullMode: 'back',
    },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      // See the module header: draws over the base globe at the same
      // nominal radius, so ties must resolve in THIS pipeline's favour.
      depthCompare: resolveDepthCompare('nearer-or-equal', reversedZ),
    },
  });

  // ── Uniform buffer (one record per draw call) ────────────────────────
  const uniformBuffer = device.createBuffer({
    label: 'earth-surface-tile-uniform-buffer',
    size: SURFACE_TILE_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformScratch = new ArrayBuffer(SURFACE_TILE_UNIFORM_BYTES);
  const uniformView = new DataView(uniformScratch);

  // ── Per-frame instance records (grow-only, in TILE count) ────────────
  let patchBuffer: GPUBuffer | null = null;
  let patchScratch = new ArrayBuffer(0);
  let patchScratchView = new DataView(patchScratch);

  function ensureCapacity(tileCount: number): void {
    const bytes = tileCount * PATCH_INSTANCE_BYTES;
    if (patchBuffer !== null && patchScratch.byteLength >= bytes) return;
    patchBuffer?.destroy();
    patchBuffer = device.createBuffer({
      label: 'earth-surface-tile-patch-instances',
      size: bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    patchScratch = new ArrayBuffer(bytes);
    patchScratchView = new DataView(patchScratch);
  }

  /**
   * Caller invariant this pipeline relies on but does not assert: `tiles`
   * is only ever non-empty while the tile subsystem is engaged, which is
   * altitude-gated (near Earth). The vertex shader's local-normal
   * reconstruction (`vertex.wesl`'s `toCentreLocal`) is f32-safe only
   * under that invariant — a far-camera call would silently flatten every
   * drawn tile's shading normal toward one direction rather than error.
   */
  function draw(pass: GPURenderPassEncoder, args: EarthSurfaceTileDrawArgs): void {
    const {
      tiles,
      eyeRelBodyM,
      radiusM,
      vp,
      sunDirLocal,
      roughnessBase,
      f0,
      sunIrradiance,
      ambientLight,
      oceanRoughness,
      cloudShadowStrength,
      cloudShellRadius,
      debugLodOverlay,
      maxSkirtDepthM,
      surfaceAtlasView,
      heightAtlasView,
      materialView,
      nightView,
      cloudsView,
    } = args;
    const tileCount = tiles.length;
    if (tileCount === 0) return;

    ensureCapacity(tileCount);

    // Sampled ONCE per draw call (== once per frame; `earthPass` calls
    // `draw` at most once), never per tile — every tile's fade weight must
    // read the same instant, or tiles that upload microseconds apart would
    // visibly desync. REAL time: a fade must run even while the sim clock
    // is paused or scaled (see `EARTH_TILE_CROSSFADE_MS`'s doc comment).
    const nowMs = performance.now();

    for (let i = 0; i < tileCount; i++) {
      const tile = tiles[i]!;

      // `fallback === null` means no deeper resident ancestor: the CPU-side
      // encoding is fadeWeight forced to 1 with the fallback rect aliased to
      // the primary one (see io.wesl's `PatchInstance` doc) — mix() at weight 1
      // returns the primary sample exactly, so the fragment never needs to
      // branch on "is there a fallback".
      const fallback = tile.albedo.fallback ?? tile.albedo;
      const fadeWeight =
        tile.albedo.fallback === null
          ? 1
          : Math.min(1, Math.max(0, (nowMs - tile.albedo.readyAtMs) / EARTH_TILE_CROSSFADE_MS));

      const origin = patchOriginRelEyeM(tile.anchor, radiusM, eyeRelBodyM);
      // The leaf's sub-rect of the slot it inherited (R14), not the slot
      // itself: at `levelDelta` 0 `originPosts` is [0, 0] and the two agree.
      const slotOriginX = (tile.height.slot % HEIGHT_ATLAS_SLOTS_PER_ROW) * HEIGHT_POSTS_PER_TILE;
      const slotOriginY =
        Math.floor(tile.height.slot / HEIGHT_ATLAS_SLOTS_PER_ROW) * HEIGHT_POSTS_PER_TILE;
      writePatchInstance(
        patchScratchView,
        i * PATCH_INSTANCE_BYTES,
        origin[0],
        origin[1],
        origin[2],
        fadeWeight,
        tile.anchor.lon0Rad,
        tile.anchor.lat0Rad,
        tile.anchor.dLonRad,
        tile.anchor.dLatRad,
        tile.albedo.atlasUvOrigin[0],
        tile.albedo.atlasUvOrigin[1],
        tile.albedo.atlasUvScale[0],
        tile.albedo.atlasUvScale[1],
        fallback.atlasUvOrigin[0],
        fallback.atlasUvOrigin[1],
        fallback.atlasUvScale[0],
        fallback.atlasUvScale[1],
        slotOriginX + tile.height.originPosts[0],
        slotOriginY + tile.height.originPosts[1],
        tile.edgeCoarser[0] |
          (tile.edgeCoarser[1] << 1) |
          (tile.edgeCoarser[2] << 2) |
          (tile.edgeCoarser[3] << 3),
        (HEIGHT_POSTS_PER_TILE - 1) >> tile.height.levelDelta,
      );
    }

    device.queue.writeBuffer(patchBuffer!, 0, patchScratch, 0, tileCount * PATCH_INSTANCE_BYTES);

    writeSurfaceTileUniforms(
      uniformView,
      vp,
      // Body-fixed frame throughout — the shader's rotCol0/1/2 slots are
      // inert at identity, kept only for the struct's parity-tested layout.
      IDENTITY_MAT3,
      radiusM,
      resolution,
      eyeRelBodyM,
      sunDirLocal,
      roughnessBase,
      f0,
      sunIrradiance,
      ambientLight,
      oceanRoughness,
      cloudShadowStrength,
      cloudShellRadius,
      debugLodOverlay,
      maxSkirtDepthM,
    );
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);

    // Bind group rebuilt every draw: the storage buffer may have grown,
    // and the texture views are supplied fresh per call (this renderer owns
    // neither the atlas nor the base globe's other maps — see the header).
    const bindGroup = device.createBindGroup({
      label: 'earth-surface-tile-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        {
          binding: 1,
          resource: { buffer: patchBuffer!, size: tileCount * PATCH_INSTANCE_BYTES },
        },
        { binding: 2, resource: heightAtlasView },
        { binding: 3, resource: baseSampler },
        { binding: 4, resource: atlasSampler },
        { binding: 5, resource: surfaceAtlasView },
        { binding: 6, resource: materialView },
        { binding: 7, resource: nightView },
        { binding: 9, resource: cloudsView },
      ],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount, tileCount);
  }

  function destroy(): void {
    patchBuffer?.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
  }

  const renderer: EarthSurfaceTileRenderer = {
    label: 'earthSurfaceTileRenderer',
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
