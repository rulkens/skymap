/**
 * encodeAntiqueEarthMap — the antique Earth map's bytes, the layout
 * `antiqueEarthMapFormat.ts` documents and `decodeAntiqueEarthMap` reads.
 * Strips are stably sorted by level and laid end to end, each one's last vertex
 * flagged; the header's level ends count the vertices at or below each level.
 * Signs keep the caller's (painter) order. Widths and sizes are quantised into
 * the style words and clamped to what their bits hold.
 */

import type { BakedAntiqueMap } from '../@types/BakedAntiqueMap';
import {
  ANTIQUE_EARTH_MAP_HEADER_BYTES,
  ANTIQUE_EARTH_MAP_MAGIC,
  ANTIQUE_EARTH_MAP_VERSION,
  ANTIQUE_FILL_VERTEX_BYTES,
  ANTIQUE_LINE_VERTEX_BYTES,
  ANTIQUE_MAP_LEVELS,
  ANTIQUE_SIGN_BYTES,
  LINE_STRIP_END,
  LINE_WIDTH_SCALE,
} from '../../../../src/layers/body/earth/antiqueMap/data/antiqueEarthMapFormat';
import { packAntiqueSignWord } from '../../../../src/layers/body/earth/antiqueMap/utils/packAntiqueSignWord';

const RAD = Math.PI / 180;
const byte = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

export function encodeAntiqueEarthMap(map: BakedAntiqueMap): Uint8Array {
  const { fill, signs } = map;
  const vertexCount = fill.codes.length;
  const strips = [...map.strips]
    .filter((strip) => strip.points.length >= 2)
    .sort((x, y) => x.level - y.level);
  const lineVertexCount = strips.reduce((n, strip) => n + strip.points.length, 0);

  const bytes = new ArrayBuffer(
    ANTIQUE_EARTH_MAP_HEADER_BYTES +
      vertexCount * ANTIQUE_FILL_VERTEX_BYTES +
      fill.indices.length * 4 +
      lineVertexCount * ANTIQUE_LINE_VERTEX_BYTES +
      signs.length * ANTIQUE_SIGN_BYTES,
  );
  const header = new Uint32Array(bytes, 0, ANTIQUE_EARTH_MAP_HEADER_BYTES / 4);
  header.set([
    ANTIQUE_EARTH_MAP_MAGIC,
    ANTIQUE_EARTH_MAP_VERSION,
    vertexCount,
    fill.indices.length,
    lineVertexCount,
    signs.length,
  ]);
  header.set(
    Array.from({ length: ANTIQUE_MAP_LEVELS }, (_, level) =>
      strips.filter((s) => s.level <= level).reduce((n, s) => n + s.points.length, 0),
    ),
    8,
  );

  let offset = ANTIQUE_EARTH_MAP_HEADER_BYTES;
  const vertices = new Float32Array(bytes, offset, vertexCount * 4);
  for (let i = 0; i < vertexCount; i++) {
    vertices.set(fill.positions.subarray(i * 3, i * 3 + 3), i * 4);
    vertices[i * 4 + 3] = fill.codes[i]!;
  }
  offset += vertexCount * ANTIQUE_FILL_VERTEX_BYTES;
  new Uint32Array(bytes, offset, fill.indices.length).set(fill.indices);
  offset += fill.indices.length * 4;

  const lineFloats = new Float32Array(bytes, offset, lineVertexCount * 4);
  const lineWords = new Uint32Array(bytes, offset, lineVertexCount * 4);
  let v = 0;
  for (const strip of strips) {
    strip.points.forEach((point, i) => {
      lineFloats.set([point.lonDeg * RAD, point.latDeg * RAD, point.arcKm], v * 4);
      lineWords[v * 4 + 3] =
        (byte(point.widthUnits * LINE_WIDTH_SCALE) |
          ((strip.kind & 15) << 8) |
          ((strip.level & 15) << 12) |
          (i === strip.points.length - 1 ? LINE_STRIP_END : 0)) >>>
        0;
      v++;
    });
  }
  offset += lineVertexCount * ANTIQUE_LINE_VERTEX_BYTES;

  const signFloats = new Float32Array(bytes, offset, signs.length * 3);
  const signWords = new Uint32Array(bytes, offset, signs.length * 3);
  signs.forEach((sign, i) => {
    signFloats.set([sign.lonDeg * RAD, sign.latDeg * RAD], i * 3);
    signWords[i * 3 + 2] = packAntiqueSignWord(sign);
  });
  return new Uint8Array(bytes);
}
