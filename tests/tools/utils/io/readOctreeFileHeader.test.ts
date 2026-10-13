import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ColumnId } from '../../../../src/@types/octree/ColumnId';
import type { OctreeChunkHeader } from '../../../../src/@types/octree/OctreeChunkHeader';
import {
  NO_CHUNK_REF,
  OCTREE_CHUNK_MAGIC,
  OCTREE_HEADER_BYTES_OFFSET,
  OCTREE_JSON_OFFSET,
  STAR_COLUMN_SCHEMA,
} from '../../../../src/data/octree/octreeFormat';
import { readOctreeHeader } from '../../../../src/data/octree/readOctreeHeader';
import { encodeOctreeObject } from '../../../../tools/octree/encodeOctreeObject';
import type { OctreeRawColumn } from '../../../../tools/@types/octree/OctreeRawColumn';
import { readOctreeFileHeader } from '../../../../tools/utils/io/readOctreeFileHeader';

const OBJECT = encodeOctreeObject(
  { kind: 'chunk', level: 3, morton: 5, nodes: 1, records: 2, chunks: [] },
  {
    count: 1,
    morton: new Uint32Array([40]),
    level: new Uint8Array([2]),
    childMask: new Uint8Array([0]),
    firstRecord: new Uint32Array([0]),
    ownCount: new Uint32Array([2]),
    blobCount: new Uint32Array([0]),
    chunkRef: new Uint32Array([NO_CHUNK_REF]),
  },
  STAR_COLUMN_SCHEMA,
  new Map<ColumnId, OctreeRawColumn>([
    ['offset', new Uint16Array(6)],
    ['absMag', new Uint8Array(2)],
    ['colourIndex', new Uint8Array(2)],
  ]),
);

describe('readOctreeFileHeader', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads the header of an object cut off right after it, as the whole object reads', () => {
    dir = mkdtempSync(join(tmpdir(), 'octree-header-'));
    const headerBytes = new DataView(OBJECT.buffer, OBJECT.byteOffset).getUint32(
      OCTREE_HEADER_BYTES_OFFSET,
      true,
    );
    const path = join(dir, 'chunk.bin');
    writeFileSync(path, OBJECT.subarray(0, OCTREE_JSON_OFFSET + headerBytes));

    const whole = readOctreeHeader<OctreeChunkHeader>(OBJECT.slice().buffer, OCTREE_CHUNK_MAGIC);
    expect(readOctreeFileHeader<OctreeChunkHeader>(path, OCTREE_CHUNK_MAGIC)).toEqual(whole.header);
  });
});
