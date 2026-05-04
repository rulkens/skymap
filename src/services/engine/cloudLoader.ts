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
import type { PointCloud } from '../../@types';
import type { FilamentCloud } from '../../@types/FilamentCloud';

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
  // Curated atlas — small (~1 KB for 20 entries, ~10 KB for 150).
  // Loaded last so its result lands instantly even on slow connections.
  { source: Source.Famous, url: '/data/famous.bin', cloudSource: 'famous.bin' },
];

/** Per-survey load result the engine consumes. */
export type CloudLoadResult = {
  source: Source;
  cloudSource: CloudSource;
  cloud: PointCloud;
  /**
   * Old-index → new-index translation table, populated only when the
   * cloud was decimated post-decode (currently: GLADE).  Length matches
   * the *original* cloud's count; entries are the new index after
   * decimation, or -1 for points that were dropped.
   *
   * Required because runtime sidecars (notably `famous_xrefs.json`)
   * carry GLADE local indices that were valid against the ORIGINAL
   * binary.  After we drop ~40% of GLADE's far half, those indices
   * point at the wrong galaxies — or fall off the end.  The engine
   * walks the xrefs once at sidecar-load time and rewrites the GLADE
   * entries through this table.  See engine.ts's `loadFamousSidecars`
   * `.then` for the application site.
   */
  idxRemap?: Int32Array;
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
  let cloud = decodePointCloud(buf);
  // ── Far-galaxy decimation experiment (GLADE only) ─────────────────────
  //
  // GLADE contributes ~2 M of the catalog's ~3.5 M points and dominates
  // the back half of the visible volume past ~300 Mpc.  Measurement
  // showed the points pipeline is partially vertex-bound at default
  // settings, but a shader-side clip-space discard for the same set of
  // far points only gained ~10 fps because the GPU still runs the vertex
  // shader for clipped instances — only the rasteriser + fragment work
  // is skipped.  This CPU-side path drops the points entirely *before*
  // upload, so the GPU never sees them and the vertex shader runs
  // strictly fewer times.
  //
  // EXPERIMENT STATUS: hardcoded threshold + stride pending an FPS
  // measurement.  If the gain is real we'll formalise this with a
  // SettingsPanel control and address the famous-galaxy cross-reference
  // data (`famous_xrefs.json`) which currently points at GLADE local
  // indices that will shift under decimation.  For the measurement
  // pass the worst-case cross-ref breakage is "click 'Also catalogued
  // as GLADE row N' jumps to the wrong galaxy" — annoying but doesn't
  // crash anything.
  if (file.source === Source.Glade) {
    const before = cloud.count;
    const { cloud: decimated, idxRemap } = decimateFar(cloud, 300, 2);
    cloud = decimated;
    console.log(
      `[cloudLoader] GLADE decimated past 300 Mpc with stride 2: ${before} → ${cloud.count} points`,
    );
    return { source: file.source, cloudSource: file.cloudSource, cloud, idxRemap };
  }
  return { source: file.source, cloudSource: file.cloudSource, cloud };
}

/**
 * Drop every Nth point whose origin-relative distance exceeds `distanceMpc`.
 *
 * Bit-stable: the same input cloud always produces the same survivors, so
 * frame-to-frame rendering doesn't shimmer.  Foreground (d ≤ threshold) is
 * kept untouched — `stride` only kicks in for the back half, on the same
 * principle the depth-fade applies: distant galaxies contribute more
 * cumulatively (overlapping additive billboards in the depth column) and
 * the eye can't distinguish individuals out there anyway.
 *
 * Two-pass implementation: first count survivors, then allocate the new
 * typed arrays at the exact final size and copy each slot once.  An
 * append-and-trim approach with `subarray` would skip the pre-count but
 * leak the underlying ArrayBuffer's tail; explicit copies keep the
 * memory footprint clean.
 */
function decimateFar(
  cloud: PointCloud,
  distanceMpc: number,
  stride: number,
): { cloud: PointCloud; idxRemap: Int32Array } {
  const distSq = distanceMpc * distanceMpc;
  const positions = cloud.positions;
  const keep = new Uint8Array(cloud.count);
  let survivorCount = 0;
  for (let i = 0; i < cloud.count; i++) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    const d2 = x * x + y * y + z * z;
    // Foreground always kept.  Past the threshold, `i % stride === 0` is
    // the bit-stable culling rule — for stride 2 that's "keep every other".
    if (d2 <= distSq || i % stride === 0) {
      keep[i] = 1;
      survivorCount++;
    }
  }

  const out: PointCloud = {
    count: survivorCount,
    objIDs: new BigUint64Array(survivorCount),
    positions: new Float32Array(survivorCount * 3),
    magU: new Float32Array(survivorCount),
    magG: new Float32Array(survivorCount),
    magR: new Float32Array(survivorCount),
    magI: new Float32Array(survivorCount),
    magZ: new Float32Array(survivorCount),
    axisRatio: new Float32Array(survivorCount),
    positionAngleDeg: new Float32Array(survivorCount),
    diameterKpc: new Float32Array(survivorCount),
  };

  // Old → new index map.  -1 marks dropped points.  Sized to the original
  // cloud so consumers can blind-index by the pre-decimation localIdx
  // they received from sidecar JSON without bounds checks.
  const idxRemap = new Int32Array(cloud.count);

  let dst = 0;
  for (let src = 0; src < cloud.count; src++) {
    if (!keep[src]) {
      idxRemap[src] = -1;
      continue;
    }
    idxRemap[src] = dst;
    out.objIDs[dst] = cloud.objIDs[src]!;
    out.positions[dst * 3] = positions[src * 3]!;
    out.positions[dst * 3 + 1] = positions[src * 3 + 1]!;
    out.positions[dst * 3 + 2] = positions[src * 3 + 2]!;
    out.magU[dst] = cloud.magU[src]!;
    out.magG[dst] = cloud.magG[src]!;
    out.magR[dst] = cloud.magR[src]!;
    out.magI[dst] = cloud.magI[src]!;
    out.magZ[dst] = cloud.magZ[src]!;
    out.axisRatio[dst] = cloud.axisRatio[src]!;
    out.positionAngleDeg[dst] = cloud.positionAngleDeg[src]!;
    out.diameterKpc[dst] = cloud.diameterKpc[src]!;
    dst++;
  }

  return { cloud: out, idxRemap };
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
export async function loadFilaments(): Promise<FilamentCloud | null> {
  try {
    const res = await fetch('/data/filaments.bin');
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return decodeFilaments(buf);
  } catch (err) {
    console.warn('[cloudLoader] filaments.bin failed:', err);
    return null;
  }
}
