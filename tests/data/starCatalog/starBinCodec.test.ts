/**
 * Contract tests for the sealed star-bin compression codec.
 *
 * Two properties, both over a *deterministic* payload (an LCG-driven
 * pseudo-random slice that resists compression, followed by a long constant
 * run that compresses well) so the round trip exercises a real inflate rather
 * than a trivially compressible or all-zero no-op:
 *
 *   1. `decompress(compress(x)) === x` byte-for-byte — the codec is lossless.
 *   2. The packed form is a distinct, and for compressible input strictly
 *      shorter, sequence than the plaintext — an independent witness that the
 *      codec is actually engaged rather than passing bytes through untouched.
 */
import { describe, it, expect } from 'vitest';
import {
  compressStarBin,
  decompressStarBin,
} from '../../../src/data/starCatalog/starBinCodec';

/**
 * A payload with two regimes: 4 KiB of LCG pseudo-random bytes (high entropy,
 * near-incompressible) then 4 KiB of a single repeated byte (a run gzip must
 * collapse). The LCG is the classic Numerical Recipes constants, seeded fixed,
 * so the buffer is identical on every run.
 */
function makePayload(): Uint8Array {
  const noiseLen = 4096;
  const runLen = 4096;
  const out = new Uint8Array(noiseLen + runLen);

  let state = 0x1234_5678 >>> 0;
  for (let i = 0; i < noiseLen; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = (state >>> 24) & 0xff;
  }
  out.fill(0xab, noiseLen);
  return out;
}

describe('starBinCodec', () => {
  it('round-trips a mixed high-entropy + compressible payload byte-for-byte', async () => {
    const plain = makePayload();
    const restored = await decompressStarBin(await compressStarBin(plain));
    expect(restored).toEqual(plain);
  });

  it('produces a packed form that differs from — and is shorter than — the plaintext', async () => {
    const plain = makePayload();
    const packed = await compressStarBin(plain);

    // The half-constant payload is comfortably compressible, so a real codec
    // must shrink it. Equal length would mean the bytes passed through untouched.
    expect(packed.length).toBeLessThan(plain.length);
    expect(packed).not.toEqual(plain);
  });
});
