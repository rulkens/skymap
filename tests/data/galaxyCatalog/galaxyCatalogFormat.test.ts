/**
 * Format-level tests for the v7 galaxy-catalog binary.
 *
 * Two contracts under test:
 *
 *   1. encode → decode is a faithful round trip for every field —
 *      the v7 `orientationIsFallback` byte, the v6 `spectroscopicZ`
 *      float, the v5 uint8 slots (`classByte`, `parentSurveyByte`),
 *      the v4 `diameterKpc`, the v3 orientation pair, the five
 *      magnitude bands, and full 64-bit `objID` precision (no silent
 *      coercion through `number`).
 *   2. Any foreign on-disk shape (bad magic, or any earlier format
 *      version) is rejected with the documented "regenerate" error —
 *      the format-version gate is the single source of truth for "do
 *      I understand this file?".
 */
import { describe, it, expect } from 'vitest';
import {
  encodeGalaxyCatalog,
  decodeGalaxyCatalog,
} from '../../../src/data/galaxyCatalog/galaxyCatalogFormat';
import type { GalaxyCatalog } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

/** Build a zero-filled v6 GalaxyCatalog of `count` records; tests override fields. */
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
    orientationIsFallback: new Uint8Array(count),
  };
}

describe('galaxyCatalogFormat — full round trip', () => {
  it('round-trips every scalar field plus full 64-bit objID precision', () => {
    const original = makeCatalog(2);
    // 1234567890123456789n exceeds Number.MAX_SAFE_INTEGER (2^53 − 1 ≈
    // 9 × 10^15), so any accidental conversion to `number` would silently
    // lose the low-order bits.
    original.objIDs.set([1234567890123456789n, 2n]);
    original.positions.set([1, 2, 3, 4, 5, 6]);
    original.magU.set([19.2, 17.8]);
    original.magG.set([18.5, 17.1]);
    original.magR.set([17.9, 16.6]);
    original.magI.set([17.6, 16.3]);
    original.magZ.set([17.4, 16.1]);
    original.axisRatio.set([0.42, 0.91]);
    original.positionAngleDeg.set([13.5, 142.25]);
    original.diameterKpc.set([30, 30]);

    const decoded = decodeGalaxyCatalog(encodeGalaxyCatalog(original));

    expect(decoded.count).toBe(2);
    // Positions round-trip through Float32, so exact equality is fine.
    expect(Array.from(decoded.positions)).toEqual(Array.from(original.positions));
    // objIDs must survive as bigints with full 64-bit precision — compared
    // as strings for a readable diff.
    expect(decoded.objIDs[0]!.toString()).toBe('1234567890123456789');
    expect(decoded.objIDs[1]!.toString()).toBe('2');
    // All five magnitude bands.
    expect(Array.from(decoded.magU)).toEqual(Array.from(original.magU));
    expect(Array.from(decoded.magG)).toEqual(Array.from(original.magG));
    expect(Array.from(decoded.magR)).toEqual(Array.from(original.magR));
    expect(Array.from(decoded.magI)).toEqual(Array.from(original.magI));
    expect(Array.from(decoded.magZ)).toEqual(Array.from(original.magZ));
    // v3 orientation fields.
    expect(Array.from(decoded.axisRatio)).toEqual(Array.from(original.axisRatio));
    expect(Array.from(decoded.positionAngleDeg)).toEqual(Array.from(original.positionAngleDeg));
  });

  it('encoded byte length matches 16 + count * 64', () => {
    // HEADER_BYTES=16, BYTES_PER_GALAXY=64. count=2 → 144; count=1 → 80.
    expect(encodeGalaxyCatalog(makeCatalog(2)).byteLength).toBe(16 + 2 * 64);
    expect(encodeGalaxyCatalog(makeCatalog(1)).byteLength).toBe(16 + 1 * 64);
  });
});

describe('galaxyCatalogFormat — v5/v6 fields', () => {
  it('round-trips classByte and parentSurveyByte for every record', () => {
    const cat = makeCatalog(3);
    cat.classByte[0] = 0;
    cat.classByte[1] = 1; // Milliquas Quasar
    cat.classByte[2] = 6; // Milliquas Candidate
    cat.parentSurveyByte[0] = 0; // literature
    cat.parentSurveyByte[1] = 1; // SDSS
    cat.parentSurveyByte[2] = 4; // WISEA

    const out = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));

    expect(Array.from(out.classByte)).toEqual([0, 1, 6]);
    expect(Array.from(out.parentSurveyByte)).toEqual([0, 1, 4]);
  });

  it('round-trips the persisted orientationIsFallback flag per record', () => {
    // The authoritative build-side provenance byte: 1 = deterministic
    // fallback orientation, 0 = real measurement.  Encode/decode must carry
    // it verbatim so the load side never re-hashes position to guess it.
    const cat = makeCatalog(4);
    cat.orientationIsFallback.set([1, 0, 1, 0]);

    const out = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));

    expect(Array.from(out.orientationIsFallback)).toEqual([1, 0, 1, 0]);
  });

  it('throws when orientationIsFallback length mismatches count', () => {
    const cat = makeCatalog(2);
    cat.orientationIsFallback = new Uint8Array([1]); // one short of count
    expect(() => encodeGalaxyCatalog(cat)).toThrow(/orientationIsFallback length mismatch/);
  });

  it('round-trips spectroscopicZ for every record including negatives and NaN', () => {
    const cat = makeCatalog(4);
    cat.spectroscopicZ[0] = 0.0234; // typical SDSS row
    cat.spectroscopicZ[1] = -0.00094; // M31 (real blueshift)
    cat.spectroscopicZ[2] = 0; // intentional zero (e.g. local fixture)
    cat.spectroscopicZ[3] = NaN; // no spec-z available

    const out = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));

    expect(out.spectroscopicZ[0]).toBeCloseTo(0.0234, 5);
    expect(out.spectroscopicZ[1]).toBeCloseTo(-0.00094, 5);
    expect(out.spectroscopicZ[2]).toBe(0);
    expect(Number.isNaN(out.spectroscopicZ[3])).toBe(true);
  });
});

