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
import { decodeFilaments } from '../../data/filamentBinaryFormat';
import { generateSyntheticCloud } from '../../data/synthetic';
import { Source } from '../../data/sources';
import { TIER_TARGETS, tierFilenameForSource } from '../../data/tierTargets';
import type { PointCloud } from '../../@types';
import type { FilamentCloud } from '../../@types/FilamentCloud';
import type { Tier } from '../../@types/Tier';

/**
 * Build a runtime URL for a `.bin` (or other static-data) asset.
 *
 * In dev, `VITE_DATA_BASE_URL` is empty — Vite serves `public/data/*` at the
 * relative path `/data/<file>`, so we return that directly and the browser
 * fetches same-origin against the dev server.
 *
 * In production, `VITE_DATA_BASE_URL` is set (e.g. `https://data.skymap.rulkens.com`)
 * to point at the R2 bucket's custom domain.  R2 object keys live under the
 * `data/` prefix so the URL pattern is identical across environments — only
 * the host changes.
 *
 * Trailing slashes on the base are tolerated so a `.env` file's
 * `VITE_DATA_BASE_URL=https://data.skymap.rulkens.com/` doesn't double up.
 */
export function dataUrl(filename: string): string {
  const base = (import.meta.env.VITE_DATA_BASE_URL ?? '').replace(/\/$/, '');
  return `${base}/data/${filename}`;
}

/**
 * Discriminated source tag returned to callers that care about which load
 * path actually produced data.  Kept as a string union (rather than reusing
 * `Source`) because it specifically describes "what file did we load?",
 * which is a strict subset of the per-point `Source` enum.
 */
export type CloudSource = 'sdss.bin' | '2mrs.bin' | 'glade.bin' | 'famous.bin' | 'synthetic';

/** One real survey .bin to attempt to fetch. */
type SurveyFile = {
  source: Source;
  url: string;
  cloudSource: CloudSource;
};

/**
 * Build the per-tier list of survey files to attempt.  Replaces the old
 * static SURVEY_FILES constant — different tiers fetch different filenames
 * (see `tierFilenameForSource`).  Sources whose tier-target is 0 (excluded)
 * are dropped from the list entirely so we don't 404-attempt them on
 * startup; the `setTier` orchestrator takes the same shortcut at swap time.
 *
 * Listed in `Source` enum order (SDSS=1, TwoMRS=2, Glade=3) because the
 * renderer's per-source bookkeeping iterates surveys in enum order and we
 * find diff-reading easier when this file mirrors that order.  Famous goes
 * last so its tiny result lands instantly even on slow connections.
 */
function surveyFilesForTier(tier: Tier): readonly SurveyFile[] {
  const candidates: { source: Source; cloudSource: CloudSource }[] = [
    { source: Source.SDSS, cloudSource: 'sdss.bin' },
    { source: Source.TwoMRS, cloudSource: '2mrs.bin' },
    { source: Source.Glade, cloudSource: 'glade.bin' },
    { source: Source.Famous, cloudSource: 'famous.bin' },
  ];
  const out: SurveyFile[] = [];
  for (const c of candidates) {
    if (TIER_TARGETS[tier][c.source] === 0) continue;
    out.push({
      source: c.source,
      url: dataUrl(tierFilenameForSource(c.source, tier)),
      cloudSource: c.cloudSource,
    });
  }
  return out;
}

/** Per-survey load result the engine consumes. */
export type CloudLoadResult = {
  source: Source;
  cloudSource: CloudSource;
  cloud: PointCloud;
};

/**
 * Lifecycle event from a streaming-progress fetch.
 *
 * The tagged shape lets a single callback handle all three phases without
 * the consumer having to track "is this the first chunk?" itself:
 *
 *   - `start`    fires once per source, immediately after the `fetch`'s
 *                response headers arrive (so the loading-bar UI can appear
 *                before any bytes have streamed in).  `total` is `0` when
 *                `Content-Length` is missing — UI falls back to indeterminate.
 *   - `progress` fires per chunk arrival.  `total` may be revised upward
 *                if a chunked-transfer response embeds the real size later.
 *   - `finish`   fires exactly once per source at the end of the stream
 *                — covers success, abort, and error symmetrically so the
 *                aggregator can always close out the entry.
 *
 * Tagged-union (rather than three separate callbacks) keeps the cloudLoader
 * API surface narrow — every entry point that takes progress takes one
 * `LoadEventCallback` and forwards every phase through it.
 */
