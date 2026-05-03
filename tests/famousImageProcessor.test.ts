import { describe, it, expect } from 'vitest';
import {
  sampleCornerColor,
  applyTransparency,
  type RGBA,
} from '../tools/famousImageProcessor';

/**
 * Build a 4x4 RGBA buffer where the corners are dark (sky) and the
 * centre is a bright greenish "galaxy" blob.  Layout (RGBA bytes):
 *   row 0: BG BG BG BG
 *   row 1: BG GAL GAL BG
 *   row 2: BG GAL GAL BG
 *   row 3: BG BG BG BG
 *
 * Each pixel is 4 bytes (R, G, B, A).  We initialise alpha=255
 * everywhere — the processor's job is to set sky pixels to alpha=0.
 */
function makeFixture(): { buf: Uint8ClampedArray; width: number; height: number } {
  const width = 4;
  const height = 4;
  const buf = new Uint8ClampedArray(width * height * 4);
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * width + x) * 4;
    buf[i + 0] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  };
  // Sky: dark navy (10, 10, 20)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      set(x, y, 10, 10, 20);
    }
  }
  // Galaxy blob in the central 2x2: bright green (40, 200, 60)
  for (const [x, y] of [
    [1, 1],
    [2, 1],
    [1, 2],
    [2, 2],
  ] as const) {
    set(x, y, 40, 200, 60);
  }
  return { buf, width, height };
}

describe('sampleCornerColor', () => {
  it('returns the average of the four corner pixels', () => {
    const { buf, width, height } = makeFixture();
    const c = sampleCornerColor(buf, width, height);
    expect(c.r).toBeCloseTo(10, 0);
    expect(c.g).toBeCloseTo(10, 0);
    expect(c.b).toBeCloseTo(20, 0);
    expect(c.a).toBe(255);
  });
});

describe('applyTransparency', () => {
  it('sets corner pixels to alpha 0 (matches sky color exactly)', () => {
    const { buf, width, height } = makeFixture();
    const sky: RGBA = { r: 10, g: 10, b: 20, a: 255 };
    applyTransparency(buf, width, height, sky, { skyTolerance: 5, fadeOuterFraction: 0 });
    // Top-left corner alpha = 0
    expect(buf[3]).toBe(0);
    // Top-right corner alpha = 0
    expect(buf[(0 * width + 3) * 4 + 3]).toBe(0);
    // Galaxy centre alpha unchanged
    expect(buf[(1 * width + 1) * 4 + 3]).toBe(255);
  });

  it('preserves galaxy pixels (color far from sky)', () => {
    const { buf, width, height } = makeFixture();
    const sky: RGBA = { r: 10, g: 10, b: 20, a: 255 };
    applyTransparency(buf, width, height, sky, { skyTolerance: 5, fadeOuterFraction: 0 });
    // All four galaxy pixels keep alpha=255.
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ] as const) {
      expect(buf[(y * width + x) * 4 + 3]).toBe(255);
    }
  });

  it('applies a radial fade in the outer ring when fadeOuterFraction > 0', () => {
    // 8x8 fixture, all pixels white, fade fraction = 0.5 (outer 50%).
    const width = 8;
    const height = 8;
    const buf = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < buf.length; i += 4) {
      buf[i + 0] = 200;
      buf[i + 1] = 200;
      buf[i + 2] = 200;
      buf[i + 3] = 255;
    }
    applyTransparency(buf, width, height, { r: 0, g: 0, b: 0, a: 255 }, {
      skyTolerance: 0,
      fadeOuterFraction: 0.5,
    });
    // Centre pixel alpha unchanged
    const centreIdx = (3 * width + 3) * 4 + 3;
    expect(buf[centreIdx]).toBeGreaterThan(200);
    // Edge pixel alpha reduced
    const edgeIdx = (0 * width + 0) * 4 + 3;
    expect(buf[edgeIdx]).toBeLessThan(200);
  });
});
