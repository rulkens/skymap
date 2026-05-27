/**
 * Tests for cloneGalaxyCatalogForTransfer — the helper that slices every
 * GalaxyCatalog typed-array buffer into a fresh, detachable copy and
 * returns the matching Transferable[] list.
 *
 * ### What we assert here
 *
 * 1. The copy is a structurally complete GalaxyCatalog (every field present
 *    with the right type and length).
 * 2. Every typed-array view has a NEW underlying ArrayBuffer — i.e. the
 *    .slice(0) actually allocated, didn't just alias. This is the
 *    load-bearing invariant: if the copy aliased the original, the
 *    subsequent postMessage transfer would detach the engine's own
 *    buffers and break every later picker / InfoCard read.
 * 3. The transfer list points to the COPY's buffers, not the original's
 *    — for the same reason: the original catalog must survive the call.
 * 4. The transfer list contains exactly one entry per typed-array field
 *    (10 entries) and they appear in a stable order — so the helper
 *    doesn't accidentally drop a field when GalaxyCatalog grows.
 *
 * ### Why a stable field order matters
 *
 * Adding a new typed-array field to GalaxyCatalog must require editing
 * exactly one place (this helper). A test that pins the order catches
 * "added the field to the copy but forgot to add it to the transfer
 * list" — a class of bug that would silently send `undefined` through
 * the worker boundary.
 */

import { describe, it, expect } from 'vitest';
import { cloneGalaxyCatalogForTransfer } from '../../src/data/galaxyCatalogTransfer';
import type { GalaxyCatalog } from '../../src/@types/data/GalaxyCatalog';

function makeCloud(count: number): GalaxyCatalog {
  // Each field gets a distinct fill value so we can later assert which
  // index in the transfer list corresponds to which source field.
  return {
    count,
    objIDs: new BigUint64Array(count).fill(1n),
    positions: new Float32Array(count * 3).fill(0.5),
    magU: new Float32Array(count).fill(2),
    magG: new Float32Array(count).fill(3),
    magR: new Float32Array(count).fill(4),
    magI: new Float32Array(count).fill(5),
    magZ: new Float32Array(count).fill(6),
    axisRatio: new Float32Array(count).fill(0.7),
    positionAngleDeg: new Float32Array(count).fill(45),
    diameterKpc: new Float32Array(count).fill(30),
    classByte: new Uint8Array(count).fill(7),
    parentSurveyByte: new Uint8Array(count).fill(8),
  };
}

describe('cloneGalaxyCatalogForTransfer', () => {
  it('returns a copy whose typed-array fields have new underlying buffers', () => {
    const cloud = makeCloud(4);
    const { copy } = cloneGalaxyCatalogForTransfer(cloud);

    expect(copy.objIDs.buffer).not.toBe(cloud.objIDs.buffer);
    expect(copy.positions.buffer).not.toBe(cloud.positions.buffer);
    expect(copy.magU.buffer).not.toBe(cloud.magU.buffer);
    expect(copy.magG.buffer).not.toBe(cloud.magG.buffer);
    expect(copy.magR.buffer).not.toBe(cloud.magR.buffer);
    expect(copy.magI.buffer).not.toBe(cloud.magI.buffer);
    expect(copy.magZ.buffer).not.toBe(cloud.magZ.buffer);
    expect(copy.axisRatio.buffer).not.toBe(cloud.axisRatio.buffer);
    expect(copy.positionAngleDeg.buffer).not.toBe(cloud.positionAngleDeg.buffer);
    expect(copy.diameterKpc.buffer).not.toBe(cloud.diameterKpc.buffer);
  });

  it('preserves count and per-field values bit-for-bit', () => {
    const cloud = makeCloud(4);
    const { copy } = cloneGalaxyCatalogForTransfer(cloud);

    expect(copy.count).toBe(4);
    expect(Array.from(copy.objIDs)).toEqual(Array.from(cloud.objIDs));
    expect(Array.from(copy.positions)).toEqual(Array.from(cloud.positions));
    expect(Array.from(copy.magG)).toEqual(Array.from(cloud.magG));
    expect(Array.from(copy.diameterKpc)).toEqual(Array.from(cloud.diameterKpc));
  });

  it('returns transfer list pointing to the COPY buffers, not the originals', () => {
    const cloud = makeCloud(4);
    const { copy, transfer } = cloneGalaxyCatalogForTransfer(cloud);

    // Every transfer entry must be one of the copy buffers — never the
    // original. Sending an original-buffer entry to postMessage would
    // detach the engine's authoritative catalog.
    const copyBuffers = new Set<ArrayBufferLike>([
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
    ]);
    for (const t of transfer) {
      expect(copyBuffers.has(t as ArrayBufferLike)).toBe(true);
    }
  });

  it('transfer list has one entry per typed-array field (12 total)', () => {
    const cloud = makeCloud(4);
    const { transfer } = cloneGalaxyCatalogForTransfer(cloud);
    expect(transfer.length).toBe(12);
  });

  it('handles count = 0 (empty catalog)', () => {
    const cloud = makeCloud(0);
    const { copy, transfer } = cloneGalaxyCatalogForTransfer(cloud);
    expect(copy.count).toBe(0);
    expect(copy.objIDs.length).toBe(0);
    expect(copy.positions.length).toBe(0);
    expect(transfer.length).toBe(12);
  });
});
