/**
 * cropMath — pure helpers for the 1:1-locked crop rectangle.
 *
 * All helpers operate in source-image pixel space, NOT canvas-display
 * space (the React component handles the canvas↔image transform).
 *
 * Behaviour spec:
 *   - All crops are square (width === height).
 *   - Corner-drag resizes symmetrically around the opposite corner.
 *   - Edge-drag resizes along one axis, with the other axis growing in
 *     sync so the rectangle stays square (the OPPOSITE edge moves
 *     inward).  This matches Photoshop's "constrain proportions" UX.
 *   - Body-drag translates the crop, clamped to source bounds.
 *   - Reset-crop returns a centred square of 80% the min dimension.
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
  type Crop,
  type Bounds,
} from '../../../../tools/famous-curator/ui/cropMath';

const bounds: Bounds = { width: 1000, height: 800 };

describe('resetCrop', () => {
  it('returns a centred square at 80% of min dimension', () => {
    const c = resetCrop(bounds);
    expect(c.width).toBe(640);  // 800 * 0.8
    expect(c.height).toBe(640);
    expect(c.x).toBe((1000 - 640) / 2);
    expect(c.y).toBe((800 - 640) / 2);
  });
});

describe('translateCrop', () => {
  const start: Crop = { x: 100, y: 100, width: 400, height: 400 };

  it('moves by dx, dy when fully inside bounds', () => {
    expect(translateCrop(start, 50, 30, bounds)).toEqual({ x: 150, y: 130, width: 400, height: 400 });
  });

  it('clamps to the left edge', () => {
    expect(translateCrop(start, -200, 0, bounds)).toEqual({ x: 0, y: 100, width: 400, height: 400 });
  });

  it('clamps to the right edge', () => {
    expect(translateCrop(start, 800, 0, bounds)).toEqual({ x: 600, y: 100, width: 400, height: 400 });
  });

  it('clamps to the bottom edge', () => {
    expect(translateCrop(start, 0, 800, bounds)).toEqual({ x: 100, y: 400, width: 400, height: 400 });
  });
});

describe('corner resize (anchor at opposite corner)', () => {
  const c: Crop = { x: 200, y: 200, width: 400, height: 400 };

  it('SE corner drag: enlarging keeps NW anchor, stays square', () => {
    const out = resizeCornerSE(c, 100, 60, bounds);
    // dx=100, dy=60 → snap to the larger of the two so we stay square.
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    expect(out.x).toBe(200); // NW anchor unchanged
    expect(out.y).toBe(200);
  });

  it('NW corner drag: enlarging keeps SE anchor, stays square', () => {
    const out = resizeCornerNW(c, -100, -100, bounds);
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    // SE anchor at (600, 600) → new x = 600 - 500 = 100; new y = 100.
    expect(out.x).toBe(100);
    expect(out.y).toBe(100);
  });

  it('NE corner drag: keeps SW anchor', () => {
    const out = resizeCornerNE(c, 100, -100, bounds);
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    expect(out.x).toBe(200); // SW anchor x = 200 unchanged
    expect(out.y).toBe(100); // SW anchor y = 600 unchanged → new y = 600 - 500
  });

  it('SW corner drag: keeps NE anchor', () => {
    const out = resizeCornerSW(c, -100, 100, bounds);
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    // NE anchor at (600, 200) → new x = 600 - 500 = 100; new y = 200.
    expect(out.x).toBe(100);
    expect(out.y).toBe(200);
  });

  it('clamps so the rect cannot exceed bounds', () => {
    const out = resizeCornerSE(c, 5000, 5000, bounds);
    // Anchor NW at (200,200); max square fits in 600×600 remaining → 600.
    expect(out.width).toBe(600);
    expect(out.height).toBe(600);
  });
});

describe('edge resize (square locked by opposite edge moving in sync)', () => {
  const c: Crop = { x: 200, y: 200, width: 400, height: 400 };

  it('E edge: dx widens, opposite (N+S) edges contract by dx/2 each? — no: spec says square via opposite-edge sync. dx=100 → width 500, height 500, centred on the original mid-Y', () => {
    const out = resizeEdgeE(c, 100, bounds);
    expect(out.width).toBe(500);
    expect(out.height).toBe(500);
    expect(out.x).toBe(200); // W edge unchanged
    // Y centred on the original mid-Y (400) → y = 400 - 250 = 150.
    expect(out.y).toBe(150);
  });

  it('W edge: dx negative widens', () => {
    const out = resizeEdgeW(c, -100, bounds);
    expect(out.width).toBe(500);
    expect(out.x).toBe(100);
    expect(out.y).toBe(150);
  });

  it('N edge: dy negative widens upward', () => {
    const out = resizeEdgeN(c, -100, bounds);
    expect(out.height).toBe(500);
    expect(out.y).toBe(100);
    expect(out.x).toBe(150);
  });

  it('S edge: dy positive widens downward', () => {
    const out = resizeEdgeS(c, 100, bounds);
    expect(out.height).toBe(500);
    expect(out.y).toBe(200);
    expect(out.x).toBe(150);
  });
});
