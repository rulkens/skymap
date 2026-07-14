import { describe, it, expect } from 'vitest';
import { mortonEncode3 } from '../../../src/utils/math/mortonEncode3';

describe('mortonEncode3', () => {
  // These pin the axis→bit assignment the octree walker depends on: x on the
  // lowest interleave bit, then y, then z. A swapped axis round-trips cleanly
  // through decode but fails here, so these adversarial single-bit cases are
  // what actually locks the contract. The codes are hand-computed, not read
  // back from the implementation.
  it('places x on the lowest interleave bit', () => {
    expect(mortonEncode3(1, 0, 0)).toBe(1);
  });

  it('places y on the second interleave bit', () => {
    expect(mortonEncode3(0, 1, 0)).toBe(2);
  });

  it('places z on the third interleave bit', () => {
    expect(mortonEncode3(0, 0, 1)).toBe(4);
  });

  it('interleaves all three low bits into 0b111', () => {
    expect(mortonEncode3(1, 1, 1)).toBe(7);
  });

  it('interleaves the second-lowest bit of each axis (bits 3,4,5)', () => {
    // x=2 → bit 3 (8), y=2 → bit 4 (16), z=2 → bit 5 (32); together 56.
    expect(mortonEncode3(2, 2, 2)).toBe(56);
  });

  it('fills all 30 bits at the maximum coordinate and stays a positive uint32', () => {
    const code = mortonEncode3(1023, 1023, 1023);
    expect(code).toBe(0x3fffffff);
    expect(code).toBeGreaterThan(0);
  });
});
