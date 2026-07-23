/**
 * galaxyCatalogTransfer — slice-and-transfer ceremony for GalaxyCatalog
 * worker payloads.
 *
 * ### Why this module exists
 *
 * Sending a GalaxyCatalog across a Worker boundary with structured-clone
 * cost would be prohibitive at ~2.5M galaxies. The cheap alternative is
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
 *      `worker.postMessage({ ...input, catalog: copy }, transfer)`.
 *
 * Pre-extraction this ceremony was open-coded three times across two
 * files. Adding a new GalaxyCatalog field meant editing all three sites
 * in lockstep; a missed edit silently sent `undefined` through the
 * worker boundary. This module is now the only place that knows
 * which fields GalaxyCatalog carries; future fields require one edit
 * here plus updating `tests/data/galaxyCatalogTransfer.test.ts`'s field
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

import type { GalaxyCatalog } from '../../@types/data/galaxyCatalog/GalaxyCatalog';
import type { ClonedGalaxyCatalog } from '../../@types/data/galaxyCatalog/ClonedGalaxyCatalog';

/**
 * Slice every typed-array buffer in `catalog` to produce a structurally
 * identical copy whose buffers are detached-ownership-ready, plus the
 * matching Transferable[] for `postMessage`.
 */
export function cloneGalaxyCatalogForTransfer(catalog: GalaxyCatalog): ClonedGalaxyCatalog {
  const copy: GalaxyCatalog = {
    count: catalog.count,
    objIDs: new BigUint64Array(catalog.objIDs.buffer.slice(0)),
    positions: new Float32Array(catalog.positions.buffer.slice(0)),
    magU: new Float32Array(catalog.magU.buffer.slice(0)),
    magG: new Float32Array(catalog.magG.buffer.slice(0)),
    magR: new Float32Array(catalog.magR.buffer.slice(0)),
    magI: new Float32Array(catalog.magI.buffer.slice(0)),
    magZ: new Float32Array(catalog.magZ.buffer.slice(0)),
    axisRatio: new Float32Array(catalog.axisRatio.buffer.slice(0)),
    positionAngleDeg: new Float32Array(catalog.positionAngleDeg.buffer.slice(0)),
    diameterKpc: new Float32Array(catalog.diameterKpc.buffer.slice(0)),
    classByte: new Uint8Array(catalog.classByte.buffer.slice(0)),
    parentSurveyByte: new Uint8Array(catalog.parentSurveyByte.buffer.slice(0)),
    spectroscopicZ: new Float32Array(catalog.spectroscopicZ.buffer.slice(0)),
    orientationIsFallback: new Uint8Array(catalog.orientationIsFallback.buffer.slice(0)),
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
    copy.classByte.buffer,
    copy.parentSurveyByte.buffer,
    copy.spectroscopicZ.buffer,
    copy.orientationIsFallback.buffer,
  ];
  return { copy, transfer };
}
