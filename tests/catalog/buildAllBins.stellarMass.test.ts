/**
 * buildAllBins — stellar-mass wiring smoke test.
 *
 * The estimated-mass provenance bit is a byte-layout contract with the
 * shipped `.bin` (flags byte at record offset 54, bit 2), so it is pinned
 * here on the encoded buffer rather than on the in-memory cloud. The
 * estimator's own formula is pinned by `estimateLog10StellarMass.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { recordsToCloud } from '../../tools/catalog/buildAllBins';
import type { ParsedRecord } from '../../tools/parsers/common';
import { Source } from '../../src/data/sources';
import { encodeGalaxyCatalog } from '../../src/data/galaxyCatalog/galaxyCatalogFormat';

function record(source: ParsedRecord['source'], objID: bigint): ParsedRecord {
  return {
    source,
    objID,
    ra: 185.3,
    dec: 12.7,
    z: 0.02,
    spectroscopicZ: 0.02,
    magU: 18.2,
    magG: 17.5,
    magR: 16.8,
    magI: 16.3,
    magZ: 16.0,
    axisRatio: null,
    positionAngleDeg: null,
    diameterKpc: null,
    classByte: 0,
    parentSurveyByte: 0,
  };
}

describe('buildAllBins — stellar-mass wiring', () => {
  const records = [record(Source.SDSS, 1n), record(Source.Milliquas, 2n)];

  it('the mass-is-estimated bit rides the encoded flags byte', () => {
    const cloud = recordsToCloud(records);
    const buf = encodeGalaxyCatalog(cloud);
    const bytes = new Uint8Array(buf);
    const flagsSdss = bytes[16 + 0 * 64 + 54]!;
    const flagsMilliquas = bytes[16 + 1 * 64 + 54]!;
    expect((flagsSdss >> 2) & 1).toBe(1);
    expect((flagsMilliquas >> 2) & 1).toBe(0);
  });
});
