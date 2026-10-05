/**
 * fetchHorizonsChunk — one Horizons query, retried with a growing pause (the API drops
 * requests under load).
 */
import { parseHorizonsVectorsCsv } from '../../parsers/horizonsVectorsCsv';
import type { HorizonsVectorRow } from '../../parsers/@types/HorizonsVectorRow';
import type { HorizonsBody } from '../../bodies/@types/HorizonsBody';
import { horizonsQueryUrl } from './horizonsQueryUrl';

const MAX_ATTEMPTS = 5;

export async function fetchHorizonsChunk(
  body: HorizonsBody,
  start: string,
  stop: string,
): Promise<HorizonsVectorRow[]> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(horizonsQueryUrl(body, start, stop));
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const json = (await response.json()) as { result?: string; error?: string };
      if (json.error || !json.result) throw new Error(json.error ?? 'empty result');
      return parseHorizonsVectorsCsv(json.result);
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      console.warn(`fetchHorizons: ${body.id} ${start} attempt ${attempt} failed: ${err}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}
