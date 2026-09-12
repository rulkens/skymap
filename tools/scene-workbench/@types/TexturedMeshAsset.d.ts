import type { AssetCommon } from './AssetCommon';

export type TexturedMeshAsset = AssetCommon & {
  readonly kind: 'mesh';
  readonly triangleCount: number;
  /** mesh.glb — the self-contained subset `readMeshGlb` accepts (spec §5). */
  readonly artifactUrl: string;
};
