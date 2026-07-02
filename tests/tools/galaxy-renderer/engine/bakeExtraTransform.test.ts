/**
 * bakeExtraTransform — the rigid (scale, spin, tilt, translate) transform
 * baked into an interleaved stride-8 buffer, extracted from
 * `galaxy-engine.js:186-195`'s `bakeTransform`. Verifies the exact order
 * the spike applies: scale xyz, then rotate about Y (disk spin), then
 * rotate about X (inclination tilt), then translate — and that only the
 * position and size slots are touched.
 */
import { describe, expect, it } from 'vitest';
import { bakeExtraTransform } from '../../../../tools/galaxy-renderer/src/engine/bakeExtraTransform';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const ORIGIN: Vec3 = [0, 0, 0];

// Star field order (from starWriter): x,y,z,r,g,b,size,brightness — sizeIndex 6.
function starRecord(x: number, y: number, z: number): Float32Array {
  return new Float32Array([x, y, z, 10, 20, 30, 4, 5]);
}

// Dust field order (from dustWriter): x,y,z,size,r,g,b,opacity — sizeIndex 3.
function dustRecord(x: number, y: number, z: number): Float32Array {
  return new Float32Array([x, y, z, 4, 10, 20, 30, 50]);
}

describe('bakeExtraTransform', () => {
  it('identity transform leaves positions and sizes unchanged', () => {
    const data = starRecord(1, 2, 3);
    bakeExtraTransform(data, 6, ORIGIN, 1, 0, 0);
    expect(Array.from(data)).toEqual([1, 2, 3, 10, 20, 30, 4, 5]);
  });

  it('pure Y-rotation preserves distances from the Y axis and leaves y alone', () => {
    const data = starRecord(3, 7, -4);
    const before = Array.from(data);
    bakeExtraTransform(data, 6, ORIGIN, 1, 0.9, 0);
    // y (index 1) is untouched by a Y-axis rotation.
    expect(data[1]).toBeCloseTo(before[1]!, 12);
    // Distance from the Y axis (hypot of x,z) is rotation-invariant.
    const distBefore = Math.hypot(before[0]!, before[2]!);
    const distAfter = Math.hypot(data[0]!, data[2]!);
    // `data` is a Float32Array, so `before`/`after` only agree to ~7
    // significant digits — a float64-precision tolerance would be flaky.
    expect(distAfter).toBeCloseTo(distBefore, 5);
  });

  it("tilt then rotation matches the spike's order", () => {
    // Hand-computed from galaxy-engine.js:187-195 for [1,0,0], scale=1,
    // rotY=pi/2, tiltX=pi/2, pos=[0,0,0]:
    //   cy=cos(pi/2)=0, sy=sin(pi/2)=1, cx=cos(pi/2)=0, sx=sin(pi/2)=1
    //   x=1, y=0, z=0
    //   x1 = x*cy - z*sy = 1*0 - 0*1 = 0
    //   z1 = x*sy + z*cy = 1*1 + 0*0 = 1
    //   y2 = y*cx - z1*sx = 0*0 - 1*1 = -1
    //   z2 = y*sx + z1*cx = 0*1 + 1*0 = 0
    // Expected final position: [0, -1, 0].
    const data = starRecord(1, 0, 0);
    bakeExtraTransform(data, 6, ORIGIN, 1, Math.PI / 2, Math.PI / 2);
    expect(data[0]).toBeCloseTo(0, 12);
    expect(data[1]).toBeCloseTo(-1, 12);
    expect(data[2]).toBeCloseTo(0, 12);
  });

  it('size slot is multiplied by scale for the given sizeIndex (6 and 3)', () => {
    const star = starRecord(1, 2, 3);
    bakeExtraTransform(star, 6, ORIGIN, 2.5, 0, 0);
    expect(star[6]).toBeCloseTo(4 * 2.5, 12);

    const dust = dustRecord(1, 2, 3);
    bakeExtraTransform(dust, 3, ORIGIN, 2.5, 0, 0);
    expect(dust[3]).toBeCloseTo(4 * 2.5, 12);
  });

  it('colour/brightness slots are untouched', () => {
    const star = starRecord(1, 2, 3);
    bakeExtraTransform(star, 6, [5, -5, 5], 3, 1.2, 0.4);
    expect(star[3]).toBe(10);
    expect(star[4]).toBe(20);
    expect(star[5]).toBe(30);
    expect(star[7]).toBe(5);

    const dust = dustRecord(1, 2, 3);
    bakeExtraTransform(dust, 3, [5, -5, 5], 3, 1.2, 0.4);
    expect(dust[4]).toBe(10);
    expect(dust[5]).toBe(20);
    expect(dust[6]).toBe(30);
    expect(dust[7]).toBe(50);
  });

  it('translation adds pos after rotation', () => {
    const pos: Vec3 = [10, -4, 2];
    const rotated = starRecord(1, 0, 0);
    bakeExtraTransform(rotated, 6, ORIGIN, 1, Math.PI / 2, Math.PI / 2);
    const translated = starRecord(1, 0, 0);
    bakeExtraTransform(translated, 6, pos, 1, Math.PI / 2, Math.PI / 2);
    expect(translated[0]).toBeCloseTo(rotated[0]! + pos[0], 10);
    expect(translated[1]).toBeCloseTo(rotated[1]! + pos[1], 10);
    expect(translated[2]).toBeCloseTo(rotated[2]! + pos[2], 10);
  });
});
