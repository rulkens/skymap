/**
 * cropMath — pure helpers for the 1:1-locked crop rectangle.
 *
 * Bounds invariant: the crop's CENTER stays inside the source image, but
 * its corners may extend outside.  The server-side rotate-then-extract
 * fills those out-of-image regions with transparent pixels.
 *
 * Square invariant: every resize op snaps width === height.
 *
 * Rotation: helpers operate in the rect's LOCAL frame.  The CropCanvas
 * pre-rotates screen-space drag deltas by -rotationDeg via rotateDelta
 * before calling the resize/translate helpers, so they remain rotation-
 * agnostic.  rotationDeg passes through unchanged on resize/translate;
 * setRotation is the only helper that mutates it.
 */
import { describe, expect, it } from 'vitest';
import {
  resetCrop,
  translateCrop,
  resizeCornerNE,
  resizeCornerNW,
  resizeCornerSE,
  resizeCornerSW,
  resizeEdgeN,
  resizeEdgeE,
  resizeEdgeS,
  resizeEdgeW,
  rotateDelta,
  setRotation,
  type Crop,
  type Bounds,
} from '../../../../tools/famous-curator/ui/cropMath';

const bounds: Bounds = { width: 1000, height: 800 };

describe('resetCrop', () => {
  it('returns the biggest centred square that fits inside the bounds, with rotationDeg=0', () => {
    const c = resetCrop(bounds);
    expect(c.width).toBe(800);
    expect(c.height).toBe(800);
    expect(c.x).toBe((1000 - 800) / 2);
    expect(c.y).toBe(0);
    expect(c.rotationDeg).toBe(0);
  });
});

describe('translateCrop (center-clamp)', () => {
  const start: Crop = { x: 100, y: 100, width: 400, height: 400, rotationDeg: 0 };

  it('moves freely when the new center is inside bounds', () => {
    expect(translateCrop(start, 50, 30, bounds)).toEqual({
      x: 150, y: 130, width: 400, height: 400, rotationDeg: 0,
    });
  });

  it('allows the rect to extend off the left edge as long as the center stays in', () => {
    // dx=-200 → new center x = 100, still inside bounds.  Corners hang off.
    expect(translateCrop(start, -200, 0, bounds)).toEqual({
      x: -100, y: 100, width: 400, height: 400, rotationDeg: 0,
    });
  });

  it('clamps the center to the right edge', () => {
    // dx=2000 would put center at 2300; clamps to width=1000.
    // → center x = 1000 → x = 1000 - 200 = 800.
    expect(translateCrop(start, 2000, 0, bounds)).toEqual({
      x: 800, y: 100, width: 400, height: 400, rotationDeg: 0,
    });
  });

  it('clamps the center to the bottom edge', () => {
    expect(translateCrop(start, 0, 2000, bounds)).toEqual({
      x: 100, y: 600, width: 400, height: 400, rotationDeg: 0,
    });
  });

  it('preserves rotationDeg', () => {
    const rotated: Crop = { ...start, rotationDeg: 45 };
    expect(translateCrop(rotated, 10, 0, bounds).rotationDeg).toBe(45);
  });
});

