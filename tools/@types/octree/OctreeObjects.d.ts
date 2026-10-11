import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';
import type { OctreeChunkObject } from './OctreeChunkObject';

/** A chunked catalog before encoding: the index rows (chunk roots carry `chunkRef`) and every chunk. */
export type OctreeObjects = {
  readonly index: {
    readonly nodes: OctreeNodeTable;
    readonly columns: ReadonlyMap<ColumnId, Float32Array>;
    /** The bake's row bound: no chunk holds more rows. */
    readonly chunkNodeCap: number;
  };
  /** In Morton order of their roots; `chunkRef` indexes this array. */
  readonly chunks: readonly OctreeChunkObject[];
};
