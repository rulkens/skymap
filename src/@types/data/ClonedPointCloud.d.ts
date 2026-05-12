/**
 * ClonedPointCloud — a structurally complete PointCloud whose typed-array
 * buffers are fresh, transferable copies, plus the matching Transferable[]
 * for `worker.postMessage`.
 *
 * Produced by `src/data/pointCloudTransfer.ts:clonePointCloudForTransfer`.
 * Lives here so consumer signatures don't have to depend on the runtime
 * `pointCloudTransfer.ts` module just for the return shape.
 */

import type { PointCloud } from './PointCloud';

export type ClonedPointCloud = {
  /** A structurally complete PointCloud whose typed-array buffers are fresh, transferable copies. */
  copy: PointCloud;
  /**
   * Transfer list of the copy's buffers in a stable order. Pass this
   * directly as the second argument to `worker.postMessage(payload, transfer)`.
   */
  transfer: Transferable[];
};
