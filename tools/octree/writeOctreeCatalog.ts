/**
 * Quantises and encodes every object, writing each chunk as
 * `<outDir>/<name>/<level>-<morton>.<hash8>.bin` and the index `<outDir>/<name>.bin` last. An
 * object's header names its child chunks' hashes, so children are written before parents (ids
 * run breadth-first, so descending id order does it): a reader that sees an object never meets
 * a child not on disk yet. The quantiser covers the star schema's stores; `u10x3` and `u64`
 * throw until a column uses them.
 */
import fs from 'node:fs';
import { join } from 'node:path';

import type { ColumnId } from '../../src/@types/octree/ColumnId';
import type { ColumnSchema } from '../../src/@types/octree/ColumnSchema';
import type { OctreeChunkRef } from '../../src/@types/octree/OctreeChunkRef';
import type { OctreeIndexHeader } from '../../src/@types/octree/OctreeIndexHeader';
import type { OctreeNodeTable } from '../../src/@types/octree/OctreeNodeTable';
import type { OctreeCatalogMeta } from '../@types/octree/OctreeCatalogMeta';
import type { OctreeObjects } from '../@types/octree/OctreeObjects';
import type { OctreeRawColumn } from '../@types/octree/OctreeRawColumn';
import { octreeChunkFileName, OFFSET_FRACTION_LEVELS } from '../../src/data/octree/octreeFormat';
import { f32ToF16Bits } from '../../src/utils/math/f32ToF16Bits';
import { contentHash8 } from '../utils/data/contentHash8';
import { encodeOctreeObject } from './encodeOctreeObject';

const INTEGER_STORES = {
  u8: { array: Uint8Array, min: 0, max: 0xff },
  u16: { array: Uint16Array, min: 0, max: 0xffff },
  u32: { array: Uint32Array, min: 0, max: 0xffffffff },
  i8: { array: Int8Array, min: -0x80, max: 0x7f },
} as const;

export function writeOctreeCatalog(
  objects: OctreeObjects,
  meta: OctreeCatalogMeta,
  outDir: string,
  name: string,
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
    const hash = contentHash8(bytes);
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
    chunkCapacity: meta.capacity,
    chunkNodeCap: objects.index.chunkNodeCap,
    nodes: objects.index.nodes.count,
    records: recordCount(objects.index.nodes),
    columns: meta.schema,
    stats: { ...meta.stats, chunkCount: objects.chunks.length },
    chunks: refsUnder(null),
  };
  const index = encodeOctreeObject(
    header,
    objects.index.nodes,
    meta.schema,
    quantise(objects.index.columns, meta.schema),
  );
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

function quantiseColumn(values: Float32Array, c: ColumnSchema): OctreeRawColumn {
  switch (c.store) {
    case 'f32':
      return values;
    case 'f16':
      return Uint16Array.from(values, f32ToF16Bits);
    case 'u16x3':
      return Uint16Array.from(values, (f) =>
        clamp(Math.round(f * OFFSET_FRACTION_LEVELS), 0, OFFSET_FRACTION_LEVELS - 1),
      );
    case 'u10x3':
    case 'u64':
      throw new Error(`column ${c.id}: no quantiser for store ${c.store} yet`);
    default: {
      const { array, min, max } = INTEGER_STORES[c.store];
      const out = new array(values.length);
      values.forEach((v, i) => (out[i] = clamp(Math.round((v - c.q0) / c.q1), min, max)));
      return out;
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
