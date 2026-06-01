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
  resizeCornerAspectSE,
  resizeEdgeAspectE,
  seedDeprojectCrop,
  fitCropToSource,
  rescaleCrop,
  type Crop,
  type Bounds,
} from '../../../../tools/famous-curator/ui/cropMath';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

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
      x: 150,
      y: 130,
      width: 400,
      height: 400,
      rotationDeg: 0,
    });
  });

  it('allows the rect to extend off the left edge as long as the center stays in', () => {
    // dx=-200 → new center x = 100, still inside bounds.  Corners hang off.
    expect(translateCrop(start, -200, 0, bounds)).toEqual({
      x: -100,
      y: 100,
      width: 400,
      height: 400,
      rotationDeg: 0,
    });
  });

  it('clamps the center to the right edge', () => {
    // dx=2000 would put center at 2300; clamps to width=1000.
    // → center x = 1000 → x = 1000 - 200 = 800.
    expect(translateCrop(start, 2000, 0, bounds)).toEqual({
      x: 800,
      y: 100,
      width: 400,
      height: 400,
      rotationDeg: 0,
    });
  });

  it('clamps the center to the bottom edge', () => {
    expect(translateCrop(start, 0, 2000, bounds)).toEqual({
      x: 100,
      y: 600,
      width: 400,
      height: 400,
      rotationDeg: 0,
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

const B = { width: 1000, height: 1000 };

describe('cropMath aspect-locked helpers', () => {
  it('resizeCornerAspectSE keeps height = width * aspect', () => {
    const c = { x: 100, y: 100, width: 200, height: 100, rotationDeg: 30 };
    const out = resizeCornerAspectSE(c, 50, 50, 0.5, B);
    expect(out.height).toBeCloseTo(out.width * 0.5, 0);
    expect(out.rotationDeg).toBe(30); // rotation carried through, not modified
  });

  it('resizeEdgeAspectE grows width and recomputes height from aspect', () => {
    const c = { x: 100, y: 100, width: 200, height: 80, rotationDeg: 0 };
    const out = resizeEdgeAspectE(c, 100, 0.4, B);
    expect(out.width).toBeGreaterThan(200);
    expect(out.height).toBeCloseTo(out.width * 0.4, 0);
  });

  it('seedDeprojectCrop frames the disk at the requested margin', () => {
    const center: Vec2 = [500, 500];
    const out = seedDeprojectCrop(center, 40, 30, 0.5, 0.25, B);
    expect(out.width).toBeCloseTo(2 * 40 * 1.25, 6); // 100
    expect(out.height).toBeCloseTo(out.width * 0.5, 0); // 50
    expect(out.rotationDeg).toBe(30);
    expect(out.x + out.width / 2).toBeCloseTo(center[0], 6);
    expect(out.y + out.height / 2).toBeCloseTo(center[1], 6);
  });

  it('seedDeprojectCrop at aspect 1 is a square framing', () => {
    const out = seedDeprojectCrop([500, 500], 50, 0, 1, 0, B);
    expect(out.width).toBe(out.height);
  });
});

describe('rescaleCrop', () => {
  it('multiplies every coordinate by the scale and preserves rotation', () => {
    const c: Crop = { x: 100, y: 200, width: 400, height: 400, rotationDeg: 30 };
    expect(rescaleCrop(c, 0.5)).toEqual({
      x: 50,
      y: 100,
      width: 200,
      height: 200,
      rotationDeg: 30,
    });
  });

  it('is identity at scale 1', () => {
    const c: Crop = { x: 17, y: 23, width: 99, height: 99, rotationDeg: -12 };
    expect(rescaleCrop(c, 1)).toEqual(c);
  });

  it('maps the real m77 crop onto the smaller re-fetch exactly', () => {
    // Authored 3774² on a 3774-wide source, re-fetched at 1718 wide:
    // scale = 1718/3774 ⇒ width 1718, fully inside the 1718×1716 source.
    const c: Crop = { x: 0, y: 176.49, width: 3774, height: 3774, rotationDeg: 0 };
    const out = rescaleCrop(c, 1718 / 3774);
    expect(out.width).toBeCloseTo(1718, 6);
    expect(out.height).toBeCloseTo(1718, 6);
    expect(out.x).toBe(0);
  });

  it('preserves an intentional off-image overhang (unlike fitCropToSource)', () => {
    // A crop whose centre is in-bounds but corners hang off must keep hanging
    // off after an exact rescale — the relationship to the image is unchanged.
    const c: Crop = { x: -50, y: -50, width: 200, height: 200, rotationDeg: 0 };
    const out = rescaleCrop(c, 2);
    expect(out.x).toBe(-100);
    expect(out.y).toBe(-100);
    expect(out.width).toBe(400);
  });
});

describe('fitCropToSource', () => {
  it('returns a crop that already fits unchanged', () => {
    const c: Crop = { x: 100, y: 100, width: 200, height: 200, rotationDeg: 30 };
    expect(fitCropToSource(c, { width: 1000, height: 1000 })).toEqual(c);
  });

  it('scales an oversized crop down to fit and keeps it within bounds', () => {
    // The real m77 case: a 3774² crop authored on a ~3774px source, resumed
    // against a 1718×1716 re-fetch — must no longer overflow.
    const c: Crop = { x: 0, y: 176.49, width: 3774, height: 3774, rotationDeg: 0 };
    const b = { width: 1718, height: 1716 };
    const out = fitCropToSource(c, b);
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.y).toBeGreaterThanOrEqual(0);
    expect(out.x + out.width).toBeLessThanOrEqual(b.width + 1e-6);
    expect(out.y + out.height).toBeLessThanOrEqual(b.height + 1e-6);
    expect(out.width).toBeCloseTo(out.height, 6); // square preserved
    expect(out.rotationDeg).toBe(0);
  });

  it('clamps a negative-origin overflow crop into the image', () => {
    const c: Crop = { x: -30, y: 40, width: 2838, height: 2838, rotationDeg: -32 };
    const b = { width: 1290, height: 1290 };
    const out = fitCropToSource(c, b);
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.x + out.width).toBeLessThanOrEqual(b.width + 1e-6);
    expect(out.rotationDeg).toBe(-32); // rotation carried through
  });
});
