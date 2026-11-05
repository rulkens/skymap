import type { RawDataKey } from '../../utils/io/rawDataRegistry';

/** One tier's raw GLB, and how far `buildMeshes` simplifies it. */
export type MeshTierSource = {
  readonly raw: RawDataKey;
  /** meshopt-simplify to this many triangles; absent = the full mesh. */
  readonly triangles?: number;
};
