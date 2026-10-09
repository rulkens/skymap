/**
 * fetchHorizonsRows — every row of a `HorizonsBody` over its span: the span's pieces fetched in
 * order and merged into one strictly increasing series.
 */
import type { HorizonsBody } from '../../bodies/@types/HorizonsBody';
import type { HorizonsVectorRow } from '../../parsers/@types/HorizonsVectorRow';
import { fetchHorizonsChunk } from './fetchHorizonsChunk';
import { horizonsFetchPieces } from './horizonsFetchPieces';
import { mergeHorizonsChunks } from './mergeHorizonsChunks';

export async function fetchHorizonsRows(body: HorizonsBody): Promise<HorizonsVectorRow[]> {
  const chunks: HorizonsVectorRow[][] = [];
  for (const [start, stop] of horizonsFetchPieces(body.span, body.stepMinutes))
    chunks.push(await fetchHorizonsChunk(body, start, stop));
  return mergeHorizonsChunks(chunks);
}
