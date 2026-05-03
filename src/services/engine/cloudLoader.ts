/**
 * cloudLoader — fetch + decode the SDSS point cloud, with synthetic fallback.
 *
 * `loadCloud` is the engine's first piece of I/O.  On success it returns the
 * real galaxy cloud decoded from `/data/sdss.bin`; on any failure (404,
 * network error, malformed bytes) it logs a warning and returns a 100k
 * synthetic cloud so the rest of the app stays functional during dev /
 * demos when the data file isn't present.
 *
 * The discriminated `CloudSource` tag travels back to the engine so that the
 * cloud can be uploaded to the renderer under the correct `Source` enum
 * value (real → `Source.SDSS`, fallback → `Source.Synthetic`) and so the
 * status callback can report which path was taken.
 *
 * Lives in its own file because the fetch path is otherwise the only piece
 * of network I/O in the engine — extracting it keeps `engine.ts` focused on
 * the imperative GPU/render-loop core.
 */

import { decodePointCloud } from '../../data/pointCloudFormat';
import { generateSyntheticCloud } from '../../data/synthetic';
import type { PointCloud } from '../../@types';

/** Discriminated source tag returned by `loadCloud`. */
export type CloudSource = 'sdss.bin' | 'synthetic';

/**
 * Attempt to load the pre-built SDSS binary at `/data/sdss.bin`.
 *
 * If the fetch succeeds and the file decodes cleanly, returns the real galaxy
 * cloud with `source: 'sdss.bin'`. On any failure (404, network error, bad
 * magic bytes, etc.) logs a warning and falls back to a 100k synthetic cloud
 * so the app remains functional without the data file.
 */
export async function loadCloud(): Promise<{ cloud: PointCloud; source: CloudSource }> {
  try {
    const res = await fetch('/data/sdss.bin');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const cloud = decodePointCloud(buf);
    return { cloud, source: 'sdss.bin' };
  } catch (err) {
    console.warn('SDSS bin not available; using synthetic fallback.', err);
    return { cloud: generateSyntheticCloud(100_000), source: 'synthetic' };
  }
}
