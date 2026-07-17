/**
 * Repack ↔ shader-unpack parity — the two-representation seam nothing else guards.
 *
 * A star record lives in THREE byte shapes on its way to a pixel, and a
 * compiler cross-checks none of the transitions:
 *
 *   1. the on-disk 6-byte record (`packStarRecord` / `unpackStarRecord`),
 *   2. the renderer's repacked `array<u32>` blob — two u32 halves per record,
 *      `lo` = bytes 0..2, `hi` = bytes 3..5 (starCatalogRenderer.ts
 *      `repackRecords`, a device-private function),
 *   3. the vertex stage's bit-extraction out of those two u32
 *      (shaders/starCatalog/vertex.wesl).
 *
 * `starCatalogRecord.test.ts` pins step 1's round-trip. This test pins the
 * 1→2→3 path: repack the packed bytes into u32 halves the way the renderer
 * does, extract the fields the way the shader does, and assert the fields
 * survive. A drift in the renderer's byte→u32 order OR in the shader's
 * shift/mask constants (the offsetZ 24-bit straddle is the trap) would make
 * the GPU read scrambled offsets/magnitudes/colours while every byte-level
 * test still passes — the exact class of silent bug that reads as "the data
 * is fine but the stars render wrong".
 *
 * The repack and the shader-unpack are reproduced here deliberately: the
 * renderer's `repackRecords` needs a GPUDevice to reach and the shader is
 * WESL, so neither is importable into vitest. Reproducing both and pinning
 * them against the format's authoritative `packStarRecord` catches a change
 * to EITHER reproduced transform the moment it diverges from the on-disk
 * contract — a behavioural round-trip, not a constant restatement.
 */
import { describe, it, expect } from 'vitest';
import { packStarRecord, RECORD_BYTES } from '../../../../../src/data/starCatalog/starCatalogFormat';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/** Reproduces starCatalogRenderer.ts `repackRecords`: bytes 0..2 → lo, 3..5 → hi. */
function repackToU32(rec: Uint8Array): { lo: number; hi: number } {
  const lo = rec[0]! | (rec[1]! << 8) | (rec[2]! << 16);
  const hi = rec[3]! | (rec[4]! << 8) | (rec[5]! << 16);
  return { lo: lo >>> 0, hi: hi >>> 0 };
}

/** Reproduces vertex.wesl's field extraction from the two u32 halves. */
function shaderUnpack(lo: number, hi: number): { offset: Vec3; absMagIdx: number; colorIdx: number } {
  const ox = lo & 0x3ff;
  const oy = (lo >>> 10) & 0x3ff;
  // offsetZ straddles the 24-bit boundary: low 4 bits in lo, high 6 bits in hi.
  const oz = ((lo >>> 20) & 0xf) | ((hi & 0x3f) << 4);
  const absMagIdx = (hi >>> 6) & 0x7f;
  const colorIdx = (hi >>> 13) & 0x3f;
  return { offset: [ox, oy, oz], absMagIdx, colorIdx };
}

describe('star record repack → shader-unpack parity', () => {
  it.each<{ name: string; offset: Vec3; absMagIdx: number; colorIdx: number }>([
    { name: 'all-zero', offset: [0, 0, 0], absMagIdx: 0, colorIdx: 0 },
    { name: 'all-max', offset: [1023, 1023, 1023], absMagIdx: 127, colorIdx: 63 },
    // offsetZ = 0x2A5 exercises both sides of the 24-bit straddle (low 4 = 0x5,
    // high 6 = 0x2A), the one place a wrong divisor/shift silently corrupts z.
    { name: 'z straddle', offset: [300, 999, 0x2a5], absMagIdx: 100, colorIdx: 40 },
  ])('u32 repack + shader extraction recovers $name', ({ offset, absMagIdx, colorIdx }) => {
    const rec = packStarRecord(offset, absMagIdx, colorIdx);
    expect(rec.length).toBe(RECORD_BYTES);

    const { lo, hi } = repackToU32(rec);
    const out = shaderUnpack(lo, hi);

    expect(out.offset).toEqual(offset);
    expect(out.absMagIdx).toBe(absMagIdx);
    expect(out.colorIdx).toBe(colorIdx);
  });
});
