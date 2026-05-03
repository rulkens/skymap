/**
 * cloudLoader — parallel fetch + decode for the three real survey .bin files,
 * with a synthetic fallback when none of them resolve.
 *
 * ### Why parallel rather than sequential?
 *
 * The three pre-built clouds live at very different sizes — 2MRS is about
 * 2 MB, SDSS is around 23 MB, GLADE is roughly 96 MB.  Fetching them one
 * after another would mean the user stares at a blank canvas until the
 * slowest survey lands.  Kicking all three off with `Promise.allSettled`
 * lets the small files arrive first and become visible immediately while
 * the large one continues to stream in the background.
 *
 * ### Why progressive callbacks rather than batch resolution?
 *
 * The engine's `onCloudReady` callback fires once per survey as soon as
 * that survey's bytes are decoded, so the React layer can reflect the
 * partial load state ("loaded 2/3 surveys").  This shape keeps the cloud
 * loader free of any rendering concerns — it doesn't know about the
 * `PointRenderer` or the GPU; it just hands decoded clouds back to
 * `engine.ts`, which is responsible for uploading them.
 *
 * ### Synthetic fallback
 *
 * If **every** real fetch fails (404s during dev when no .bin files have
 * been built yet, offline, network errors, decode errors), the loader
 * generates a 100k-point procedural cloud and reports it under
 * `Source.Synthetic`.  The fallback only triggers when the real-data
 * count is zero — partial success (e.g. 2MRS works, SDSS fails) does NOT
 * fall back to synthetic, because the user still has *some* real data and
 * mixing synthetic in would be confusing.
 */

import { decodePointCloud } from '../../data/pointCloudFormat';
import { generateSyntheticCloud } from '../../data/synthetic';
import { Source } from '../../data/sources';
import type { PointCloud } from '../../@types';

/**
 * Discriminated source tag returned to callers that care about which load
 * path actually produced data.  Kept as a string union (rather than reusing
 * `Source`) because it specifically describes "what file did we load?",
 * which is a strict subset of the per-point `Source` enum.
 */
export type CloudSource = 'sdss.bin' | '2mrs.bin' | 'glade.bin' | 'synthetic';

/** One real survey .bin to attempt to fetch. */
type SurveyFile = {
  source: Source;
  url: string;
  cloudSource: CloudSource;
};

/**
 * The list of real surveys we try to load on startup.
 *
 * Listed in `Source` enum order (SDSS=1, TwoMRS=2, Glade=3) because the
 * renderer's per-source bookkeeping iterates surveys in enum order and we
 * find diff-reading easier when this file mirrors that order.
 */
const SURVEY_FILES: readonly SurveyFile[] = [
  { source: Source.SDSS, url: '/data/sdss.bin', cloudSource: 'sdss.bin' },
  { source: Source.TwoMRS, url: '/data/2mrs.bin', cloudSource: '2mrs.bin' },
  { source: Source.Glade, url: '/data/glade.bin', cloudSource: 'glade.bin' },
];

/** Per-survey load result the engine consumes. */
export type CloudLoadResult = {
  source: Source;
  cloudSource: CloudSource;
  cloud: PointCloud;
};

/**
 * Fetch a single .bin file and decode it.  Throws on any error so the
 * outer `Promise.allSettled` can record the failure without affecting
 * sibling fetches.
 */
async function fetchOne(file: SurveyFile): Promise<CloudLoadResult> {
  const res = await fetch(file.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file.url}`);
  const buf = await res.arrayBuffer();
  const cloud = decodePointCloud(buf);
  return { source: file.source, cloudSource: file.cloudSource, cloud };
}

/**
 * Kick off all three real-survey fetches in parallel and stream each
 * decoded cloud to `onResult` as soon as it lands.  Resolves once every
 * fetch has settled (succeeded or failed).
 *
 * If every fetch failed, the resolved value's `loadedCount` is 0 — the
 * caller can use that signal to drop in the synthetic fallback.
 *
 * @param onResult  Called once per successfully decoded survey, in
 *                  whatever order the parallel fetches happen to land.
 *                  This shape keeps the loader UI-agnostic: the engine
 *                  decides how to react (renderer.upload, status callback).
 * @returns         `loadedCount` — how many real surveys made it through.
 */
export async function loadAllClouds(
  onResult: (result: CloudLoadResult) => void,
): Promise<{ loadedCount: number }> {
  // Wrap each fetch so we can dispatch the per-survey callback as soon as
  // *that* survey resolves — `Promise.allSettled` itself only resolves
  // when every input has settled, so we can't rely on it for streaming.
  // The trick: each promise calls `onResult` inside its own `.then` and
  // *then* resolves; allSettled below just gives us the final count.
  const wrapped = SURVEY_FILES.map((file) =>
    fetchOne(file)
      .then((r) => {
        onResult(r);
        return r;
      })
      .catch((err) => {
        // We log here rather than letting `allSettled` swallow the reason
        // silently — surfacing the URL helps diagnose 404s during dev when
        // someone forgets to run `npm run build-all`.
        console.warn(`[cloudLoader] ${file.url} failed:`, err);
        throw err;
      }),
  );

  const results = await Promise.allSettled(wrapped);
  const loadedCount = results.filter((r) => r.status === 'fulfilled').length;
  return { loadedCount };
}

/**
 * Build the synthetic fallback cloud and tag it with `Source.Synthetic`.
 *
 * Lives here (rather than in `synthetic.ts` directly) so the engine has a
 * single import surface for cloud loading: real or fake, both come from
 * `cloudLoader`.  The point count matches the long-standing default of
 * 100k — small enough to render smoothly on integrated GPUs, large enough
 * that the no-data path still looks like "a galaxy field".
 */
export function buildSyntheticFallback(): CloudLoadResult {
  return {
    source: Source.Synthetic,
    cloudSource: 'synthetic',
    cloud: generateSyntheticCloud(100_000),
  };
}
