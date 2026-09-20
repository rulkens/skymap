/**
 * StarCatalogStreams — the leaf + aggregate stream pair `starCatalogPass`
 * persists per (catalog, viewSlot); see `streamsByCatalog` there for why the
 * key includes viewSlot (up to seven contexts walk one catalog per frame).
 */

import type { StarNodeStream } from './StarNodeStream';

export type StarCatalogStreams = { leaf: StarNodeStream; aggregate: StarNodeStream };
