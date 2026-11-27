/**
 * surfaceTileRenderer — one instanced indexed draw of the resident
 * virtual-texture surface patches (`cutSurfaceTiles`'s cut) over the base
 * globe: one shared template index buffer, one 112-byte `PatchInstance` per
 * patch, all geometry derived in `vertex.wesl`.
 *
 * Depth compare is `'nearer-or-equal'`, not `'nearer'`: this pipeline shares
 * the base globe's nominal radius, so ties must resolve in ITS favour. It
 * owns neither the tile atlas nor any effect map — both arrive on every
 * `draw` call. One pipeline per effects set (`SURFACE_TILE_SHADER_VARIANTS`),
 * built on first use.
 *
 * @module
 */

import type { Renderer } from '../../../../../@types/rendering/Renderer';
import type { SurfaceEffect } from '../../format/@types/SurfaceEffect';
import type { SurfaceTileRenderer } from '../@types/SurfaceTileRenderer';
import { resolveDepthCompare } from '../../../../../utils/gpu/resolveDepthCompare';
import { IDENTITY_MAT3 } from '../../../../../utils/math/identityMat3';
import { patchOriginRelEyeM } from '../subsystems/patchOriginRelEyeM';
import { surfacePatchIndices } from '../subsystems/surfacePatchIndices';
import { surfaceEffectsKey } from '../../plan/subsystems/surfaceEffectsKey';
import { createShaderModuleWithDevLog } from '../../../../../services/gpu/shaderCompileLogger';
import vsCode from '../../../../../services/gpu/shaders/bodies/surfaceTile/vertex.wesl?static';
import {
  PATCH_INSTANCE_BYTES,
  SURFACE_TILE_UNIFORM_BYTES,
  writePatchInstance,
  writeSurfaceTileUniforms,
} from './surfaceTileLayout';
import { HEIGHT_ATLAS_SLOTS_PER_ROW } from '../../format/data/surfaceTileParams';
import { surfaceTileFadeWeight } from '../subsystems/surfaceTileFadeWeight';
import { HEIGHT_POSTS_PER_TILE } from '../../format/data/heightTileFormat';
import { SURFACE_TILE_PRODUCTS } from '../../format/data/surfaceTileProducts';
import { SURFACE_TILE_LANE_SPECS } from '../../stream/data/surfaceTileLaneSpecs';
import { SURFACE_TILE_SHADER_VARIANTS } from './surfaceTileShaderVariants';
import { horizonRectOf } from '../../horizon/utils/horizonRectOf';
import { NO_HORIZON_RECT } from '../../../textures/data/horizonRects';
import type { SurfaceTileDrawArgs } from '../@types/SurfaceTileDrawArgs';
import type { Vec4 } from '../../../../../@types/math/Vec4';

/** A leaf with no resident night tile: zero scale tells the fragment to read the global map. */
const NO_NIGHT_RECT: Readonly<Vec4> = [0, 0, 0, 0];

/**
 * @param resolution The template's `n`: it sizes the shared index buffer and
 *   reaches the vertex shader as `SurfaceTileUniforms.meshResolution`, which
 *   splits `vertex_index` into `(i, j)`. The two must be the same number.
 * @param reversedZ selects this slab's depth convention, resolved through
 *   `resolveDepthCompare` with intent `'nearer-or-equal'` (see the module header).
 * @param horizonConstants `horizonLookupConstants`, passed to the fragment stage as is.
 */
