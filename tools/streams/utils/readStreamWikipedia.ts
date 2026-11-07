import { parseWikipediaSummary, wikipediaSummaryUrl } from '../../parsers/wikipediaSummary';
import { delay } from '../../utils/async/delay';
import { loadJsonCache } from '../../utils/io/loadJsonCache';
import { saveJsonCache } from '../../utils/io/saveJsonCache';
import type { StreamWikipedia } from '../@types/StreamWikipedia';

/**
 * The curated articles' summaries by stream name (`titles`: stream name → article title). The
 * cache holds each REST body, parsed, by article title, so a rebuild with every row cached makes
 * no request; a missing one is fetched once, `delayMs` after the last. A body that is not a standard article, or no body, throws: the table lists only real ones.
 */
export async function readStreamWikipedia(
  titles: Readonly<Record<string, string>>,
  cachePath: string,
  fetchBody: (url: string) => Promise<string | null>,
  delayMs: number,
): Promise<Record<string, StreamWikipedia>> {
  const cache = loadJsonCache<Record<string, unknown>>(cachePath);
  const out: Record<string, StreamWikipedia> = {};
  let fetched = false;
  for (const [name, title] of Object.entries(titles)) {
    if (cache[title] === undefined) {
      if (fetched) await delay(delayMs);
      const body = await fetchBody(wikipediaSummaryUrl(title));
      fetched = true;
      if (body === null) throw new Error(`readStreamWikipedia: no summary for ${name} (${title})`);
      cache[title] = JSON.parse(body);
      saveJsonCache(cachePath, cache);
    }
    const summary = parseWikipediaSummary(JSON.stringify(cache[title]));
    if (summary.type !== 'standard') {
      throw new Error(`readStreamWikipedia: ${name} (${title}) is a ${summary.type} page`);
    }
    out[name] = { title, extract: summary.extract };
  }
  return out;
}
