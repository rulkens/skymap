/**
 * An octree object's JSON header read off disk without its body: the framing's `headerBytes`
 * (offset 6) sizes one exact read, so a deploy or fetch walking ~1000 chunks reads kilobytes,
 * not their whole node tables and records.
 */
import { closeSync, openSync, readSync } from 'node:fs';

import type { OctreeChunkHeader } from '../../../src/@types/octree/OctreeChunkHeader';
import type { OctreeIndexHeader } from '../../../src/@types/octree/OctreeIndexHeader';
import {
  OCTREE_HEADER_BYTES_OFFSET,
  OCTREE_JSON_OFFSET,
} from '../../../src/data/octree/octreeFormat';
import { readOctreeHeader } from '../../../src/data/octree/readOctreeHeader';

export function readOctreeFileHeader<H extends OctreeIndexHeader | OctreeChunkHeader>(
  path: string,
  magic: string,
): H {
  const fd = openSync(path, 'r');
  try {
    const framing = new Uint8Array(OCTREE_JSON_OFFSET);
    readSync(fd, framing, 0, OCTREE_JSON_OFFSET, 0);
    const headerBytes = new DataView(framing.buffer).getUint32(OCTREE_HEADER_BYTES_OFFSET, true);
    const head = new Uint8Array(OCTREE_JSON_OFFSET + headerBytes);
    readSync(fd, head, 0, head.length, 0);
    return readOctreeHeader<H>(head.buffer, magic).header;
  } finally {
    closeSync(fd);
  }
}
