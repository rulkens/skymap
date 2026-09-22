import type { StarCatalog } from '../../../../@types/data/starCatalog/StarCatalog';
import type { StarCatalogStreams } from '../../../../@types/rendering/StarCatalogStreams';
import { createStarNodeStream } from './starNodeStream';

/**
 * The two streams persist per (catalog, viewSlot) pair, reset+refilled each
 * frame rather than freshly allocated. Keyed by viewSlot too because up to
 * seven `ctx`s (main view + six sky-cubemap capture faces) walk one catalog
 * per real frame — a catalog-only key would have a capture face's walk
 * clobber the arrays the main view's already-prepared cut still references.
 * A tier swap hands a fresh catalog object, so it starts clean.
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
