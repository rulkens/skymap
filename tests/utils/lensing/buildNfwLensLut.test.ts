import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildNfwLensLut, MU_MAX } from '../../../src/utils/lensing/buildNfwLensLut';

describe('buildNfwLensLut', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('packs width*height*4 f32 values', () => {
    const lut = buildNfwLensLut(8, 4, 2.0, 3.0);
    expect(lut.data).toBeInstanceOf(Float32Array);
    expect(lut.data.length).toBe(8 * 4 * 4);
    expect(lut.width).toBe(8);
    expect(lut.height).toBe(4);
    expect(lut.yMax).toBe(2.0);
    expect(lut.sMax).toBe(3.0);
  });

  it('s→0 leaves the primary at x≈y with μ≈1', () => {
    // At row 0 (j=0) the log-map gives s=0, so lensYOf(x, 0) = x and the
    // unique root is x = y with magnification exactly 1.
    const width = 16;
    const height = 8;
    const yMax = 3.0;
    const lut = buildNfwLensLut(width, height, yMax, 3.0);

    // Pick a mid-range column (colY=8) to avoid y=0 and y=yMax edge cases.
    const colY = 8;
    const y = (colY / (width - 1)) * yMax; // ≈ 1.6
    const idx = (0 * width + colY) * 4; // row 0, col 8

    // x should match y to within one column width (the scan step).
    const yTol = yMax / width;
    expect(lut.data[idx + 0]!).toBeCloseTo(y, 1);
    expect(Math.abs(lut.data[idx + 0]! - y)).toBeLessThan(yTol);

    // Magnification should be ≈ 1 (no deflection at s = 0).
    expect(lut.data[idx + 1]!).toBeCloseTo(1.0, 1);

    // No counter-image: opposite-side sentinel values are both zero.
    expect(lut.data[idx + 2]!).toBe(0);
    expect(lut.data[idx + 3]!).toBe(0);
  });

  it('s→0 produces no counter image', () => {
    // At row 0 all cells should have xCounter === 0 and muCounter === 0:
    // with s=0 the lens equation is just y = x, which has only the trivial
    // root x = y > 0 — nothing deflects to the opposite side.
    const width = 12;
    const lut = buildNfwLensLut(width, 8, 2.0, 3.0);

    for (let colY = 0; colY < width; colY++) {
      const idx = (0 * width + colY) * 4; // row 0
      expect(lut.data[idx + 2]!).toBe(0); // xCounter sentinel
      expect(lut.data[idx + 3]!).toBe(0); // muCounter sentinel
    }
  });

  it('super-critical s yields two opposite-side images for small y', () => {
    // For large s (last row, s ≈ sMax) and a small but non-zero source
    // position, the NFW lens equation has roots on BOTH sides of the lens
    // centre. The primary is the outer positive-x image; the counter-image
    // is a negative-x image on the opposite side of the lens.
    //
    // y = colY/7 * 2.0 for the grid below.
    const width = 8;
    const height = 8;
    const yMax = 2.0;
    const sMax = 4.0;
    const lut = buildNfwLensLut(width, height, yMax, sMax);

    // Last row (rowS = height−1) gives s = sMax = 4 (super-critical).
    // colY = 1 → y ≈ 0.286, which is well inside the counter-image regime.
    const rowS = height - 1;
    const colY = 1;
    const idx = (rowS * width + colY) * 4;

    expect(lut.data[idx + 0]!).toBeGreaterThan(0); // xPrimary > 0 (same side as y)
    expect(lut.data[idx + 2]!).toBeLessThan(0); // xCounter < 0 (opposite side)
    expect(lut.data[idx + 3]!).not.toBe(0); // muCounter ≠ 0 (counter-image exists)
  });

  it('magnifications are clamped to MU_MAX', () => {
    // The magnification formula 1/|(y/x)·dy/dx| diverges on the caustic
    // (dy/dx → 0) and at y = 0 (Einstein ring). MU_MAX = 10 caps all values.
    const lut = buildNfwLensLut(32, 16, 3.0, 4.0);

    for (let i = 0; i < lut.data.length; i += 4) {
      const muPrimary = lut.data[i + 1]!;
      const muCounter = lut.data[i + 3]!;
      expect(Math.abs(muPrimary)).toBeLessThanOrEqual(MU_MAX + 1e-9);
      // muCounter is 0 when absent; when present it must also be ≤ MU_MAX.
      expect(Math.abs(muCounter)).toBeLessThanOrEqual(MU_MAX + 1e-9);
    }
  });

  it('dropped third image is counted, not silent', () => {
    // For small y and large s the NFW lens produces more than two roots (the
    // positive-x and negative-x halves of lensYOf each contribute two roots,
    // giving up to four images). The two-channel LUT keeps only primary +
    // counter; the excess is dropped. buildNfwLensLut must warn exactly once
    // per build so the truncation is auditable, not silent.
    //
    // Parameters chosen so every non-zero y column uses a small y (≤ 0.05)
    // while the top rows reach s ≈ 4 — a regime confirmed to produce
    // roots.length > 2 (2 positive-x + 2 negative-x) in the scan.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    buildNfwLensLut(4, 8, 0.05, 4.0);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]![0] as string).toMatch(/excess images dropped/);
  });
});
