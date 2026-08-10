/**
 * Format-level tests for the v9 galaxy-catalog binary.
 *
 * Three contracts under test:
 *
 *   1. encode → decode is a faithful round trip for every field —
 *      the v9 `log10StellarMass` float and packed flags byte, the v8
 *      `diameterIsFallback` bit, the v7 `orientationIsFallback` bit, the
 *      v6 `spectroscopicZ` float, the v5 uint8 slots (`classByte`,
 *      `parentSurveyByte`), the v4 `diameterKpc`, the v3 orientation pair,
 *      the five magnitude bands, and full 64-bit `objID` precision (no
 *      silent coercion through `number`).
 *   2. Any foreign on-disk shape (bad magic, or any earlier format
 *      version) is rejected with the documented "regenerate" error —
 *      the format-version gate is the single source of truth for "do
 *      I understand this file?".
 *   3. `GALAXY_CATALOG_FIELD_SPECS` itself lays out a self-consistent 64 B
 *      record — no two `'field'` byte ranges overlap, everything fits the
 *      stride, and the flag bits share one byte at distinct positions.
 */
import { describe, it, expect } from 'vitest';
import {
  encodeGalaxyCatalog,
  decodeGalaxyCatalog,
  GALAXY_CATALOG_FIELD_SPECS,
} from '../../../src/data/galaxyCatalog/galaxyCatalogFormat';
import { FormatVersionError } from '../../../src/data/formatVersionError';
import { makeGalaxyCatalog } from '../../fixtures/makeGalaxyCatalog';

const BYTES_PER_GALAXY = 64;
const COLUMN_SIZE: Record<'u64' | 'f32' | 'u8', number> = { u64: 8, f32: 4, u8: 1 };

describe('galaxyCatalogFormat — full round trip', () => {
  it('round-trips every scalar field plus full 64-bit objID precision', () => {
    const original = makeGalaxyCatalog(2);
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
    expect(encodeGalaxyCatalog(makeGalaxyCatalog(2)).byteLength).toBe(16 + 2 * 64);
    expect(encodeGalaxyCatalog(makeGalaxyCatalog(1)).byteLength).toBe(16 + 1 * 64);
  });
});

describe('galaxyCatalogFormat — v5/v6 fields', () => {
  it('round-trips classByte and parentSurveyByte for every record', () => {
    const cat = makeGalaxyCatalog(3);
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
    const cat = makeGalaxyCatalog(4);
    cat.orientationIsFallback.set([1, 0, 1, 0]);

    const out = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));

    expect(Array.from(out.orientationIsFallback)).toEqual([1, 0, 1, 0]);
  });

  it('throws when orientationIsFallback length mismatches count', () => {
    const cat = makeGalaxyCatalog(2);
    cat.orientationIsFallback = new Uint8Array([1]); // one short of count
    expect(() => encodeGalaxyCatalog(cat)).toThrow(/orientationIsFallback length mismatch/);
  });

  it('round-trips the persisted diameterIsFallback flag per record', () => {
    // Same authoritative-flag contract as orientationIsFallback, the
    // neighbouring bit in the same flags byte: 1 = diameterKpc is the flat
    // 30-kpc fallback, 0 = a real / angular-derived measurement.
    const cat = makeGalaxyCatalog(4);
    cat.diameterIsFallback.set([1, 0, 1, 0]);

    const out = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));

    expect(Array.from(out.diameterIsFallback)).toEqual([1, 0, 1, 0]);
  });

  it('round-trips spectroscopicZ for every record including negatives and NaN', () => {
    const cat = makeGalaxyCatalog(4);
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

describe('galaxyCatalogFormat — v9 fields', () => {
  it('packs the three provenance bits into the flags byte at record offset 54', () => {
    // Rows 0-3 cover (orientationIsFallback, diameterIsFallback) ∈ {0,1}²
    // with a finite mass (bit 2 set); rows 4-7 repeat the same four
    // combinations with mass = NaN (bit 2 clear).
    const cat = makeGalaxyCatalog(8);
    cat.orientationIsFallback.set([0, 0, 1, 1, 0, 0, 1, 1]);
    cat.diameterIsFallback.set([0, 1, 0, 1, 0, 1, 0, 1]);
    cat.log10StellarMass.set([10.5, 10.5, 10.5, 10.5, NaN, NaN, NaN, NaN]);

    const buf = encodeGalaxyCatalog(cat);
    const bytes = new Uint8Array(buf);
    const flagsByte = (i: number) => bytes[16 + i * 64 + 54]!;

    expect([0, 1, 2, 3, 4, 5, 6, 7].map(flagsByte)).toEqual([
      0b100, // orientation=0 diameter=0 mass=finite
      0b110, // orientation=0 diameter=1 mass=finite
      0b101, // orientation=1 diameter=0 mass=finite
      0b111, // orientation=1 diameter=1 mass=finite
      0b000, // orientation=0 diameter=0 mass=NaN
      0b010, // orientation=0 diameter=1 mass=NaN
      0b001, // orientation=1 diameter=0 mass=NaN
      0b011, // orientation=1 diameter=1 mass=NaN
    ]);

    const decoded = decodeGalaxyCatalog(buf);
    expect(Array.from(decoded.orientationIsFallback)).toEqual(
      Array.from(cat.orientationIsFallback),
    );
    expect(Array.from(decoded.diameterIsFallback)).toEqual(Array.from(cat.diameterIsFallback));
  });

  it('writes spectroscopicZ at record offset 56 and log10StellarMass at 60', () => {
    const cat = makeGalaxyCatalog(1);
    cat.spectroscopicZ[0] = 0.12345;
    cat.log10StellarMass[0] = 10.75;

    const buf = encodeGalaxyCatalog(cat);
    const dv = new DataView(buf);

    // Catches an encoder/decoder pair that agrees with itself at the wrong
    // offsets — the round-trip test alone wouldn't notice a swap.
    expect(dv.getFloat32(16 + 56, true)).toBeCloseTo(0.12345, 5);
    expect(dv.getFloat32(16 + 60, true)).toBeCloseTo(10.75, 5);
  });

  it('round-trips log10StellarMass including the NaN absent sentinel', () => {
    const cat = makeGalaxyCatalog(3);
    cat.log10StellarMass.set([10.75, -1.5, NaN]);

    const decoded = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));

    expect(decoded.log10StellarMass[0]).toBeCloseTo(10.75, 5);
    expect(decoded.log10StellarMass[1]).toBeCloseTo(-1.5, 5);
    expect(Number.isNaN(decoded.log10StellarMass[2])).toBe(true);
  });
});

