/**
 * makeJsonFetcher — composes a Fetcher<T, Req> from a URL builder and a
 * pure parse function. Used by sidecar fetchers (famous-galaxies-meta, pgc-aliases)
 * that share the "GET, check ok, parse JSON, return decoded" shape.
 *
 * ### Why a factory rather than a single shared fetcher?
 *
 * Each sidecar parses into a different runtime shape (FamousGalaxyMetaEntry[]
 * vs Map<bigint, string[]>), and the parse step throws on schema
 * mismatch. Encoding that as a fetcher composition keeps the parse
 * logic in the same module as the URL choice and keeps the slot purely
 * generic over T. The slot doesn't know — and shouldn't — that JSON is
 * involved at all.
 *
 * ### Why not have the slot do this?
 *
 * The slot is intentionally generic over `<T, Req>`. Pushing JSON-aware
 * code into the slot would force every fetcher (binary, JSON, eventually
 * gRPC) to share one decode strategy. Composing it as a Fetcher factory
 * keeps the slot ignorant of wire format and lets each asset pick its
 * own decoder.
 *
 * ### No streaming progress
 *
 * Sidecar JSON files are small (few hundred KB at worst) and progress
 * UI on them would just flicker. The Fetcher's `onProgress` parameter
 * is ignored — callers using makeJsonFetcher accept that the loading
 * bar will jump from 0% to 100% in one tick. Use `fetchWithProgress`
 * directly for assets where streaming progress matters.
 */
import type { Fetcher } from '../../../@types/loading/Fetcher';
import { HttpError } from '../fetchWithProgress';

export function makeJsonFetcher<T, Req = void>(
  urlFor: (req: Req) => string,
  parse: (raw: string) => T,
): Fetcher<T, Req> {
  return async (req, signal) => {
    const url = urlFor(req);
    const res = await fetch(url, { signal });
    if (!res.ok) throw new HttpError(res.status, url);
    return parse(await res.text());
  };
}
