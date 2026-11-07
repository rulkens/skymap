/**
 * decodeAntiqueEarthMap — views into the antique Earth map's bytes
 * (`antiqueEarthMapFormat.ts`). A wrong magic or version throws, so a stale
 * bake fails loudly rather than drawing garbage.
 */

import type { AntiqueEarthMap } from '../@types/AntiqueEarthMap';
import {
  ANTIQUE_EARTH_MAP_HEADER_BYTES,
  ANTIQUE_EARTH_MAP_MAGIC,
  ANTIQUE_EARTH_MAP_VERSION,
  ANTIQUE_FILL_VERTEX_BYTES,
  ANTIQUE_LINE_VERTEX_BYTES,
  ANTIQUE_MAP_LEVELS,
  ANTIQUE_SIGN_BYTES,
} from '../data/antiqueEarthMapFormat';

export function decodeAntiqueEarthMap(buffer: ArrayBuffer): AntiqueEarthMap {
  const header = new Uint32Array(buffer, 0, ANTIQUE_EARTH_MAP_HEADER_BYTES / 4);
  if (header[0] !== ANTIQUE_EARTH_MAP_MAGIC || header[1] !== ANTIQUE_EARTH_MAP_VERSION) {
    throw new Error(
      `antique Earth map: unsupported version ${header[1]} — re-run npm run build-antique-earth`,
    );
  }
  const [fillVertexCount, fillIndexCount, lineVertexCount, signCount] = header.subarray(2, 6);
  let offset = ANTIQUE_EARTH_MAP_HEADER_BYTES;
  const take = (bytes: number): Uint8Array => {
    const view = new Uint8Array(buffer, offset, bytes);
    offset += bytes;
    return view;
  };
  return {
    fillVertices: take(fillVertexCount! * ANTIQUE_FILL_VERTEX_BYTES),
    fillIndices: take(fillIndexCount! * 4),
    fillIndexCount: fillIndexCount!,
    lineVertices: take(lineVertexCount! * ANTIQUE_LINE_VERTEX_BYTES),
    lineLevelEnds: Array.from(header.subarray(8, 8 + ANTIQUE_MAP_LEVELS)),
    signs: take(signCount! * ANTIQUE_SIGN_BYTES),
    signCount: signCount!,
  };
}