/**
 * Identifier for one in-flight fetch in the loading-bar aggregator.
 *
 * Galaxy `.bin` fetches use the `Source` enum value; the optional
 * `filaments.bin` fetch uses the literal `'filaments'`.  Broadening
 * the key beyond `Source` keeps the loading-bar UI honest about all
 * the fetches happening on first paint — filaments are a non-trivial
 * download (~24 MB on the canonical merged build) that the user
 * should see represented in the progress fill.
 */
export type LoadEventSource = Source | 'filaments';

export type LoadEvent =
  | { type: 'start'; source: LoadEventSource; total: number }
  | { type: 'progress'; source: LoadEventSource; loaded: number; total: number }
  | { type: 'finish'; source: LoadEventSource };

export type LoadEventCallback = (event: LoadEvent) => void;

/**
 * Stream a `fetch` response body chunk-by-chunk so callers can observe
 * download progress in real time.  Returns the fully-assembled
 * `ArrayBuffer` once the stream ends — same shape `res.arrayBuffer()`
 * returns, just with progress events along the way.
 *
 * ### Why a custom stream loop instead of `res.arrayBuffer()`?
 *
 * `arrayBuffer()` resolves once the entire body is buffered, with no
 * intermediate observability — the UI sees one binary "click → 5 s
 * silence → done".  The body's `ReadableStream` reader, by contrast,
 * yields chunks as they arrive, so we can sum bytes-loaded and call
 * `onProgress` as the response streams in.  The cost is a manual
 * `chunks.push(value)` + final concat, which is microseconds-scale
 * compared to the network time we're observing.
 *
 * ### Why a separate concat at the end (not a single growing typed array)?
 *
 * Allocating one big buffer up-front would require knowing the total
 * size, which we may not (no `Content-Length`).  Pre-counting via two
 * passes would defeat the streaming purpose.  Push-then-concat hits the
 * sweet spot: O(N) memory, one final allocation of exactly the right
 * size, no early-termination resize.
 */
async function fetchWithProgress(
  url: string,
  source: LoadEventSource,
  signal: AbortSignal,
  onEvent?: LoadEventCallback,
): Promise<ArrayBuffer> {
  // Always fire `finish` on exit — success, abort, or error all end up
  // here, so the aggregator can always close out the entry.  The
  // try/finally below handles that uniformly; the success path still
  // explicitly wraps the body to ensure `finish` ordering with the
  // returned buffer.
  let finished = false;
  const fireFinish = () => {
    if (finished) return;
    finished = true;
    onEvent?.({ type: 'finish', source });
  };

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

    // `Content-Length` may be missing (chunked transfer, gzipped, some
    // proxies).  We cope by reporting `total: 0` — the loading-bar
    // component switches to an indeterminate shimmer in that case rather
    // than a misleading 0/0 ratio.
    const totalHeader = res.headers.get('Content-Length');
    const total = totalHeader ? Number.parseInt(totalHeader, 10) : 0;

    // Fire `start` immediately after headers — the loading bar appears
    // before any bytes stream in.
    onEvent?.({ type: 'start', source, total });

    // Some browsers (older Safari) and some unusual fetch shims don't
    // expose `res.body` as a ReadableStream.  Fall back to the
    // all-at-once path so we degrade to "no per-chunk progress events,
    // but still works".  Synthesise a single end-state progress event so
    // the bar still ratchets to full before finishing.
    if (!res.body) {
      const buf = await res.arrayBuffer();
      onEvent?.({ type: 'progress', source, loaded: buf.byteLength, total: buf.byteLength });
      fireFinish();
      return buf;
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onEvent?.({ type: 'progress', source, loaded, total });
    }

    // Concat all chunks into one contiguous ArrayBuffer.  Pre-sum the
    // length so the destination is allocated once.
    const combined = new Uint8Array(loaded);
    let offset = 0;
    for (const c of chunks) {
      combined.set(c, offset);
      offset += c.byteLength;
    }
    fireFinish();
    return combined.buffer;
  } catch (err) {
    fireFinish();
    throw err;
  }
}

