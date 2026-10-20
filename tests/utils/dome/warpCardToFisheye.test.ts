import { describe, expect, it } from 'vitest';
import { warpCardToFisheye } from '../../../src/utils/dome/warpCardToFisheye';
import { directionToFisheye } from '../../../src/utils/dome/directionToFisheye';
import { fisheyeDirection } from '../../../src/utils/dome/fisheyeDirection';

const TAU = (60 * Math.PI) / 180;
const D: [number, number, number] = [0, Math.cos(TAU), Math.sin(TAU)];
const SIZE = 400;
const HALF = 0.08;
const W = 64;

/** Opaque card: red left strip, blue right strip, green top band, white elsewhere; black centre. */
function makeCard() {
  const data = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let c = [255, 255, 255];
      if (x < 8) c = [255, 0, 0];
      else if (x >= W - 8) c = [0, 0, 255];
      else if (y < 8) c = [0, 255, 0];
      if (Math.abs(x - W / 2) < 2 && Math.abs(y - W / 2) < 2) c = [0, 0, 0];
      data.set([...c, 255], (y * W + x) * 4);
    }
  }
  return { width: W, height: W, data };
}

const out = warpCardToFisheye(makeCard(), SIZE, D, HALF);
const px = (x: number, y: number) =>
  Array.from(out.subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4));

describe('warpCardToFisheye', () => {
  it('puts the card centre at the fisheye position of d', () => {
    const [nx, ny] = directionToFisheye(D);
    expect(ny).toBeCloseTo(-60 / 90, 6);
    expect(nx).toBeCloseTo(0, 6);
    expect(px(Math.floor(((nx + 1) / 2) * SIZE), Math.floor(((1 - ny) / 2) * SIZE))).toEqual([
      0, 0, 0, 255,
    ]);
  });

  it('is wider tangentially than tall radially by about theta / sin(theta)', () => {
    let minX = SIZE;
    let maxX = 0;
    let minY = SIZE;
    let maxY = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (px(x, y)[3] !== 255) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    const theta = TAU; // the card centre sits tilt degrees from the zenith
    expect((maxX - minX) / (maxY - minY)).toBeCloseTo(theta / Math.sin(theta), 1);
  });

  it('faces the card top toward the zenith and does not mirror left/right', () => {
    const [, ny] = directionToFisheye(D);
    const cy = Math.floor(((1 - ny) / 2) * SIZE);
    const cx = SIZE / 2;
    let top = -1;
    let left = -1;
    let right = -1;
    for (let y = 0; y < SIZE && top < 0; y++) {
      const p = px(cx, y);
      if (p[1] === 255 && p[0] === 0) top = y;
    }
    for (let x = 0; x < SIZE; x++) {
      const p = px(x, cy);
      if (p[0] === 255 && p[1] === 0 && left < 0) left = x;
      if (p[2] === 255 && p[0] === 0) right = x;
    }
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(cy); // smaller image y is nearer the disc centre
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left).toBeLessThan(right);
  });

  it('leaves everything outside the card transparent', () => {
    expect(px(10, 10)[3]).toBe(0);
    expect(px(SIZE / 2, SIZE - 10)[3]).toBe(0);
  });

  it('directionToFisheye inverts fisheyeDirection', () => {
    const [x, y] = directionToFisheye(fisheyeDirection(0.3, -0.4)!);
    expect(x).toBeCloseTo(0.3, 9);
    expect(y).toBeCloseTo(-0.4, 9);
  });
});
