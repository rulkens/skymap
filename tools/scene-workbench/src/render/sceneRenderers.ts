/**
 * Tag + table dispatch (`simplicity.md` §7) for the viewport's renderers: a new
 * asset kind is a row here plus an entry in `SCENE_DRAW_ORDER`, not another
 * renderer handle and draw call in the frame driver.
 *
 * The order is the blend contract — opaque kinds write depth first, splats
 * blend over that depth last and never write it.
 */
import type { GpuContext } from '../../../../src/@types/rendering/GpuContext';
import { createLidarPointRenderer } from './lidarPointRenderer';
import type { GpuAsset, RenderResources } from './renderResources';
import { createSplatRenderer } from './splatRenderer';

export const SCENE_DRAW_ORDER: readonly GpuAsset['kind'][] = ['pointCloud', 'gaussianSplat'];

export type SceneRenderers = {
  draw(
    pass: GPURenderPassEncoder,
    resources: RenderResources,
    hiddenAssetIds: readonly string[],
  ): void;
};

type KindRenderers = {
  readonly [K in GpuAsset['kind']]: {
    draw(pass: GPURenderPassEncoder, assets: readonly Extract<GpuAsset, { kind: K }>[]): void;
  };
};

function visibleAssetsOfKind<K extends GpuAsset['kind']>(
  resources: RenderResources,
  kind: K,
  hiddenAssetIds: readonly string[],
): Extract<GpuAsset, { kind: K }>[] {
  const drawn: Extract<GpuAsset, { kind: K }>[] = [];
  for (const [id, asset] of resources.gpuAssets) {
    if (asset.kind === kind && !hiddenAssetIds.includes(id)) {
      drawn.push(asset as Extract<GpuAsset, { kind: K }>);
    }
  }
  return drawn;
}

export function createSceneRenderers(
  gpu: GpuContext,
  targetFormat: GPUTextureFormat,
  cameraLayout: GPUBindGroupLayout,
): SceneRenderers {
  const renderers: KindRenderers = {
    pointCloud: createLidarPointRenderer(gpu, targetFormat, cameraLayout),
    gaussianSplat: createSplatRenderer(gpu, targetFormat, cameraLayout),
  };

  return {
    draw(pass, resources, hiddenAssetIds): void {
      for (const kind of SCENE_DRAW_ORDER) {
        // TS can't correlate the key with the row it selects; the table's own
        // type is what proves each row only ever draws its own kind's assets.
        const row = renderers[kind] as {
          draw(pass: GPURenderPassEncoder, assets: readonly GpuAsset[]): void;
        };
        row.draw(pass, visibleAssetsOfKind(resources, kind, hiddenAssetIds));
      }
    },
  };
}
