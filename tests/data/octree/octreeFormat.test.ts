import { describe, expect, it } from 'vitest';

import type { ColumnId } from '../../../src/@types/octree/ColumnId';
import type { ColumnSchema } from '../../../src/@types/octree/ColumnSchema';
import type { OctreeChunkHeader } from '../../../src/@types/octree/OctreeChunkHeader';
import type { OctreeIndexHeader } from '../../../src/@types/octree/OctreeIndexHeader';
import type { OctreeNodeTable } from '../../../src/@types/octree/OctreeNodeTable';
import type { OctreeRawColumn } from '../../../tools/@types/octree/OctreeRawColumn';
import { decodeOctreeChunk } from '../../../src/data/octree/decodeOctreeChunk';
import { decodeOctreeIndex } from '../../../src/data/octree/decodeOctreeIndex';
import {
  NO_CHUNK_REF,
  OCTREE_CHUNK_MAGIC,
  OCTREE_VERSION_OFFSET,
} from '../../../src/data/octree/octreeFormat';
import { readOctreeHeader } from '../../../src/data/octree/readOctreeHeader';
import { encodeOctreeObject } from '../../../tools/octree/encodeOctreeObject';

const RECORDS = 5;

const list = (c: ArrayLike<number> | ArrayLike<bigint>): (number | bigint)[] =>
  Array.from(c as ArrayLike<number | bigint>);

function nodeTable(): OctreeNodeTable {
  return {
    count: 3,
    morton: new Uint32Array([7, 0, 0]),
    level: new Uint8Array([0, 1, 2]),
    childMask: new Uint8Array([0, 0b1000_0000, 1]),
    firstRecord: new Uint32Array([0, 2, 4]),
    ownCount: new Uint32Array([2, 1, 0]),
    blobCount: new Uint32Array([0, 2, 3]),
    chunkRef: new Uint32Array([NO_CHUNK_REF, 0, 4_000_000_000]),
  };
}

function indexHeader(columns: readonly ColumnSchema[], nodes = 3): OctreeIndexHeader {
  return {
    kind: 'index',
    family: 'star',
    grid: { bits: 10, origin: [-1.5, 2, 3.25], cellEdge: 23.4 },
    stratify: { thr: 0.16, mLim: 10, refUnit: 10 },
    chunkCapacity: 32_768,
    chunkNodeCap: 0,
    nodes,
    records: RECORDS,
    columns,
    stats: { starCount: RECORDS },
    chunks: [],
  };
}

// Test-only ids: the registry holds three, the round-trip needs nine distinct columns.
const id = (s: string) => s as ColumnId;

const ALL_STORES: readonly ColumnSchema[] = [
  { id: 'offset', store: 'u16x3', q0: 0, q1: 1 },
  { id: 'absMag', store: 'u8', q0: -6.0, q1: 0.19 },
  { id: 'colourIndex', store: 'u16', q0: 0.5, q1: 0.01 },
  { id: id('f32'), store: 'f32', q0: 0, q1: 1 },
  { id: id('f16'), store: 'f16', q0: 0, q1: 1 },
  { id: id('u32'), store: 'u32', q0: 1, q1: 2 },
  { id: id('i8'), store: 'i8', q0: 0, q1: 0.5 },
];

const ALL_RAW = new Map<ColumnId, OctreeRawColumn>([
  ['offset', new Uint16Array([65535, 0, 1, 2, 65535, 3, 4, 5, 6, 7, 8, 65535, 9, 10, 11])],
  ['absMag', new Uint8Array([0, 1, 127, 255, 10])],
  ['colourIndex', new Uint16Array([0, 65535, 100, 2, 3])],
  [id('f32'), new Float32Array([1.5, -2.25, 1024.5, 0, 7])],
  // Half bits: 1, −2, 0.5, 0, 65504 (the largest finite half).
  [id('f16'), new Uint16Array([0x3c00, 0xc000, 0x3800, 0x0000, 0x7bff])],
  [id('u32'), new Uint32Array([0, 1, 2, 1_000_000, 7])],
  [id('i8'), new Int8Array([-128, -1, 0, 1, 127])],
]);

