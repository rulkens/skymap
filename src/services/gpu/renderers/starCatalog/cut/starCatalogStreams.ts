import type { StarCatalog } from '../../../../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogStreams } from '../../../../../@types/rendering/StarCatalogStreams';
import { createStarNodeStream } from './starNodeStream';

/**
 * The two draw streams (leaf + aggregate) PERSIST per (catalog, viewSlot) pair
 * across frames and are reset+refilled each frame — never freshly allocated.
 * Keyed by viewSlot as well as the CATALOG object because up to seven distinct
 * `ctx`s walk one catalog per real frame (the main view plus six sky-cubemap
 * capture faces, the faces running before the main view's own draw); a
 * catalog-only key would have a capture face's walk reset+refill the same
 * arrays the main view's already-prepared cut still references. A replaced
 * catalog (tier swap) is a new object, so it starts fresh and the old map is
 * GC'd with the WeakMap.
 */
const streamsByCatalog = new WeakMap<StarCatalog, Map<number, StarCatalogStreams>>();

export function streamsFor(catalog: StarCatalog, viewSlot: number): StarCatalogStreams {
  let byViewSlot = streamsByCatalog.get(catalog);
  if (byViewSlot === undefined) {
    byViewSlot = new Map();
    streamsByCatalog.set(catalog, byViewSlot);
  }
  let streams = byViewSlot.get(viewSlot);
  if (streams === undefined) {
    streams = { leaf: createStarNodeStream(1024), aggregate: createStarNodeStream(1024) };
    byViewSlot.set(viewSlot, streams);
  }
  return streams;
}