describe('corner resize (anchor at opposite corner, square enforced)', () => {
  const c: Crop = { x: 200, y: 200, width: 400, height: 400, rotationDeg: 0 };

  it('SE corner: enlarging keeps NW anchor, stays square, preserves rotation', () => {
    const out = resizeCornerSE({ ...c, rotationDeg: 30 }, 100, 60, bounds);
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    expect(out.x).toBe(200);
    expect(out.y).toBe(200);
    expect(out.rotationDeg).toBe(30);
  });

  it('NW corner: enlarging keeps SE anchor', () => {
    const out = resizeCornerNW(c, -100, -100, bounds);
    expect(out.width).toBe(500);
    expect(out.x).toBe(100);
    expect(out.y).toBe(100);
  });

  it('NE corner: keeps SW anchor', () => {
    const out = resizeCornerNE(c, 100, -100, bounds);
    expect(out.width).toBe(500);
    expect(out.x).toBe(200);
    expect(out.y).toBe(100);
  });

  it('SW corner: keeps NE anchor', () => {
    const out = resizeCornerSW(c, -100, 100, bounds);
    expect(out.width).toBe(500);
    expect(out.x).toBe(100);
    expect(out.y).toBe(200);
  });

  it('no longer clamps to the image — the rect can grow past the edge', () => {
    // 5000-pixel drag from a 400-wide rect → ~5400 wide.  Center-clamp
    // keeps the center inside bounds; the rect itself hangs off.
    const out = resizeCornerSE(c, 5000, 5000, bounds);
    expect(out.width).toBe(5400);
    expect(out.height).toBe(5400);
  });
});

describe('edge resize (square via opposite-edge sync)', () => {
  const c: Crop = { x: 200, y: 200, width: 400, height: 400, rotationDeg: 0 };

  it('E edge: dx widens, perpendicular axis grows symmetrically', () => {
    const out = resizeEdgeE(c, 100, bounds);
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    expect(out.x).toBe(200);
    expect(out.y).toBe(150);
  });

  it('W edge: negative dx widens', () => {
    const out = resizeEdgeW(c, -100, bounds);
    expect(out.width).toBe(500);
    expect(out.x).toBe(100);
    expect(out.y).toBe(150);
  });

  it('N edge: negative dy widens upward', () => {
    const out = resizeEdgeN(c, -100, bounds);
    expect(out.height).toBe(500);
    expect(out.y).toBe(100);
    expect(out.x).toBe(150);
  });

  it('S edge: positive dy widens downward', () => {
    const out = resizeEdgeS(c, 100, bounds);
    expect(out.height).toBe(500);
    expect(out.y).toBe(200);
    expect(out.x).toBe(150);
  });

  it('preserves rotation through edge resize', () => {
    const out = resizeEdgeE({ ...c, rotationDeg: 45 }, 50, bounds);
    expect(out.rotationDeg).toBe(45);
  });
});

describe('rotateDelta', () => {
  it('identity at 0 deg', () => {
    expect(rotateDelta(10, 5, 0)).toEqual({ dx: 10, dy: 5 });
  });

  it('rotates (1, 0) by 90 deg to (0, 1) in y-down screen frame', () => {
    const r = rotateDelta(1, 0, 90);
    expect(r.dx).toBeCloseTo(0);
    expect(r.dy).toBeCloseTo(1);
  });

  it('rotates (1, 0) by -90 deg to (0, -1)', () => {
    const r = rotateDelta(1, 0, -90);
    expect(r.dx).toBeCloseTo(0);
    expect(r.dy).toBeCloseTo(-1);
  });

  it('inverse-cancels itself', () => {
    const r = rotateDelta(1, 0, 47);
    const back = rotateDelta(r.dx, r.dy, -47);
    expect(back.dx).toBeCloseTo(1);
    expect(back.dy).toBeCloseTo(0);
  });
});

describe('setRotation', () => {
  const c: Crop = { x: 100, y: 100, width: 200, height: 200, rotationDeg: 0 };

  it('sets a positive in-range angle as-is', () => {
    expect(setRotation(c, 45).rotationDeg).toBe(45);
  });

  it('wraps overshoot back into (-180, 180]', () => {
    expect(setRotation(c, 270).rotationDeg).toBe(-90);
    expect(setRotation(c, -270).rotationDeg).toBe(90);
    expect(setRotation(c, 720).rotationDeg).toBe(0);
  });

  it('preserves x, y, width, height', () => {
    const out = setRotation(c, 33);
    expect(out.x).toBe(100);
    expect(out.y).toBe(100);
    expect(out.width).toBe(200);
    expect(out.height).toBe(200);
  });
});
