import type { AssetCommon } from './AssetCommon';

export type PointCloudAsset = AssetCommon & {
  readonly kind: 'pointCloud';
  readonly pointCount: number;
  /** points.bin — see spec §5 for the binary layout. */
  readonly artifactUrl: string;
};
