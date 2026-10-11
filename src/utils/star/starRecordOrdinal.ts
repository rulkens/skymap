import type { StarOctree } from '../../@types/data/starCatalog/StarOctree';

/** The catalog-global ordinal of an object-local record; inverse of `starRecordObject`. */
export function starRecordOrdinal(octree: StarOctree, chunk: number | null, local: number): number {
  return chunk === null ? local : octree.recordOrdinalBase[chunk]! + local;
}