/**
 * Fetch a single .bin file and decode it.  Throws on any error so the
 * outer `Promise.allSettled` can record the failure without affecting
 * sibling fetches.
 */
async function fetchOne(
  file: SurveyFile,
  signal: AbortSignal,
  onEvent?: LoadEventCallback,
): Promise<CloudLoadResult> {
  const buf = await fetchWithProgress(file.url, file.source, signal, onEvent);
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
  tier: Tier,
  onResult: (result: CloudLoadResult) => void,
  onEvent?: LoadEventCallback,
): Promise<{ loadedCount: number }> {
  // Wrap each fetch so we can dispatch the per-survey callback as soon as
  // *that* survey resolves — `Promise.allSettled` itself only resolves
  // when every input has settled, so we can't rely on it for streaming.
  // The trick: each promise calls `onResult` inside its own `.then` and
  // *then* resolves; allSettled below just gives us the final count.
  const surveyFiles = surveyFilesForTier(tier);

  // Register each fetch's AbortController in the shared `inflightControllers`
  // registry that `reloadSource` consults.  Without this, a tier-swap click
  // that lands BEFORE the initial parallel load finishes can't abort the
  // pre-existing fetch — both fetches race and the slower one wins,
  // overwriting the freshly-uploaded buffer with stale tier data.  Sharing
  // the registry makes the swap path's `prior.abort()` work uniformly
  // regardless of which path started the fetch.  See the registry's docblock.
  const wrapped = surveyFiles.map((file) => {
    // If the user has already triggered a swap for this source before
    // `loadAllClouds` even started its fetch (vanishingly rare in practice
    // but possible if React effects fire out-of-order), the swap's
    // `reloadSource` will have populated `inflightControllers` first.  Abort
    // any such prior — semantically the swap call wins.
    inflightControllers.get(file.source)?.abort();

    const controller = new AbortController();
    inflightControllers.set(file.source, controller);

    return fetchOne(file, controller.signal, onEvent)
      .then((r) => {
        // Drop late results if a swap has already taken over this source.
        if (controller.signal.aborted) return r;
        onResult(r);
        return r;
      })
      .catch((err) => {
        // AbortError is the expected "swap aborted me" path — silent. Other
        // errors (404, decode error) bubble through allSettled below.  We
        // also log here so dev-time 404s show up alongside the URL.
        if ((err as Error).name === 'AbortError') throw err;
        console.warn(`[cloudLoader] ${file.url} failed:`, err);
        throw err;
      })
      .finally(() => {
        // Only clear if we're still the latest controller for this source.
        // If a swap happened, its newer controller replaced ours and we
        // shouldn't unset its entry.
        if (inflightControllers.get(file.source) === controller) {
          inflightControllers.delete(file.source);
        }
      });
  });

  const results = await Promise.allSettled(wrapped);
  const loadedCount = results.filter((r) => r.status === 'fulfilled').length;
  return { loadedCount };
}

/**
 * Per-source AbortController registry — see `reloadSource` for the why.
 *
 * The hot-swap path lets the user click tier buttons faster than a fetch
 * resolves.  Without aborting the prior request, two fetches race each
 * other into `onResult`: the slower one wins (its callback fires last) and
 * stomps the freshly-uploaded buffer with a buffer from the previous tier.
 *
 * Keying by `Source` (not by source × tier) is correct: only one in-flight
 * cloud per source is ever valid.  Switching tiers always invalidates the
 * prior fetch for THIS source — even if it happens to be the same tier
 * (defensive: the user double-clicks "medium").
 */
const inflightControllers = new Map<Source, AbortController>();

/**
 * Re-fetch a single source's .bin for the given tier and dispatch the
 * decoded cloud to `onResult`.  Aborts and discards any in-flight fetch
 * for the same source.  Resolves after the fetch settles (success, abort,
 * or error).
 *
 * Aborted fetches do NOT call `onResult` — the engine's swap orchestrator
 * relies on this to avoid stale uploads.  Network/decode errors are logged
 * and swallowed so a failing tier swap doesn't crash the engine; the user
 * sees the previous tier's data unchanged on screen.
 *
 * Sources whose tier-target is 0 (excluded — e.g. SDSS in `small`) are
 * not fetched; instead `onResult` is called with an empty cloud so the
 * engine's downstream callback chain still fires (and the renderer can
 * tear down the source's GPU buffer to free VRAM).
 */
