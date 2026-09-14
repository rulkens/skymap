/**
 * Tag + table dispatch (`simplicity.md` §7): a new asset kind is a row here,
 * not a branch at the layer list's call site.
 */
import type { SceneAsset } from '../../@types/SceneAsset';

export type AssetCountDisplay = { readonly count: number; readonly unit: string };

const ASSET_COUNT: {
  readonly [K in SceneAsset['kind']]: (
    asset: Extract<SceneAsset, { kind: K }>,
  ) => AssetCountDisplay;
} = {
  pointCloud: (asset) => ({ count: asset.pointCount, unit: 'pts' }),
  gaussianSplat: (asset) => ({ count: asset.splatCount, unit: 'splats' }),
  mesh: (asset) => ({ count: asset.triangleCount, unit: 'tris' }),
};

export function assetCount(asset: SceneAsset): AssetCountDisplay {
  // TS can't correlate the key with the row it selects; the table's own type
  // is what proves each row only ever reads its own kind's fields.
  const row = ASSET_COUNT[asset.kind] as (a: SceneAsset) => AssetCountDisplay;
  return row(asset);
}
