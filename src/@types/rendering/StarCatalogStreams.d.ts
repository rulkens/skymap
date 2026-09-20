/**
 * StarCatalogStreams — the leaf + aggregate stream pair `computeStarCut`
 * persists per (catalog, viewSlot); see `streamsByCatalog` in
 * `renderers/starCatalog/cut/starCatalogStreams.ts` for why the key includes
 * viewSlot (up to seven contexts walk one catalog per frame).
 */

import type { StarNodeStream } from './StarNodeStream';

export type StarCatalogStreams = { leaf: StarNodeStream; aggregate: StarNodeStream };