export async function reloadSource(
  source: Source,
  tier: Tier,
  onResult: (result: CloudLoadResult) => void,
  onEvent?: LoadEventCallback,
): Promise<void> {
  // Cancel any fetch already running for this source — see registry doc above.
  const prior = inflightControllers.get(source);
  if (prior) prior.abort();

  // Excluded tier: skip the fetch entirely, fire an empty-cloud callback
  // so the engine can clear this source's GPU buffer.  We delete the
  // controller registry entry too so a subsequent tier swap doesn't try
  // to abort a never-started fetch.
  if (TIER_TARGETS[tier][source] === 0) {
    inflightControllers.delete(source);
    const empty: PointCloud = {
      count: 0,
      objIDs: new BigUint64Array(0),
      positions: new Float32Array(0),
      magU: new Float32Array(0),
      magG: new Float32Array(0),
      magR: new Float32Array(0),
      magI: new Float32Array(0),
      magZ: new Float32Array(0),
      axisRatio: new Float32Array(0),
      positionAngleDeg: new Float32Array(0),
      diameterKpc: new Float32Array(0),
    };
    onResult({
      source,
      cloudSource: cloudSourceFor(source),
      cloud: empty,
    });
    return;
  }

  const controller = new AbortController();
  inflightControllers.set(source, controller);

  const url = dataUrl(tierFilenameForSource(source, tier));
  try {
    const buf = await fetchWithProgress(url, source, controller.signal, onEvent);
    // If a newer call has already aborted this controller, drop the result.
    if (controller.signal.aborted) return;
    const cloud = decodePointCloud(buf);
    onResult({ source, cloudSource: cloudSourceFor(source), cloud });
  } catch (err) {
    // AbortError is the expected "user clicked again" path — silent.  Any
    // other error is logged so dev-server 404s show up clearly.
    if ((err as Error).name !== 'AbortError') {
      console.warn(`[cloudLoader] reloadSource ${url} failed:`, err);
    }
  } finally {
    // Only clear if we're still the latest controller — otherwise a more
    // recent reload has already swapped in its own controller.
    if (inflightControllers.get(source) === controller) {
      inflightControllers.delete(source);
    }
  }
}

/**
 * Map a Source to its CloudSource discriminator string.  Centralised so
 * `reloadSource` and `loadAllClouds` agree on the value reported back to
 * the engine, which uses it for status-bar wording.
 */
function cloudSourceFor(source: Source): CloudSource {
  switch (source) {
    case Source.SDSS:
      return 'sdss.bin';
    case Source.TwoMRS:
      return '2mrs.bin';
    case Source.Glade:
      return 'glade.bin';
    case Source.Famous:
      return 'famous.bin';
    default:
      return 'synthetic';
  }
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

/**
 * Fetch and decode the optional `filaments.bin`.  Returns null when the
 * file is missing — filaments are an optional decorative layer; the
 * renderer must work without them, so we silently fall back rather than
 * throwing.  Network errors and decode errors both collapse to null.
 *
 * The famous-galaxies sidecar pattern (see famousMetaLoader.ts) is the
 * direct precedent here — small auxiliary asset, fail-safe to "feature
 * disabled" rather than aborting startup.
 */
export async function loadFilaments(onEvent?: LoadEventCallback): Promise<FilamentCloud | null> {
  // Fresh AbortController so the streaming-fetch helper has a signal to
  // honour.  We never abort filament loads (they're fire-and-forget at
  // engine boot — small enough that "let it finish" is fine), but the
  // helper's signature requires one.
  const controller = new AbortController();
  try {
    const buf = await fetchWithProgress(
      dataUrl('filaments.bin'),
      'filaments',
      controller.signal,
      onEvent,
    );
    return decodeFilaments(buf);
  } catch (err) {
    // 404 (no filaments built locally) and decode errors both collapse
    // to null — filaments are an optional layer; the renderer must work
    // without them.  The fetchWithProgress helper still fires its
    // `finish` event from the catch path, so the aggregator clears
    // its entry even when the load fails.
    console.warn('[cloudLoader] filaments.bin failed:', err);
    return null;
  }
}
