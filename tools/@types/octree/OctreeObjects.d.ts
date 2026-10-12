import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';
import type { OctreeChunkObject } from './OctreeChunkObject';

/** A chunked catalog before encoding: the index (the top object) and chunks of every depth. */
export type OctreeObjects = {
  readonly index: {
    readonly nodes: OctreeNodeTable;
    readonly columns: ReadonlyMap<ColumnId, Float32Array>;
    /** The bake's row bound: no object holds more rows. */
    readonly chunkNodeCap: number;
  };
  /** Indexed by chunk id: breadth-first from the index, each parent's chunks in Morton order. */
  readonly chunks: readonly OctreeChunkObject[];
};
