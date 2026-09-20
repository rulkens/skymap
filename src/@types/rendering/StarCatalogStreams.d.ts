/** The leaf + aggregate stream pair `computeStarCut` persists per (catalog,
 * viewSlot) — see `starCatalogStreams.ts` for the viewSlot-keying rationale. */

import type { StarNodeStream } from './StarNodeStream';

export type StarCatalogStreams = { leaf: StarNodeStream; aggregate: StarNodeStream };
