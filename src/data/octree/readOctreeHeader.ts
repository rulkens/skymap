import type { OctreeChunkHeader } from '../../@types/octree/OctreeChunkHeader';
import type { OctreeIndexHeader } from '../../@types/octree/OctreeIndexHeader';
import {
  OCTREE_HEADER_BYTES_OFFSET,
  OCTREE_JSON_OFFSET,
  OCTREE_VERSION,
  OCTREE_VERSION_OFFSET,
} from './octreeFormat';

const REGENERATE = 'please regenerate via "npm run build-stars"';

/** Reads the framing only; a wrong magic or version is a stale file, never a misread. */
export function readOctreeHeader<H extends OctreeIndexHeader | OctreeChunkHeader>(
  buf: ArrayBuffer,
  magic: string,
): { header: H; nodeTableOffset: number } {
  const bytes = new Uint8Array(buf);
  const got = String.fromCharCode(...bytes.subarray(0, magic.length));
  if (got !== magic) {
    throw new Error(`not an octree ${magic} object (magic ${JSON.stringify(got)}) — ${REGENERATE}`);
  }
  const dv = new DataView(buf);
  const version = dv.getUint16(OCTREE_VERSION_OFFSET, true);
  if (version !== OCTREE_VERSION) {
    throw new Error(`unsupported octree version: ${version} — ${REGENERATE}`);
  }
  const headerBytes = dv.getUint32(OCTREE_HEADER_BYTES_OFFSET, true);
  const nodeTableOffset = OCTREE_JSON_OFFSET + headerBytes;
  const json = new TextDecoder().decode(bytes.subarray(OCTREE_JSON_OFFSET, nodeTableOffset));
  return { header: JSON.parse(json) as H, nodeTableOffset };
}