export function createSurfaceTileRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  depthFormat: GPUTextureFormat,
  reversedZ: boolean,
  resolution: number,
  horizonConstants: Record<string, GPUPipelineConstantValue>,
): SurfaceTileRenderer {
  // Mirrors earthRenderer's whole-globe sampler: these views carry the base globe's mip chain.
  const baseSampler = device.createSampler({
    label: 'surface-tile-base-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'repeat',
    addressModeV: 'clamp-to-edge',
  });
  // Clamp only guards the ATLAS TEXTURE's edge; a rect's edge next to an unrelated
  // slot is guarded by the fragment's half-texel uv clamp (surfaceLighting.wesl).
  const atlasSampler = device.createSampler({
    label: 'surface-tile-atlas-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // A body with no horizon lane still binds a horizon atlas; every rect is then
  // `NO_HORIZON_RECT`, so this texel is never read.
  const horizonStandIn = device.createTexture({
    label: 'surface-tile-horizon-stand-in',
    size: [1, 1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING,
  });
  const horizonStandInView = horizonStandIn.createView();

  const indices = surfacePatchIndices(resolution);
  const indexCount = indices.length;
  const indexBuffer = device.createBuffer({
    label: 'surface-tile-index-buffer',
    size: indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  const sharedLayoutEntries: readonly GPUBindGroupLayoutEntry[] = [
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
    // Terrain-RGB codes are `textureLoad`ed by the vertex stage, never sampled: unfilterable.
    {
      binding: 2,
      visibility: GPUShaderStage.VERTEX,
      texture: { sampleType: 'unfilterable-float' },
    },
    { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
  ];
  const atlasBindings = new Set(
    SURFACE_TILE_PRODUCTS.map((p) => SURFACE_TILE_LANE_SPECS[p].binding),
  );
  const sharedBindings = new Set(sharedLayoutEntries.map((entry) => entry.binding));
  // No binding 8 (whole-globe normal map): patches take their normal from the
  // height field, and compositing both would shade the same relief twice.
  const fragmentLayoutEntries: Readonly<Record<number, GPUBindGroupLayoutEntry>> = {
    3: { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    5: { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    6: { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    7: { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    9: { binding: 9, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    10: { binding: 10, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    // Horizon angle bytes, `textureLoad`ed and decoded per post (`lib/horizonLookup.wesl`).
    11: {
      binding: 11,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'unfilterable-float' },
    },
  };

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'surfaceTile.vertex');

  function buildVariant(key: string) {
    const variant = SURFACE_TILE_SHADER_VARIANTS[key];
    if (variant === undefined) {
      throw new Error(`surfaceTileRenderer: no shader variant for effects '${key}'`);
    }
    const bindGroupLayout = device.createBindGroupLayout({
      label: `surface-tile-bgl[${key}]`,
      entries: [
        ...sharedLayoutEntries,
        ...variant.bindings.map((binding) => fragmentLayoutEntries[binding]!),
      ],
    });
    const fsModule = createShaderModuleWithDevLog(
      device,
      variant.fragment,
      `surfaceTile.fragment[${key}]`,
    );
    // `cullMode` is the one difference: a capture face mirrors winding (`viewFlipsWinding`).
    const createPipeline = (cullMode: GPUCullMode): GPURenderPipeline =>
      device.createRenderPipeline({
        label: `surface-tile-pipeline[${key}]-cull-${cullMode}`,
        layout: device.createPipelineLayout({
          label: `surface-tile-pipeline-layout[${key}]`,
          bindGroupLayouts: [bindGroupLayout],
        }),
        vertex: { module: vsModule, entryPoint: 'vs' },
        fragment: {
          module: fsModule,
          entryPoint: 'fs',
          constants: horizonConstants,
          targets: [{ format: targetFormat }], // opaque replace, alpha=1
        },
        primitive: {
          topology: 'triangle-list',
          frontFace: 'ccw', // matches surfacePatchIndices' east x north = outward winding
          cullMode,
        },
        depthStencil: {
          format: depthFormat,
          depthWriteEnabled: true,
          depthCompare: resolveDepthCompare('nearer-or-equal', reversedZ),
        },
      });
    return {
      bindGroupLayout,
      pipeline: createPipeline('back'),
      mirroredPipeline: createPipeline('front'),
      bindings: variant.bindings,
    };
  }
  const variants = new Map<string, ReturnType<typeof buildVariant>>();

  const uniformBuffer = device.createBuffer({
    label: 'surface-tile-uniform-buffer',
    size: SURFACE_TILE_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformScratch = new ArrayBuffer(SURFACE_TILE_UNIFORM_BYTES);
  const uniformView = new DataView(uniformScratch);

  let patchBuffer: GPUBuffer | null = null;
  let patchScratch = new ArrayBuffer(0);
  let patchScratchView = new DataView(patchScratch);

  function ensureCapacity(tileCount: number): void {
    const bytes = tileCount * PATCH_INSTANCE_BYTES;
    if (patchBuffer !== null && patchScratch.byteLength >= bytes) return;
    patchBuffer?.destroy();
    patchBuffer = device.createBuffer({
      label: 'surface-tile-patch-instances',
      size: bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    patchScratch = new ArrayBuffer(bytes);
    patchScratchView = new DataView(patchScratch);
  }

  /**
   * Unasserted caller invariant: `tiles` is non-empty only while the tile
   * subsystem is engaged (altitude-gated, near Earth). `vertex.wesl`'s
   * `toCentreLocal` is f32-safe only then; a far-camera call silently flattens
   * every tile's shading normal.
   */
  function draw(pass: GPURenderPassEncoder, args: SurfaceTileDrawArgs): void {
    const {
      tiles,
      eyeRelBodyM,
      radiusM,
      vp,
      sunDirLocal,
      sunAngularRadiusRad,
      effects,
      effectInputs,
      shading,
      ambientLight,
      debugLodOverlay,
      noDisplacement,
      noSkirts,
      noShadows,
      atlasViews,
    } = args;
    const tileCount = tiles.length;
    if (tileCount === 0) return;

    const key = surfaceEffectsKey(effects);
    const suppliedKey = surfaceEffectsKey(
      (Object.keys(effectInputs) as SurfaceEffect[]).filter(
        (effect) => effectInputs[effect] !== undefined,
      ),
    );
    if (suppliedKey !== key) {
      throw new Error(
        `surfaceTileRenderer: effect inputs '${suppliedKey}' do not match effects '${key}'`,
      );
    }
    let variant = variants.get(key);
    if (variant === undefined) {
      variant = buildVariant(key);
      variants.set(key, variant);
    }
    const { materialMap, nightLights, cloudShadows } = effectInputs;

    ensureCapacity(tileCount);

    // Once per draw, so every tile's fade reads the same instant. REAL time: the
    // fade must run while the sim clock is paused or scaled.
    const nowMs = performance.now();

    for (let i = 0; i < tileCount; i++) {
      const tile = tiles[i]!;

      // No fallback ⇒ fadeWeight 1 with the fallback rect aliased to the primary, so
      // the fragment's mix() needs no branch.
      const fallback = tile.albedo.fallback ?? tile.albedo;
      // Night never reads 'empty' (no empty night tile is baked): the sentinel maps to
      // "no tile" like null, so the fragment falls back to the global map.
      const nightRect = tile.standalone.night === 'empty' ? null : tile.standalone.night;
      const fadeWeight = surfaceTileFadeWeight(tile.albedo, nowMs);

      const slotOriginX = (tile.height.slot % HEIGHT_ATLAS_SLOTS_PER_ROW) * HEIGHT_POSTS_PER_TILE;
      const slotOriginY =
        Math.floor(tile.height.slot / HEIGHT_ATLAS_SLOTS_PER_ROW) * HEIGHT_POSTS_PER_TILE;
      writePatchInstance(patchScratchView, i * PATCH_INSTANCE_BYTES, {
        originRelEyeM: patchOriginRelEyeM(tile.anchor, radiusM, eyeRelBodyM),
        fadeWeight,
        anchor: tile.anchor,
        albedoRect: [
          tile.albedo.atlasUvOrigin[0],
          tile.albedo.atlasUvOrigin[1],
          tile.albedo.atlasUvScale[0],
          tile.albedo.atlasUvScale[1],
        ],
        fallbackRect: [
          fallback.atlasUvOrigin[0],
          fallback.atlasUvOrigin[1],
          fallback.atlasUvScale[0],
          fallback.atlasUvScale[1],
        ],
        nightRect:
          nightRect === null
            ? NO_NIGHT_RECT
            : [
                nightRect.atlasUvOrigin[0],
                nightRect.atlasUvOrigin[1],
                nightRect.atlasUvScale[0],
                nightRect.atlasUvScale[1],
              ],
        heightSlotOrigin: [
          slotOriginX + tile.height.originPosts[0],
          slotOriginY + tile.height.originPosts[1],
        ],
        edgeCoarser:
          tile.edgeCoarser[0] |
          (tile.edgeCoarser[1] << 1) |
          (tile.edgeCoarser[2] << 2) |
          (tile.edgeCoarser[3] << 3),
        heightCells: (HEIGHT_POSTS_PER_TILE - 1) >> tile.height.levelDelta,
        horizonRect: noShadows ? NO_HORIZON_RECT : horizonRectOf(tile.standalone.horizon),
      });
    }

    device.queue.writeBuffer(patchBuffer!, 0, patchScratch, 0, tileCount * PATCH_INSTANCE_BYTES);

    writeSurfaceTileUniforms(
      uniformView,
      vp,
      IDENTITY_MAT3,
      radiusM,
      resolution,
      eyeRelBodyM,
      sunDirLocal,
      shading.roughnessBase,
      shading.f0,
      shading.sunIrradiance,
      ambientLight,
      // Unread by variants without the effect; 0 keeps the layout fixed.
      materialMap?.oceanRoughness ?? 0,
      cloudShadows?.strength ?? 0,
      cloudShadows?.shellRadius ?? 0,
      debugLodOverlay,
      noDisplacement,
      noSkirts,
      sunAngularRadiusRad,
    );
    device.queue.writeBuffer(uniformBuffer, 0, uniformScratch);

    // Rebuilt every draw: the storage buffer may have grown and views arrive per call.
    const fragmentResources: Readonly<Record<number, GPUBindingResource | undefined>> = {
      3: baseSampler,
      6: materialMap?.view,
      7: nightLights?.view,
      9: cloudShadows?.view,
    };
    // Each product's atlas goes to its lane row's binding, where the pipeline declares one
    // (an extra entry is a WebGPU validation error).
    const atlasEntries = SURFACE_TILE_PRODUCTS.map((product) => ({
      binding: SURFACE_TILE_LANE_SPECS[product].binding,
      resource: atlasViews[product],
    })).filter(({ binding }) => sharedBindings.has(binding) || variant.bindings.includes(binding));
    const bindGroup = device.createBindGroup({
      label: `surface-tile-bg[${key}]`,
      layout: variant.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        {
          binding: 1,
          resource: { buffer: patchBuffer!, size: tileCount * PATCH_INSTANCE_BYTES },
        },
        { binding: 4, resource: atlasSampler },
        ...atlasEntries,
        ...variant.bindings
          .filter((binding) => !atlasBindings.has(binding))
          .map((binding) => ({ binding, resource: fragmentResources[binding]! })),
      ],
    });

    pass.setPipeline(args.mirrored ? variant.mirroredPipeline : variant.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount, tileCount);
  }

  function destroy(): void {
    patchBuffer?.destroy();
    horizonStandIn.destroy();
    indexBuffer.destroy();
    uniformBuffer.destroy();
  }

  const renderer: SurfaceTileRenderer = {
    label: 'surfaceTileRenderer',
    draw,
    horizonStandInView,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
