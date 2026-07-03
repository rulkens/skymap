/**
 * computeDescriptor — descriptor extraction from an RGBA buffer. These tests
 * paint tiny synthetic galaxies (grayscale gaussian blobs, elongated blobs,
 * an m=2 azimuthal pattern, a saturated core) with pure helpers below and
 * assert the descriptor reads back the structural property that was painted
 * in: near-round q for a symmetric blob, low q for a 4:1 elongation, a
 * dominant m=2 arm harmonic for two opposing arcs, null on an empty frame,
 * and the 97th-percentile cap taming a blown-out core.
 */
import { describe, expect, it } from 'vitest';
import { computeDescriptor } from '../../../../tools/galaxy-renderer/src/matcher/computeDescriptor';
import { dominantArms } from '../../../../tools/galaxy-renderer/src/matcher/dominantArms';

const N = 116;

/** Allocate an all-black opaque RGBA frame. */
function blackFrame(size: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) buf[i * 4 + 3] = 255;
  return buf;
}

/** Set one pixel to a grayscale level (adds onto whatever is there). */
function addGray(buf: Uint8ClampedArray, size: number, x: number, y: number, v: number): void {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const j = (y * size + x) * 4;
  buf[j] = Math.min(255, buf[j]! + v);
  buf[j + 1] = Math.min(255, buf[j + 1]! + v);
  buf[j + 2] = Math.min(255, buf[j + 2]! + v);
}

/** Paint a (possibly anisotropic) grayscale gaussian blob centred on the frame. */
function gaussianBlob(
  size: number,
  amp: number,
  sigmaX: number,
  sigmaY: number,
): Uint8ClampedArray {
  const buf = blackFrame(size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / sigmaX;
      const dy = (y - cy) / sigmaY;
      const v = amp * Math.exp(-0.5 * (dx * dx + dy * dy));
      addGray(buf, size, x, y, v);
    }
  }
  return buf;
}

/**
 * Paint a radial gaussian disk modulated by (1 + strength·cos 2θ) — two
 * opposing bright arcs, i.e. a pure m=2 azimuthal pattern over a disk profile.
 */
function m2Pattern(size: number, amp: number, sigma: number, strength: number): Uint8ClampedArray {
  const buf = blackFrame(size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      const theta = Math.atan2(dy, dx);
      const base = amp * Math.exp(-0.5 * (r / sigma) * (r / sigma));
      const v = base * (1 + strength * Math.cos(2 * theta));
      addGray(buf, size, x, y, Math.max(0, v));
    }
  }
  return buf;
}

describe('computeDescriptor', () => {
  it('reads a centered round blob as near-round with a valid profile', () => {
    const d = computeDescriptor(gaussianBlob(N, 200, 15, 15), N);
    expect(d).not.toBeNull();
    const desc = d!;
    expect(desc.q).toBeGreaterThan(0.85);
    expect(desc.rHalf).toBeGreaterThan(0);
    let sum = 0;
    for (let i = 0; i < desc.fluxFrac.length; i++) sum += desc.fluxFrac[i]!;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('reads a 4:1 elongated blob as inclined (low q)', () => {
    const d = computeDescriptor(gaussianBlob(N, 200, 20, 5), N);
    expect(d).not.toBeNull();
    expect(d!.q).toBeLessThan(0.5);
  });

  it('reports dominant harmonic 2 for an m=2 azimuthal pattern', () => {
    const d = computeDescriptor(m2Pattern(N, 150, 18, 0.6), N);
    expect(d).not.toBeNull();
    expect(dominantArms(d!)).toBe(2);
  });

  it('returns null for an all-black frame', () => {
    expect(computeDescriptor(blackFrame(N), N)).toBeNull();
  });

  it('caps a saturated core so the inner flux bin stays near the clean blob', () => {
    const amp = 120;
    const clean = computeDescriptor(gaussianBlob(N, amp, 15, 15), N)!;

    // Same blob, but blow out a 3×3 core to full white.
    const sat = gaussianBlob(N, amp, 15, 15);
    const c = (N - 1) / 2;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const j = ((Math.round(c) + dy) * N + (Math.round(c) + dx)) * 4;
        sat[j] = sat[j + 1] = sat[j + 2] = 255;
      }
    }
    const capped = computeDescriptor(sat, N)!;

    // With the 97th-percentile cap active the saturated core is clipped down
    // to the blob's own bright shell, so the inner bin barely moves.
    expect(Math.abs(capped.fluxFrac[0]! - clean.fluxFrac[0]!)).toBeLessThan(0.02);
  });
});
