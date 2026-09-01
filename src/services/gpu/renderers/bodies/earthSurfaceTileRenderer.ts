/**
 * earthSurfaceTileRenderer — instanced draw of the resident virtual-texture
 * surface patches (Task 2's `SurfaceCutTile` cut), drawn directly over the
 * base globe at the same nominal unit-sphere radius. Byte layout + f64
 * precision derivation carry a longer header on that basis (see io.wesl /
 * vertex.wesl, which this file is the CPU twin of).
 *
 * Different tiles' baked meshes are topologically identical but
 * geometrically distinct, so — unlike `starCatalogRenderer`'s billboards —
 * they cannot share one vertex buffer via real instancing. Each cut tile's
 * mesh is instead EXPANDED (through its own `indices`, never drawn indexed)
 * into a flat, per-frame `array<TileVertex>`, concatenated at `tileSlot *
 * VERTS_PER_TILE`; a parallel `array<NodeParams>` carries placement +
 * resolved atlas rect. One `pass.draw(VERTS_PER_TILE * tileCount)` reads
 * both via `@builtin(vertex_index)` alone — see `vertex.wesl`.
 *
 * `originRelCamM` is composed in native JS `number` (f64) arithmetic here and
 * narrowed to f32 only at the final `DataView` write, mirroring
 * `composeBodySlabMvp`'s discipline; `camPosRelBodyM` is the pose seam's own
 * `eyeRelBodyM`, already in that same frame -- no further compose needed.
 * `vertex.wesl` derives why that keeps the reconstructed local normal
 * f32-safe with no separate origin-direction field. Both are body-fixed-axes
 * quantities now, not world-axes: the body-slab pose seam (`bodyRelativePose`)
 * already rotated the camera into Earth's own fixed frame, the SAME frame
 * `tile.originLocal`/the baked mesh live in, so no orientation rotation is
 * applied here -- `SurfaceTileUniforms.rotCol0/1/2` are fed the identity
 * (kept only for the struct's parity-tested byte layout).
 *
 * Depth compare is `'nearer-or-equal'`, not `'nearer'`: this pipeline
 * shares the base globe's nominal radius, so ties must resolve in ITS
 * favour (Task 5 draws it after the base globe).
 *
 * Owns neither the tile atlas nor the base globe's material/night/normal/
 * cloud maps — both arrive as views on every `draw` call.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type {
  EarthSurfaceTileRenderer,
  EarthSurfaceTileDrawArgs,
} from '../../../../@types/rendering/EarthSurfaceTileRenderer';
import type { SurfaceTileMeshCache } from '../../resources/surfaceTileMeshCache';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { IDENTITY_MAT3 } from '../../../../utils/math/identityMat3';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import vsCode from '../../shaders/bodies/earthSurfaceTile/vertex.wesl?static';
import fsCode from '../../shaders/bodies/earthSurfaceTile/fragment.wesl?static';
import {
  NODE_PARAMS_BYTES,
  TILE_VERTEX_BYTES,
  SURFACE_TILE_UNIFORM_BYTES,
  writeSurfaceTileNodeParams,
  writeTileVertex,
  writeSurfaceTileUniforms,
} from './earthSurfaceTileLayout';
import { EARTH_TILE_CROSSFADE_MS } from '../../../../data/bodies/earthTileParams';

/**
 * @param resolution The mesh grid resolution `meshCache` bakes at — MUST
 *   equal the value `meshCache` was constructed with (`(resolution+1)^2`
 *   unique vertices / `resolution^2*6` indices per tile). Fixes
 *   `VERTS_PER_TILE`; never independently hardcoded (Task 5 owns the one
 *   shared constant both call sites read).
 * @param reversedZ selects this slab's depth convention, resolved through
 *   `resolveDepthCompare` with intent `'nearer-or-equal'` (see the module header).
 */
