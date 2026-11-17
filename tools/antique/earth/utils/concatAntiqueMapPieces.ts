/**
 * concatAntiqueMapPieces — the sources' pieces as one map: fills appended with
 * each piece's triangle indices shifted past the vertices before it, strips
 * appended (the encoder sorts them by level), signs appended in source order,
 * which is the painter order: a later source's signs draw over an earlier one's.
 */

import type { AntiqueMapPiece } from '../@types/AntiqueMapPiece';
import type { BakedAntiqueMap } from '../@types/BakedAntiqueMap';

export function concatAntiqueMapPieces(pieces: readonly AntiqueMapPiece[]): BakedAntiqueMap {
  const fills = pieces.flatMap((piece) => (piece.fill ? [piece.fill] : []));
  const vertexCount = fills.reduce((n, fill) => n + fill.codes.length, 0);
  const indexCount = fills.reduce((n, fill) => n + fill.indices.length, 0);
  const positions = new Float32Array(vertexCount * 3);
  const codes = new Uint8Array(vertexCount);
  const indices = new Uint32Array(indexCount);
  let vertex = 0;
  let index = 0;
  for (const fill of fills) {
    positions.set(fill.positions, vertex * 3);
    codes.set(fill.codes, vertex);
    for (let i = 0; i < fill.indices.length; i++) indices[index + i] = fill.indices[i]! + vertex;
    vertex += fill.codes.length;
    index += fill.indices.length;
  }
  return {
    fill: { positions, codes, indices },
    strips: pieces.flatMap((piece) => piece.strips ?? []),
    signs: pieces.flatMap((piece) => piece.signs ?? []),
  };
}
