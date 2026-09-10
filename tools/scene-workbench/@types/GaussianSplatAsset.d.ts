import type { AssetCommon } from './AssetCommon';

export type GaussianSplatAsset = AssetCommon & {
  readonly kind: 'gaussianSplat';
  readonly splatCount: number;
  readonly shDegree: 0 | 1;
  /** splats.bin — see spec §5 for the binary layout. */
  readonly artifactUrl: string;
};