export function createEarthSurfaceTileRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
  meshCache: SurfaceTileMeshCache,
  resolution: number,
): EarthSurfaceTileRenderer {
  const vertsPerTile = resolution * resolution * 6;

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

  // ── Bind group layout (explicit, not 'auto') ─────────────────────────
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
        buffer: { type: 'read-only-storage', minBindingSize: NODE_PARAMS_BYTES },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'read-only-storage', minBindingSize: TILE_VERTEX_BYTES },
      },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
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
    // Records vertex-pulled from storage buffers — no vertex buffers.
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [{ format: targetFormat }], // opaque replace, alpha=1
    },
    primitive: {
      topology: 'triangle-list',
      frontFace: 'ccw', // matches bakeSurfaceTileMesh's east x north = outward winding
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

  // ── Per-frame storage buffers (grow-only capacity, in TILE count) ────
  let nodeParamsBuffer: GPUBuffer | null = null;
  let tileVertsBuffer: GPUBuffer | null = null;
  let tileCapacity = 0;

  function ensureDrawBuffers(tileCount: number): void {
    if (nodeParamsBuffer !== null && tileCapacity >= tileCount) return;
    nodeParamsBuffer?.destroy();
    tileVertsBuffer?.destroy();
    tileCapacity = tileCount;
    nodeParamsBuffer = device.createBuffer({
      label: 'earth-surface-tile-node-params',
      size: tileCount * NODE_PARAMS_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    tileVertsBuffer = device.createBuffer({
      label: 'earth-surface-tile-verts',
      size: tileCount * vertsPerTile * TILE_VERTEX_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  }

  // ── CPU pack scratch (reused, grown as the frame's tile count grows) ─
  let nodeScratch = new ArrayBuffer(0);
  let nodeScratchView = new DataView(nodeScratch);
  let vertexScratch = new ArrayBuffer(0);
  let vertexScratchView = new DataView(vertexScratch);

  function ensureScratch(tileCount: number): void {
    const nodeBytes = tileCount * NODE_PARAMS_BYTES;
    if (nodeScratch.byteLength < nodeBytes) {
      nodeScratch = new ArrayBuffer(nodeBytes);
      nodeScratchView = new DataView(nodeScratch);
    }
    const vertexBytes = tileCount * vertsPerTile * TILE_VERTEX_BYTES;
    if (vertexScratch.byteLength < vertexBytes) {
      vertexScratch = new ArrayBuffer(vertexBytes);
      vertexScratchView = new DataView(vertexScratch);
    }
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
      frame,
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
      surfaceAtlasView,
      materialView,
      nightView,
      normalView,
      cloudsView,
    } = args;
    const tileCount = tiles.length;
    if (tileCount === 0) return;

    ensureScratch(tileCount);

    // Sampled ONCE per draw call (== once per frame; `earthLayer` calls
    // `draw` at most once), never per tile — every tile's fade weight must
    // read the same instant, or tiles that upload microseconds apart would
    // visibly desync. REAL time: a fade must run even while the sim clock
    // is paused or scaled (see `EARTH_TILE_CROSSFADE_MS`'s doc comment).
    const nowMs = performance.now();

    for (let i = 0; i < tileCount; i++) {
      const tile = tiles[i]!;
      const mesh = meshCache.get(tile.id, frame);
      const vertexBase = i * vertsPerTile;

      // `fallback === null` means no deeper resident ancestor: the CPU-side
      // encoding is fadeWeight forced to 1 with the fallback rect aliased to
      // the primary one (see io.wesl's `NodeParams` doc) — mix() at weight 1
      // returns the primary sample exactly, so the fragment never needs to
      // branch on "is there a fallback".
      const fallback = tile.resident.fallback ?? tile.resident;
      const fadeWeight =
        tile.resident.fallback === null
          ? 1
          : Math.min(1, Math.max(0, (nowMs - tile.resident.readyAtMs) / EARTH_TILE_CROSSFADE_MS));

      // Body-fixed axes throughout (no orientation rotation): tile.originLocal
      // is already the frame composeBodySlabMvp's model factor places bodies
      // in, so the tile origin relative to the eye is a direct
      // radius-scale-then-subtract, mirroring that same model.
      writeSurfaceTileNodeParams(
        nodeScratchView,
        i * NODE_PARAMS_BYTES,
        radiusM * tile.originLocal[0] - eyeRelBodyM[0],
        radiusM * tile.originLocal[1] - eyeRelBodyM[1],
        radiusM * tile.originLocal[2] - eyeRelBodyM[2],
        vertexBase,
        tile.resident.atlasUvOrigin[0],
        tile.resident.atlasUvOrigin[1],
        tile.resident.atlasUvScale[0],
        tile.resident.atlasUvScale[1],
        fallback.atlasUvOrigin[0],
        fallback.atlasUvOrigin[1],
        fallback.atlasUvScale[0],
        fallback.atlasUvScale[1],
        fadeWeight,
      );

      // Expand the tile's indexed mesh into VERTS_PER_TILE per-corner
      // records — see the module header for why this isn't drawn indexed.
      for (let k = 0; k < vertsPerTile; k++) {
        const vi = mesh.indices[k]!;
        const p = vi * 3;
        const t = vi * 2;
        writeTileVertex(
          vertexScratchView,
          (vertexBase + k) * TILE_VERTEX_BYTES,
          mesh.positions[p]!,
          mesh.positions[p + 1]!,
          mesh.positions[p + 2]!,
          mesh.uvs[t]!,
          mesh.uvs[t + 1]!,
          mesh.tangents[p]!,
          mesh.tangents[p + 1]!,
          mesh.tangents[p + 2]!,
        );
      }
    }

    ensureDrawBuffers(tileCount);
    device.queue.writeBuffer(nodeParamsBuffer!, 0, nodeScratch, 0, tileCount * NODE_PARAMS_BYTES);
    device.queue.writeBuffer(
      tileVertsBuffer!,
      0,
      vertexScratch,
      0,
      tileCount * vertsPerTile * TILE_VERTEX_BYTES,
    );

    writeSurfaceTileUniforms(
      uniformView,
      vp,
      // Body-fixed frame throughout (see the module header) — the shader's
      // rotCol0/1/2 slots are inert at identity, kept only for the struct's
      // parity-tested byte layout.
      IDENTITY_MAT3,
      radiusM,
      vertsPerTile,
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
    );
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);

    // Bind group rebuilt every draw: the storage buffers may have grown,
    // and the texture views are supplied fresh per call (this renderer owns
    // neither the atlas nor the base globe's other maps — see the header).
    const bindGroup = device.createBindGroup({
      label: 'earth-surface-tile-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        {
          binding: 1,
          resource: { buffer: nodeParamsBuffer!, size: tileCount * NODE_PARAMS_BYTES },
        },
        {
          binding: 2,
          resource: {
            buffer: tileVertsBuffer!,
            size: tileCount * vertsPerTile * TILE_VERTEX_BYTES,
          },
        },
        { binding: 3, resource: baseSampler },
        { binding: 4, resource: atlasSampler },
        { binding: 5, resource: surfaceAtlasView },
        { binding: 6, resource: materialView },
        { binding: 7, resource: nightView },
        { binding: 8, resource: normalView },
        { binding: 9, resource: cloudsView },
      ],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(vertsPerTile * tileCount);
  }

  function destroy(): void {
    nodeParamsBuffer?.destroy();
    tileVertsBuffer?.destroy();
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
