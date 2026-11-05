/**
 * Quantises and encodes every object, writing each chunk as
 * `<outDir>/<name>/<level>-<morton>.<hash8>.bin` and the index `<outDir>/<name>.bin` last. An
 * object's header names its child chunks' hashes, so children are written before parents (ids
 * run breadth-first, so descending id order does it): a reader that sees an object never meets
 * a child not on disk yet. With `info`, each object gets an info object beside it (written
 * first), and one hash over both objects' bytes names the pair, so neither half can go stale.
 */
import fs from 'node:fs';
import { join } from 'node:path';

import type { ColumnId } from '../../src/@types/octree/ColumnId';
import type { ColumnSchema } from '../../src/@types/octree/ColumnSchema';
import type { OctreeChunkRef } from '../../src/@types/octree/OctreeChunkRef';
import type { OctreeIndexHeader } from '../../src/@types/octree/OctreeIndexHeader';
import type { OctreeNodeTable } from '../../src/@types/octree/OctreeNodeTable';
import type { OctreeCatalogMeta } from '../@types/octree/OctreeCatalogMeta';
import type { OctreeInfoInput } from '../@types/octree/OctreeInfoInput';
import type { OctreeObjects } from '../@types/octree/OctreeObjects';
import type { OctreeRawColumn } from '../@types/octree/OctreeRawColumn';
import { octreeChunkFileName, octreeChunkInfoFileName } from '../../src/data/octree/octreeFormat';
import { contentHash8 } from '../utils/data/contentHash8';
import { encodeOctreeInfo } from './encodeOctreeInfo';
import { encodeOctreeObject } from './encodeOctreeObject';
import { quantiseColumn } from './quantiseColumn';

export function writeOctreeCatalog(
  objects: OctreeObjects,
  meta: OctreeCatalogMeta,
  outDir: string,
  name: string,
  info?: OctreeInfoInput,
): OctreeIndexHeader {
  const chunkDir = join(outDir, name);
  fs.mkdirSync(chunkDir, { recursive: true });
  const refs: OctreeChunkRef[] = [];
  const kids = new Map<number | null, number[]>();
  objects.chunks.forEach((c, id) => {
    if (!kids.has(c.parent)) kids.set(c.parent, []);
    kids.get(c.parent)!.push(id);
  });
  const refsUnder = (parent: number | null) => (kids.get(parent) ?? []).map((id) => refs[id]!);
  for (let id = objects.chunks.length - 1; id >= 0; id--) {
    const c = objects.chunks[id]!;
    const nodes = c.nodes.count;
    const records = recordCount(c.nodes);
    const bytes = encodeOctreeObject(
      { kind: 'chunk', level: c.level, morton: c.morton, nodes, records, chunks: refsUnder(id) },
      c.nodes,
      meta.schema,
      quantise(c.columns, meta.schema),
    );
    const infoBytes = info && encodeOctreeInfo(info, c.sourceRows);
    const hash = contentHash8(infoBytes ? Buffer.concat([bytes, infoBytes]) : bytes);
    if (infoBytes)
      fs.writeFileSync(join(chunkDir, octreeChunkInfoFileName({ ...c, hash })), infoBytes);
    fs.writeFileSync(join(chunkDir, octreeChunkFileName({ ...c, hash })), bytes);
    refs[id] = {
      id,
      level: c.level,
      morton: c.morton,
      roots: c.roots,
      hash,
      bytes: bytes.length,
      nodes,
      records,
      recordBase: c.recordBase,
    };
  }

  const header: OctreeIndexHeader = {
    kind: 'index',
    family: meta.family,
    grid: meta.grid,
    stratify: meta.stratify,
    chunkCapacity: objects.index.chunkCapacity,
    chunkNodeCap: objects.index.chunkNodeCap,
    nodes: objects.index.nodes.count,
    records: recordCount(objects.index.nodes),
    columns: meta.schema,
    stats: { ...meta.stats, chunkCount: objects.chunks.length },
    chunks: refsUnder(null),
    // Refs sit at their ids, and record ordinals follow ids: already ascending recordBase.
    ...(info ? { chunkDirectory: refs } : {}),
    ...(meta.pgcShards ? { pgcShards: meta.pgcShards } : {}),
    ...(meta.namedPgcs ? { namedPgcs: meta.namedPgcs } : {}),
  };
  const index = encodeOctreeObject(
    header,
    objects.index.nodes,
    meta.schema,
    quantise(objects.index.columns, meta.schema),
  );
  if (info) {
    fs.writeFileSync(
      join(outDir, `${name}.info.bin`),
      encodeOctreeInfo(info, objects.index.sourceRows),
    );
  }
  fs.writeFileSync(join(outDir, `${name}.bin`), index);
  return header;
}

function recordCount(nodes: OctreeNodeTable): number {
  const last = nodes.count - 1;
  if (last < 0) return 0;
  return nodes.firstRecord[last]! + nodes.ownCount[last]! + (nodes.childMask[last] !== 0 ? 1 : 0);
}

function quantise(
  columns: ReadonlyMap<ColumnId, Float32Array>,
  schema: readonly ColumnSchema[],
): Map<ColumnId, OctreeRawColumn> {
  return new Map(schema.map((c) => [c.id, quantiseColumn(columns.get(c.id)!, c)]));
}