describe('octree container format', () => {
  it('round-trips every column store field-for-field', () => {
    const header = indexHeader(ALL_STORES);
    const buf = encodeOctreeObject(header, nodeTable(), ALL_STORES, ALL_RAW);
    const decoded = decodeOctreeIndex(buf.buffer as ArrayBuffer);

    expect(decoded.header).toEqual(header);
    expect(decoded.nodes).toEqual(nodeTable());
    const col = (k: string) => list(decoded.columns.get(id(k))!);
    expect(col('offset')).toEqual(list(ALL_RAW.get('offset')!));
    // −6 + raw·0.19
    [-6.0, -5.81, 18.13, 42.45, -4.1].forEach((v, i) => expect(col('absMag')[i]).toBeCloseTo(v, 5));
    // 0.5 + raw·0.01
    [0.5, 655.85, 1.5, 0.52, 0.53].forEach((v, i) =>
      expect(col('colourIndex')[i]).toBeCloseTo(v, 3),
    );
    expect(col('f32')).toEqual([1.5, -2.25, 1024.5, 0, 7]);
    expect(col('f16')).toEqual([1, -2, 0.5, 0, 65504]);
    // 1 + raw·2
    expect(col('u32')).toEqual([1, 3, 5, 2_000_001, 15]);
    // raw·0.5
    expect(col('i8')).toEqual([-64, -0.5, 0, 0.5, 63.5]);
  });

  it('pads the JSON header so the node table starts on a multiple of 8', () => {
    const header: OctreeChunkHeader = { kind: 'chunk', level: 3, morton: 17, nodes: 3, records: 5, chunks: [] };
    expect(JSON.stringify(header).length % 8).not.toBe(6);
    const schema = ALL_STORES.slice(0, 3);
    const buf = encodeOctreeObject(header, nodeTable(), schema, ALL_RAW);

    const read = readOctreeHeader<OctreeChunkHeader>(buf.buffer as ArrayBuffer, OCTREE_CHUNK_MAGIC);
    expect(read.nodeTableOffset % 8).toBe(0);
    expect(read.header).toEqual(header);
  });

  it('every column starts on a multiple of 8', () => {
    const schema: readonly ColumnSchema[] = [
      { id: 'absMag', store: 'u8', q0: 0, q1: 1 },
      { id: 'offset', store: 'u16x3', q0: 0, q1: 1 },
      { id: 'colourIndex', store: 'u8', q0: 0, q1: 1 },
    ];
    const header: OctreeChunkHeader = { kind: 'chunk', level: 1, morton: 0, nodes: 3, records: 5, chunks: [] };
    const raw = new Map<ColumnId, OctreeRawColumn>([
      ['absMag', new Uint8Array([1, 2, 3, 4, 5])],
      ['offset', ALL_RAW.get('offset')!],
      ['colourIndex', new Uint8Array([9, 8, 7, 6, 5])],
    ]);
    const buf = encodeOctreeObject(header, nodeTable(), schema, raw);
    const decoded = decodeOctreeChunk(buf.buffer as ArrayBuffer, { columns: schema });

    expect(list(decoded.columns.get('offset')!)).toEqual(list(ALL_RAW.get('offset')!));
    expect(list(decoded.columns.get('colourIndex')!)).toEqual([9, 8, 7, 6, 5]);
  });

  it('a chunk decodes against the index schema it carries none of', () => {
    const index = indexHeader(ALL_STORES);
    const indexBuf = encodeOctreeObject(index, nodeTable(), ALL_STORES, ALL_RAW);
    const chunkHeader: OctreeChunkHeader = { kind: 'chunk', level: 4, morton: 9, nodes: 3, records: 5, chunks: [] };
    const chunkBuf = encodeOctreeObject(chunkHeader, nodeTable(), ALL_STORES, ALL_RAW);

    const decodedIndex = decodeOctreeIndex(indexBuf.buffer as ArrayBuffer);
    const chunk = decodeOctreeChunk(chunkBuf.buffer as ArrayBuffer, decodedIndex.header);
    expect(chunk.header).toEqual(chunkHeader);
    expect(chunk.nodes).toEqual(decodedIndex.nodes);
    expect(chunk.columns).toEqual(decodedIndex.columns);
  });

  it('throws when a required star column is missing', () => {
    const schema = ALL_STORES.filter((c) => c.id !== 'absMag');
    const buf = encodeOctreeObject(indexHeader(schema), nodeTable(), schema, ALL_RAW);
    expect(() => decodeOctreeIndex(buf.buffer as ArrayBuffer)).toThrow(/absMag/);
  });

  it('rejects a wrong magic and a stale version with the regenerate message', () => {
    const schema = ALL_STORES.slice(0, 3);
    const chunkHeader: OctreeChunkHeader = { kind: 'chunk', level: 4, morton: 9, nodes: 3, records: 5, chunks: [] };
    const chunkBuf = encodeOctreeObject(chunkHeader, nodeTable(), schema, ALL_RAW);
    expect(() => decodeOctreeIndex(chunkBuf.buffer as ArrayBuffer)).toThrow(/regenerate/);

    const indexBuf = encodeOctreeObject(indexHeader(schema), nodeTable(), schema, ALL_RAW);
    new DataView(indexBuf.buffer).setUint16(OCTREE_VERSION_OFFSET, 2, true);
    expect(() => decodeOctreeIndex(indexBuf.buffer as ArrayBuffer)).toThrow(
      /unsupported octree version: 2 .*regenerate/,
    );
  });
});