describe('galaxyCatalogFormat — field spec table invariants', () => {
  it('lays out disjoint field byte ranges within the 64 B stride, with flag bits sharing one byte at distinct positions', () => {
    const fieldRanges: { start: number; end: number }[] = [];
    const flagBits: { offset: number; bit: number }[] = [];

    for (const spec of Object.values(GALAXY_CATALOG_FIELD_SPECS)) {
      if (spec.disk.kind === 'field') {
        const size = COLUMN_SIZE[spec.column] * spec.components;
        fieldRanges.push({ start: spec.disk.offset, end: spec.disk.offset + size });
      } else {
        flagBits.push({ offset: spec.disk.offset, bit: spec.disk.bit });
      }
    }

    for (const r of fieldRanges) {
      expect(r.start).toBeGreaterThanOrEqual(0);
      expect(r.end).toBeLessThanOrEqual(BYTES_PER_GALAXY);
    }
    for (let i = 0; i < fieldRanges.length; i++) {
      for (let j = i + 1; j < fieldRanges.length; j++) {
        const a = fieldRanges[i]!;
        const b = fieldRanges[j]!;
        const disjoint = a.end <= b.start || b.end <= a.start;
        expect(disjoint).toBe(true);
      }
    }

    expect(flagBits.length).toBeGreaterThan(0);
    expect(new Set(flagBits.map((f) => f.offset)).size).toBe(1);
    expect(new Set(flagBits.map((f) => f.bit)).size).toBe(flagBits.length);
  });
});

describe('galaxyCatalogFormat — orientation round-trip', () => {
  it('round-trips finite axisRatio and positionAngleDeg', () => {
    const cat = makeGalaxyCatalog(4);
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
    const cat = makeGalaxyCatalog(2);
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
    const cat = makeGalaxyCatalog(2);
    cat.diameterKpc.set([30, 12.5]);
    const decoded = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));
    expect(Array.from(decoded.diameterKpc)).toEqual([30, 12.5]);
  });

  it('round-trips the NaN sentinel in diameterKpc', () => {
    const cat = makeGalaxyCatalog(1);
    cat.diameterKpc[0] = NaN;
    const decoded = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));
    expect(Number.isNaN(decoded.diameterKpc[0])).toBe(true);
  });

  it('throws when diameterKpc length mismatches count', () => {
    const cat = makeGalaxyCatalog(2);
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

  it('rejects v8 with the version-specific regenerate error', () => {
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x504d4b53, true); // "SKMP"
    dv.setUint32(4, 8, true); // v8 — the previous on-disk shape
    dv.setUint32(8, 0, true);
    dv.setUint32(12, 0, true);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/unsupported version: 8/);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/regenerate/);
  });

  it('rejects a stale version with a typed FormatVersionError carrying found/expected', () => {
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x504d4b53, true); // "SKMP"
    dv.setUint32(4, 8, true); // v8 — the previous on-disk shape
    dv.setUint32(8, 0, true);
    dv.setUint32(12, 0, true);

    try {
      decodeGalaxyCatalog(buf);
      expect.unreachable('decodeGalaxyCatalog should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(FormatVersionError);
      const versionError = err as FormatVersionError;
      expect(versionError.found).toBe(8);
      expect(versionError.expected).toBe(9);
    }
  });

  it('rejects every earlier version (v1–v8) with the same regenerate message', () => {
    // The version check fires before the per-record loop, so a 16-byte
    // header with count=0 is enough to exercise every foreign version.
    for (const version of [1, 2, 3, 4, 5, 6, 7, 8]) {
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
    const buf = encodeGalaxyCatalog(makeGalaxyCatalog(1));
    new DataView(buf).setUint32(4, 99, true); // arbitrary foreign version
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/version/);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/regenerate/);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/build-tiers/);
  });
});
