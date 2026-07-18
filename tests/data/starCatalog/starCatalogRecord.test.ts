/**
 * Record-level contract tests for the star catalog on-disk format.
 *
 * These pin the two things a format's byte primitives must guarantee and
 * nothing a compiler already checks: the 6-byte bit layout round-trips
 * losslessly (so an encoder and decoder built from this module agree
 * byte-for-byte), the 5 reserved bits stay zero (a forward-compat
 * contract with future readers), and the magnitude/colour quantizers
 * saturate at the frozen LUT windows — endpoints that are a contract
 * with the shipped bytes, so a drifted window would corrupt every
 * catalog silently.
 */
import { describe, it, expect } from 'vitest';
import {
  absMagToLutIndex,
  lutIndexToAbsMag,
  bpRpToColorIdx,
  STAR_ABSMAG_STEP,
  STAR_COLORIDX_LEVELS,
  packStarRecord,
  unpackStarRecord,
} from '../../../src/data/starCatalog/starCatalogFormat';
import type { Vec3 } from '../../../src/@types/math/Vec3';

describe('star record pack/unpack', () => {
  it.each<{ name: string; offset: Vec3; absMagIdx: number; colorIdx: number }>([
    { name: 'all-zero', offset: [0, 0, 0], absMagIdx: 0, colorIdx: 0 },
    { name: 'all-max', offset: [1023, 1023, 1023], absMagIdx: 127, colorIdx: 63 },
    { name: 'asymmetric mix', offset: [300, 999, 17], absMagIdx: 100, colorIdx: 40 },
  ])('round-trips $name', ({ offset, absMagIdx, colorIdx }) => {
    const out = unpackStarRecord(packStarRecord(offset, absMagIdx, colorIdx), 0);
    expect(out.offset).toEqual(offset);
    expect(out.absMagIdx).toBe(absMagIdx);
    expect(out.colorIdx).toBe(colorIdx);
  });

  it('packs to 6 bytes with the 5 spare bits zeroed', () => {
    // Saturate every real field so any bit that leaks into the spare
    // region (byte 5, bits 3..7) would show up. The top 5 bits must
    // stay zero regardless of the payload.
    const rec = packStarRecord([1023, 1023, 1023], 127, 63);
    expect(rec.length).toBe(6);
    expect(rec[5]! & 0xf8).toBe(0);
  });
});

describe('LUT quantizers', () => {
  it('clamps out-of-range absolute magnitudes to the endpoints', () => {
    // Below STAR_ABSMAG_MIN (-6.0) saturates to index 0; above the
    // 24.32-mag span (ceiling +18.32) saturates to the top index 127.
    expect(absMagToLutIndex(-10)).toBe(0);
    expect(absMagToLutIndex(20)).toBe(127);
  });

  it('clamps out-of-range BP-RP colours to the endpoints', () => {
    // Below STAR_COLORIDX_MIN (-0.6) -> 0; above STAR_COLORIDX_MAX (4.4)
    // -> the top index 63.
    expect(bpRpToColorIdx(-1.0)).toBe(0);
    expect(bpRpToColorIdx(5.0)).toBe(STAR_COLORIDX_LEVELS - 1);
  });

  it('dequantizes magnitude indices to bin centres', () => {
    // A magnitude of 6.3 lands in index 64, whose centre is
    // -6.0 + 64.5 * 0.19 = 6.255 mag — within half a step of the input.
    const chosen = 6.3;
    const centre = lutIndexToAbsMag(absMagToLutIndex(chosen));
    expect(Math.abs(centre - chosen)).toBeLessThanOrEqual(STAR_ABSMAG_STEP / 2);
  });
});