describe('galaxyCatalogFormat — orientation round-trip', () => {
  it('round-trips finite axisRatio and positionAngleDeg', () => {
    const cat = makeCatalog(4);
    for (let i = 0; i < cat.count; i++) {
      // Deterministic but distinct values so an accidental swap between
      // axisRatio and positionAngleDeg shows up as a failure.
      cat.axisRatio[i] = 0.6 + 0.01 * i;
      cat.positionAngleDeg[i] = 30 + i;
    }
    const decoded = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));
    expect(Array.from(decoded.axisRatio)).toEqual(Array.from(cat.axisRatio));
    expect(Array.from(decoded.positionAngleDeg)).toEqual(Array.from(cat.positionAngleDeg));
  });

  it('round-trips the NaN "no measurement" sentinel', () => {
    // NaN is a legitimate "no measurement" marker. The encoder must preserve
    // it bit-for-bit through the Float32Array view; toEqual won't help here
    // because NaN !== NaN, so we test via Number.isNaN on each slot.
    const cat = makeCatalog(2);
    cat.axisRatio.fill(NaN);
    cat.positionAngleDeg.fill(NaN);
    const decoded = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));
    expect(Number.isNaN(decoded.axisRatio[0])).toBe(true);
    expect(Number.isNaN(decoded.axisRatio[1])).toBe(true);
    expect(Number.isNaN(decoded.positionAngleDeg[0])).toBe(true);
    expect(Number.isNaN(decoded.positionAngleDeg[1])).toBe(true);
  });
});

describe('galaxyCatalogFormat — diameterKpc', () => {
  it('round-trips finite diameterKpc values', () => {
    const cat = makeCatalog(2);
    cat.diameterKpc.set([30, 12.5]);
    const decoded = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));
    expect(Array.from(decoded.diameterKpc)).toEqual([30, 12.5]);
  });

  it('round-trips the NaN sentinel in diameterKpc', () => {
    const cat = makeCatalog(1);
    cat.diameterKpc[0] = NaN;
    const decoded = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));
    expect(Number.isNaN(decoded.diameterKpc[0])).toBe(true);
  });

  it('throws when diameterKpc length mismatches count', () => {
    const cat = makeCatalog(2);
    cat.diameterKpc = new Float32Array([30]); // one short of count
    expect(() => encodeGalaxyCatalog(cat)).toThrow(/diameterKpc length mismatch/);
  });
});

describe('galaxyCatalogFormat — header / version rejection', () => {
  it('rejects a bogus magic with the "bad magic" error', () => {
    const buf = new ArrayBuffer(16);
    new DataView(buf).setUint32(0, 0xdeadbeef, true);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/magic/);
  });

  it('rejects v6 with the version-specific regenerate error', () => {
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x504d4b53, true); // "SKMP"
    dv.setUint32(4, 6, true); // v6 — the previous on-disk shape
    dv.setUint32(8, 0, true);
    dv.setUint32(12, 0, true);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/unsupported version: 6/);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/regenerate/);
  });

  it('rejects every earlier version (v1–v6) with the same regenerate message', () => {
    // The version check fires before the per-record loop, so a 16-byte
    // header with count=0 is enough to exercise every foreign version.
    for (const version of [1, 2, 3, 4, 5, 6]) {
      const buf = new ArrayBuffer(16);
      const dv = new DataView(buf);
      dv.setUint32(0, 0x504d4b53, true);
      dv.setUint32(4, version, true);
      dv.setUint32(8, 0, true);
      dv.setUint32(12, 0, true);
      expect(() => decodeGalaxyCatalog(buf)).toThrow(/regenerate/i);
    }
  });

  it('points users at the modern build pipeline (build-tiers) for any bad version', () => {
    const buf = encodeGalaxyCatalog(makeCatalog(1));
    new DataView(buf).setUint32(4, 99, true); // arbitrary foreign version
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/version/);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/regenerate/);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/build-tiers/);
  });
});
