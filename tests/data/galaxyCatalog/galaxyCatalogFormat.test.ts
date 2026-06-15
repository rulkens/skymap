/**
 * Format-level tests for the v6 galaxy-catalog binary.
 *
 * Two contracts under test:
 *
 *   1. encode → decode is a faithful round trip for every field,
 *      including the v6 `spectroscopicZ` float, the v5 uint8 slots
 *      (`classByte`, `parentSurveyByte`), and the v4 baseline fields.
 *   2. A v5 buffer (the previous on-disk shape) is rejected with the
 *      documented "regenerate" error — the on-disk format-version
 *      gate is the single source of truth for "do I understand this
 *      file?".
 */
import { describe, it, expect } from 'vitest';
import {
  encodeGalaxyCatalog,
  decodeGalaxyCatalog,
} from '../../../src/data/galaxyCatalog/galaxyCatalogFormat';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

function makeCatalog(count: number): GalaxyCatalog {
  return {
    count,
    objIDs: BigUint64Array.from({ length: count }, (_, i) => BigInt(i + 1)),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    diameterKpc: new Float32Array(count),
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
    spectroscopicZ: new Float32Array(count),
  };
}

describe('encode/decode galaxy catalog v6', () => {
  it('round-trips classByte and parentSurveyByte for every record', () => {
    const cat = makeCatalog(3);
    cat.classByte[0] = 0;
    cat.classByte[1] = 1; // Milliquas Quasar
    cat.classByte[2] = 6; // Milliquas Candidate
    cat.parentSurveyByte[0] = 0; // literature
    cat.parentSurveyByte[1] = 1; // SDSS
    cat.parentSurveyByte[2] = 4; // WISEA

    const buf = encodeGalaxyCatalog(cat);
    const out = decodeGalaxyCatalog(buf);

    expect(Array.from(out.classByte)).toEqual([0, 1, 6]);
    expect(Array.from(out.parentSurveyByte)).toEqual([0, 1, 4]);
  });

  it('round-trips the other per-record fields untouched (regression vs v4)', () => {
    const cat = makeCatalog(2);
    cat.positions.set([10, 20, 30, -40, 50, -60]);
    cat.magG[0] = 17.25;
    cat.magG[1] = 19.5;
    cat.diameterKpc[0] = 25;
    cat.diameterKpc[1] = 18;
    cat.objIDs[0] = 123456789012345n;

    const out = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));

    expect(Array.from(out.positions)).toEqual([10, 20, 30, -40, 50, -60]);
    expect(out.magG[0]).toBeCloseTo(17.25, 5);
    expect(out.magG[1]).toBeCloseTo(19.5, 5);
    expect(out.diameterKpc[0]).toBe(25);
    expect(out.diameterKpc[1]).toBe(18);
    expect(out.objIDs[0]).toBe(123456789012345n);
  });

  it('round-trips spectroscopicZ for every record including negatives and NaN', () => {
    const cat = makeCatalog(4);
    cat.spectroscopicZ[0] = 0.0234; // typical SDSS row
    cat.spectroscopicZ[1] = -0.00094; // M31 (real blueshift)
    cat.spectroscopicZ[2] = 0; // intentional zero (e.g. local fixture)
    cat.spectroscopicZ[3] = NaN; // no spec-z available

    const buf = encodeGalaxyCatalog(cat);
    const out = decodeGalaxyCatalog(buf);

    expect(out.spectroscopicZ[0]).toBeCloseTo(0.0234, 5);
    expect(out.spectroscopicZ[1]).toBeCloseTo(-0.00094, 5);
    expect(out.spectroscopicZ[2]).toBe(0);
    expect(Number.isNaN(out.spectroscopicZ[3])).toBe(true);
  });

  it('rejects a v4 header with the documented regenerate error', () => {
    // Construct a minimally-valid v4-shaped header (16 bytes): magic
    // "SKMP", version 4, count 0, reserved 0.  The body length is 0
    // so we don't have to fill any records.
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x504d4b53, true); // "SKMP"
    dv.setUint32(4, 4, true);
    dv.setUint32(8, 0, true);
    dv.setUint32(12, 0, true);

    expect(() => decodeGalaxyCatalog(buf)).toThrow(/regenerate/);
  });

  it('rejects a v5 header with the documented regenerate error', () => {
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x504d4b53, true); // "SKMP"
    dv.setUint32(4, 5, true); // v5
    dv.setUint32(8, 0, true);
    dv.setUint32(12, 0, true);

    expect(() => decodeGalaxyCatalog(buf)).toThrow(/unsupported version: 5/);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/regenerate/);
  });

  it('rejects a bogus magic with the "bad magic" error', () => {
    const buf = new ArrayBuffer(16);
    new DataView(buf).setUint32(0, 0xdeadbeef, true);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/bad magic/);
  });
});
