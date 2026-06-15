/**
 * loadFontAtlases — fetches and decodes every registered MSDF atlas in
 * parallel.  Returns a LoadedFontAtlases with one FontMetrics keyed by
 * FontId plus an array of decoded ImageBitmaps ordered to match FONT_IDS
 * (so `bitmaps[i]` uploads to GPU layer `i`).
 *
 * ## What this does
 *
 * For each font in `src/data/fonts.ts`:
 *
 *   - `<FONT_BASE>/<id>.json` — the BMFont metric JSON emitted by
 *     `tools/buildFontAtlas.ts`.  Parsed by `parseFontMetrics` into
 *     the O(1)-lookup `FontMetrics` shape the renderer's `setLabels`
 *     call uses for per-glyph UV / size / offset / advance reads.
 *
 *   - `<FONT_BASE>/<id>.png` — the pre-baked ATLAS_PX² MSDF texture.
 *     Decoded via `createImageBitmap` so it arrives as a GPU-uploadable
 *     `ImageBitmap` that `createLabelRenderer` passes directly to
 *     `device.queue.copyExternalImageToTexture` with
 *     `destination.origin.z = i` to land it in the right array layer.
 *
 * All N × 2 fetches kick off simultaneously via one `Promise.all` — the
 * JSON parse is fast enough that it never becomes the bottleneck, and
 * `createImageBitmap` is the heavier of the two per-font branches so
 * parallel dispatch halves the effective load time versus sequential
 * awaits.  HTTP/2 connection reuse keeps the per-font marginal cost
 * close to zero for the common case (one or two fonts).
 *
 * ## Why a `metricsByFont` Record and a positional `bitmaps` array?
 *
 * Two different access patterns — see the `LoadedFontAtlases` type doc.
 *
 * ## Why no retry logic?
 *
 * These assets are served from `public/fonts/` at zero runtime latency
 * on localhost and via Cloudflare Workers Assets in production — the
 * same CDN that serves the JS bundle.  If any fetch fails the renderer
 * simply won't exist (the `initGpu` await will reject and the bootstrap
 * phase will surface an `onStatusChange({ kind: 'error' })` message),
 * which is the same behaviour as a failed GPU adapter request.  Retry
 * logic would be dead code for the vast majority of loads and add
 * complexity for a corner case better handled by the user's network
 * layer.
 */

import { parseFontMetrics } from './fontMetrics';
import type { RawBMFont } from '../../../@types/rendering/RawBMFont';
import type { LoadedFontAtlases } from '../../../@types/rendering/LoadedFontAtlases';
import type { FontMetrics } from '../../../@types/rendering/FontMetrics';
import { FONT_IDS } from '../../../data/fonts';
import type { FontId } from '../../../@types/data/FontId';

/**
 * Base URL for the font atlas files.  Intentionally a relative path so
 * Vite serves them from `public/fonts/` in dev and Workers Assets
 * serves them from the same path in production — no env-var
 * indirection needed (atlases are part of the static shell, not R2
 * binary artifacts).
 */
const FONT_BASE = '/fonts';

/**
 * Fetch + decode the JSON + PNG for one font id.  Returns a tuple
 * `[FontMetrics, ImageBitmap]` so the outer Promise.all can keep the
 * positional ordering aligned with `FONT_IDS`.
 */
async function loadOneFont(id: FontId): Promise<readonly [FontMetrics, ImageBitmap]> {
  const [json, png] = await Promise.all([
    fetch(`${FONT_BASE}/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`failed to fetch ${id}.json: ${r.status}`);
      return r.json() as Promise<RawBMFont>;
    }),
    fetch(`${FONT_BASE}/${id}.png`)
      .then((r) => {
        if (!r.ok) throw new Error(`failed to fetch ${id}.png: ${r.status}`);
        return r.blob();
      })
      .then(createImageBitmap),
  ]);
  return [parseFontMetrics(json), png] as const;
}

/**
 * Load every registered MSDF atlas in parallel.  Throws if any fetch
 * rejects or any decode fails — `initGpu` lets that rejection bubble
 * to the bootstrap catch block, which surfaces it via `onStatusChange`.
 */
export async function loadFontAtlases(): Promise<LoadedFontAtlases> {
  const loaded = await Promise.all(FONT_IDS.map((id) => loadOneFont(id)));

  // Build the keyed metrics record by zipping FONT_IDS with the
  // resolved tuples.  Object.fromEntries would lose the FontId-narrow
  // key typing, so we build the record imperatively with an explicit
  // assertion at the end.
  const metricsByFont: Partial<Record<FontId, FontMetrics>> = {};
  const bitmaps: ImageBitmap[] = [];
  for (let i = 0; i < FONT_IDS.length; i++) {
    const id = FONT_IDS[i]!;
    const [metrics, bitmap] = loaded[i]!;
    metricsByFont[id] = metrics;
    bitmaps.push(bitmap);
  }
  return {
    metricsByFont: metricsByFont as Readonly<Record<FontId, FontMetrics>>,
    bitmaps,
  };
}
