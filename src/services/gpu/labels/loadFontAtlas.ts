/**
 * loadFontAtlas — fetches and decodes the pre-baked MSDF font atlas
 * that the label renderer needs at GPU init time.
 *
 * ### What this does
 *
 * Loads two files in parallel:
 *
 *   - `<FONT_BASE>.json` — the BMFont metric JSON emitted by
 *     `tools/buildFontAtlas.ts`.  Parsed by `parseFontMetrics` into
 *     the O(1)-lookup `FontMetrics` shape the renderer's `setLabels`
 *     call uses for per-glyph UV / size / offset / advance reads.
 *
 *   - `<FONT_BASE>.png` — the pre-baked 512² MSDF texture atlas.
 *     Decoded via `createImageBitmap` so it arrives as a GPU-uploadable
 *     `ImageBitmap` that `createLabelRenderer` passes directly to
 *     `device.queue.copyExternalImageToTexture`.
 *
 * Both fetches are kicked off simultaneously via `Promise.all` — the
 * JSON parse is fast enough that it never becomes the bottleneck, and
 * `createImageBitmap` is the heavier of the two so parallel dispatch
 * halves the effective load time versus sequential awaits.
 *
 * ### Why a helper instead of inlining in initGpu.ts?
 *
 * `initGpu.ts` already has a large block of renderer construction;
 * adding two `fetch` calls + a JSON decode + a `createImageBitmap` inline
 * would interrupt the top-down reading of "which renderer gets built
 * where".  Extracting the load into a named helper (a) keeps `initGpu.ts`
 * focused on device + pipeline construction, (b) gives this pair a
 * home the test suite can stub without patching fetch, and (c) makes the
 * path "atlas load → renderer construction → subsystem wiring" legible
 * as a single comment line.
 *
 * ### Why no retry logic?
 *
 * These assets are served from `public/fonts/` at zero runtime latency on
 * localhost and via Cloudflare Workers Assets in production — the same CDN
 * that serves the JS bundle.  If either fetch fails the renderer simply
 * won't exist (the `initGpu` await will reject and the bootstrap phase
 * will surface an `onStatusChange({ kind: 'error' })` message), which is
 * the same behaviour as a failed GPU adapter request.  Retry logic would
 * be dead code for the vast majority of loads and add complexity for a
 * corner case better handled by the user's network layer.
 */

import { parseFontMetrics } from './fontMetrics';
import type { RawBMFont } from '../../../@types/rendering/RawBMFont';
import type { LoadedFontAtlas } from '../../../@types/rendering/LoadedFontAtlas';

/**
 * Base URL for the font atlas files.  Intentionally a relative path so
 * Vite serves them from `public/fonts/` in dev and Workers Assets serves
 * them from the same path in production — no env-var indirection needed
 * (the atlas is part of the static shell, not an R2 binary artifact).
 */
const FONT_BASE = '/fonts/jetbrains-mono';

/**
 * Load and decode the JetBrains Mono MSDF font atlas.
 *
 * Returns both the parsed `FontMetrics` (for per-glyph layout in
 * `setLabels`) and the decoded `ImageBitmap` (for GPU texture upload in
 * `createLabelRenderer`).
 *
 * Throws if either fetch returns a non-2xx status or if `createImageBitmap`
 * rejects — the caller (`initGpu`) lets that rejection bubble to the
 * bootstrap catch block, which surfaces it via `onStatusChange`.
 */
export async function loadFontAtlas(): Promise<LoadedFontAtlas> {
  const [json, png] = await Promise.all([
    fetch(`${FONT_BASE}.json`).then((r) => r.json() as Promise<RawBMFont>),
    fetch(`${FONT_BASE}.png`)
      .then((r) => r.blob())
      .then(createImageBitmap),
  ]);
  return { metrics: parseFontMetrics(json), bitmap: png };
}
