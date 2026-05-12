/**
 * pointCloudTransfer — slice-and-transfer ceremony for PointCloud
 * worker payloads.
 *
 * ### Why this module exists
 *
 * Sending a PointCloud across a Worker boundary with structured-clone
 * cost would be prohibitive at ~3.5M galaxies. The cheap alternative is
 * `postMessage(payload, transfer)` with a list of `ArrayBuffer`s to
 * transfer ownership of — but we can't transfer the engine's
 * authoritative buffers (the picker and InfoCard read them after the
 * bake kicks off). The pattern is:
 *
 *   1. `slice(0)` every typed-array's `.buffer` to mint a fresh,
 *      engine-disjoint copy.
 *   2. Wrap each fresh buffer in the right view (BigUint64Array for
 *      `objIDs`; Float32Array for everything else).
 *   3. Build a Transferable[] of the copy buffers.
 *   4. Hand both back to the caller; they call
 *      `worker.postMessage({ ...input, cloud: copy }, transfer)`.
 *
 * Pre-extraction this ceremony was open-coded three times across two
 * files. Adding a new PointCloud field meant editing all three sites
 * in lockstep; a missed edit silently sent `undefined` through the
 * worker boundary. This module is now the only place that knows
 * which fields PointCloud carries; future fields require one edit
 * here plus updating `tests/data/pointCloudTransfer.test.ts`'s field
 * count assertion.
 *
 * ### Note on BigUint64Array
 *
 * BigUint64Array itself is NOT on the Transferable allowlist, but its
 * underlying `.buffer` (a plain ArrayBuffer) IS. The receiving worker
 * reconstructs the BigUint64Array view over the transferred buffer
 * via the structured-clone roundtrip of the typed-array wrapper
 * (HTML spec §StructuredSerialize step "If value has [[ArrayBufferData]]…").
 */

import type { PointCloud } from '../@types/data/PointCloud';
import type { ClonedPointCloud } from '../@types/data/ClonedPointCloud';

/**
 * Slice every typed-array buffer in `cloud` to produce a structurally
 * identical copy whose buffers are detached-ownership-ready, plus the
 * matching Transferable[] for `postMessage`.
 */
export function clonePointCloudForTransfer(cloud: PointCloud): ClonedPointCloud {
  const copy: PointCloud = {
    count: cloud.count,
    objIDs: new BigUint64Array(cloud.objIDs.buffer.slice(0)),
    positions: new Float32Array(cloud.positions.buffer.slice(0)),
    magU: new Float32Array(cloud.magU.buffer.slice(0)),
    magG: new Float32Array(cloud.magG.buffer.slice(0)),
    magR: new Float32Array(cloud.magR.buffer.slice(0)),
    magI: new Float32Array(cloud.magI.buffer.slice(0)),
    magZ: new Float32Array(cloud.magZ.buffer.slice(0)),
    axisRatio: new Float32Array(cloud.axisRatio.buffer.slice(0)),
    positionAngleDeg: new Float32Array(cloud.positionAngleDeg.buffer.slice(0)),
    diameterKpc: new Float32Array(cloud.diameterKpc.buffer.slice(0)),
  };
  const transfer: Transferable[] = [
    copy.objIDs.buffer,
    copy.positions.buffer,
    copy.magU.buffer,
    copy.magG.buffer,
    copy.magR.buffer,
    copy.magI.buffer,
    copy.magZ.buffer,
    copy.axisRatio.buffer,
    copy.positionAngleDeg.buffer,
    copy.diameterKpc.buffer,
  ];
  return { copy, transfer };
}
