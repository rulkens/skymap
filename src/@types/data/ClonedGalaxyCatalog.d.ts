/**
 * ClonedGalaxyCatalog — a structurally complete GalaxyCatalog whose typed-array
 * buffers are fresh, transferable copies, plus the matching Transferable[]
 * for `worker.postMessage`.
 *
 * Produced by `src/data/galaxyCatalogTransfer.ts:cloneGalaxyCatalogForTransfer`.
 * Lives here so consumer signatures don't have to depend on the runtime
 * `galaxyCatalogTransfer.ts` module just for the return shape.
 */

import type { GalaxyCatalog } from './GalaxyCatalog';

export type ClonedGalaxyCatalog = {
  /** A structurally complete GalaxyCatalog whose typed-array buffers are fresh, transferable copies. */
  copy: GalaxyCatalog;
  /**
   * Transfer list of the copy's buffers in a stable order. Pass this
   * directly as the second argument to `worker.postMessage(payload, transfer)`.
   */
  transfer: Transferable[];
};
