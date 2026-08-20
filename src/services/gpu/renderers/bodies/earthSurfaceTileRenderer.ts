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
 * `originRelCamMpc` and `camPosRelBodyMpc` are composed in native JS
 * `number` (f64) arithmetic here and narrowed to f32 only at the final
 * `DataView` write, mirroring `composeBodyMvp`/`rebaseViewProj`'s
 * discipline; `vertex.wesl` derives why that keeps the reconstructed local
 * normal f32-safe with no separate origin-direction field.
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
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { Mat3 } from '../../../../@types/math/Mat3';
import type { SurfaceTileMeshCache } from '../../resources/surfaceTileMeshCache';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import vsCode from '../../shaders/bodies/earthSurfaceTile/vertex.wesl?static';
import fsCode from '../../shaders/bodies/earthSurfaceTile/fragment.wesl?static';
import {
  NODE_PARAMS_BYTES,
  TILE_VERTEX_BYTES,
  writeSurfaceTileNodeParams,
  writeTileVertex,
} from './earthSurfaceTileLayout';

/** `SurfaceTileUniforms`' byte size — see `io.wesl`'s doc comment for the field table. */
const UNIFORM_BYTES = 176;

/** Rotate a local-frame vector by `m`'s columns (`m[c*3+r]` — `Mat3`'s convention). */
function rotateByMat3(m: Readonly<Mat3>, v: Readonly<Vec3>): Vec3 {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

/** Rotate by `m`'s TRANSPOSE — valid as `m`'s inverse because it's a rotation. */
function inverseRotateByMat3(m: Readonly<Mat3>, v: Readonly<Vec3>): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/**
 * Pack the per-draw `SurfaceTileUniforms` block. Field order + offsets
 * mirror `io.wesl`'s doc comment exactly — see that comment for the byte
 * table this function is the single CPU-side statement of.
 */
function writeSurfaceTileUniforms(
  view: DataView,
  vp: Float32Array,
  orientation: Readonly<Mat3>,
  radiusMpc: number,
  vertsPerTile: number,
  camPosRelBodyMpc: Readonly<Vec3>,
  camPosLocal: Readonly<Vec3>,
  sunDirLocal: Readonly<Vec3>,
  roughnessBase: number,
  f0: number,
  sunIrradiance: number,
  ambientLight: number,
  oceanRoughness: number,
  cloudShadowStrength: number,
  cloudShellRadius: number,
): void {
  for (let i = 0; i < 16; i++) view.setFloat32(i * 4, vp[i]!, true);
  view.setFloat32(64, orientation[0], true);
  view.setFloat32(68, orientation[1], true);
  view.setFloat32(72, orientation[2], true);
  view.setFloat32(76, radiusMpc, true);
  view.setFloat32(80, orientation[3], true);
  view.setFloat32(84, orientation[4], true);
  view.setFloat32(88, orientation[5], true);
  view.setUint32(92, vertsPerTile >>> 0, true);
  view.setFloat32(96, orientation[6], true);
  view.setFloat32(100, orientation[7], true);
  view.setFloat32(104, orientation[8], true);
  view.setFloat32(108, roughnessBase, true);
  view.setFloat32(112, camPosRelBodyMpc[0], true);
  view.setFloat32(116, camPosRelBodyMpc[1], true);
  view.setFloat32(120, camPosRelBodyMpc[2], true);
  view.setFloat32(124, f0, true);
  view.setFloat32(128, camPosLocal[0], true);
  view.setFloat32(132, camPosLocal[1], true);
  view.setFloat32(136, camPosLocal[2], true);
  view.setFloat32(140, sunIrradiance, true);
  view.setFloat32(144, sunDirLocal[0], true);
  view.setFloat32(148, sunDirLocal[1], true);
  view.setFloat32(152, sunDirLocal[2], true);
  view.setFloat32(156, ambientLight, true);
  view.setFloat32(160, oceanRoughness, true);
  view.setFloat32(164, cloudShadowStrength, true);
  view.setFloat32(168, cloudShellRadius, true);
}

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
  // atlasSampler mirrors earthRenderer's tileSampler: clamp both axes (a
  // slot's neighbour texel belongs to an unrelated tile), single mip level.
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
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformScratch = new ArrayBuffer(UNIFORM_BYTES);
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

  function draw(pass: GPURenderPassEncoder, args: EarthSurfaceTileDrawArgs): void {
    const {
      tiles,
      frame,
      camPosMpc,
      bodyPositionMpc,
      orientation,
      radiusMpc,
      vp,
      sunDirLocal,
      roughnessBase,
      f0,
      sunIrradiance,
      ambientLight,
      oceanRoughness,
      cloudShadowStrength,
      cloudShellRadius,
      surfaceAtlasView,
      materialView,
      nightView,
      normalView,
      cloudsView,
    } = args;
    const tileCount = tiles.length;
    if (tileCount === 0) return;

    ensureScratch(tileCount);

    // Shared (per-draw, not per-tile) camera-relative-to-Earth facts, both
    // f64-composed here and narrowed once — see the module header.
    const camPosRelBodyMpc: Vec3 = [
      camPosMpc[0] - bodyPositionMpc[0],
      camPosMpc[1] - bodyPositionMpc[1],
      camPosMpc[2] - bodyPositionMpc[2],
    ];
    const camPosLocalRaw = inverseRotateByMat3(orientation, camPosRelBodyMpc);
    const camPosLocal: Vec3 = [
      camPosLocalRaw[0] / radiusMpc,
      camPosLocalRaw[1] / radiusMpc,
      camPosLocalRaw[2] / radiusMpc,
    ];

    for (let i = 0; i < tileCount; i++) {
      const tile = tiles[i]!;
      const mesh = meshCache.get(tile.id, frame);
      const vertexBase = i * vertsPerTile;

      const rotatedOrigin = rotateByMat3(orientation, tile.originLocal);
      writeSurfaceTileNodeParams(
        nodeScratchView,
        i * NODE_PARAMS_BYTES,
        radiusMpc * rotatedOrigin[0] + bodyPositionMpc[0] - camPosMpc[0],
        radiusMpc * rotatedOrigin[1] + bodyPositionMpc[1] - camPosMpc[1],
        radiusMpc * rotatedOrigin[2] + bodyPositionMpc[2] - camPosMpc[2],
        vertexBase,
        tile.resident.atlasUvOrigin[0],
        tile.resident.atlasUvOrigin[1],
        tile.resident.atlasUvScale[0],
        tile.resident.atlasUvScale[1],
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
      orientation,
      radiusMpc,
      vertsPerTile,
      camPosRelBodyMpc,
      camPosLocal,
      sunDirLocal,
      roughnessBase,
      f0,
      sunIrradiance,
      ambientLight,
      oceanRoughness,
      cloudShadowStrength,
      cloudShellRadius,
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
