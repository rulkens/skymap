/**
 * labelScreenRect is the CPU twin of the label vertex shader's em clamp, and
 * the ONE rect both the declutter and the pick derive from. A wrong scale
 * factor here misplaces every hit box by a silent, camera-dependent amount —
 * so the expectations below are hand-computed, never re-derived from the
 * source's own expression.
 */

import { describe, expect, it } from 'vitest';
import { labelScreenRect } from '../../../src/utils/labels/labelScreenRect';
import { ATLAS_FONT_SIZE } from '../../../src/data/fonts';
import type { Label2D } from '../../../src/@types/rendering/Label2D';
import type { LabelBBox } from '../../../src/@types/rendering/LabelBBox';

const BBOX: LabelBBox = { minX: -10, minY: -20, maxX: 30, maxY: 5 };

// The pxPerRad that projects a 1 Mpc em at clipW 1 to exactly ATLAS_FONT_SIZE
// pixels — the reference the hand-computed expectations below are written
// against. tan(30 degrees) is spelled out rather than imported so a drifted
// `LABEL_EM_PX_RETUNE` cannot cancel itself out of both sides.
const PX_PER_RAD = ATLAS_FONT_SIZE / 0.57735;

const label = (over: Partial<Label2D> = {}): Label2D =>
  ({
    id: 'l',
    worldPos: [0, 0, 0],
    text: 'l',
    font: 'cormorant',
    pixelSize: 0,
    ...over,
  }) as Label2D;

describe('labelScreenRect', () => {
  it('places the ink box at the anchor, atlas px scaled by displayEm / ATLAS_FONT_SIZE', () => {
    // worldEmMpc 1 at clipW 1 against PX_PER_RAD projects to 84 px per em —
    // exactly ATLAS_FONT_SIZE, so the scale is 1
    // and the bbox lands on the anchor unchanged. The clamps are opened wide so
    // neither of them is what makes this pass.
    const rect = labelScreenRect({
      label: label({ worldEmMpc: 1, minPixelSize: 1, maxPixelSize: 1000 }),
      bbox: BBOX,
      screenPx: [100, 200],
      clipW: 1,
      pxPerRad: PX_PER_RAD,
      devicePixelRatio: 1,
    });
    expect(rect).toEqual({ x0: 90, y0: 180, x1: 130, y1: 205 });
  });

  it('clamps the projected em to maxPixelSize before scaling', () => {
    // Same 84 px per em, ceilinged at 42 → scale 0.5, so every bbox offset
    // halves: minX -10 → -5, maxY 5 → 2.5.
    const rect = labelScreenRect({
      label: label({ worldEmMpc: 1, minPixelSize: 1, maxPixelSize: ATLAS_FONT_SIZE / 2 }),
      bbox: BBOX,
      screenPx: [100, 200],
      clipW: 1,
      pxPerRad: PX_PER_RAD,
      devicePixelRatio: 1,
    });
    expect(rect).toEqual({ x0: 95, y0: 190, x1: 115, y1: 202.5 });
  });

  it('inflates by padPx on every side', () => {
    const rect = labelScreenRect({
      label: label({ worldEmMpc: 1, minPixelSize: 1, maxPixelSize: 1000 }),
      bbox: BBOX,
      screenPx: [100, 200],
      clipW: 1,
      pxPerRad: PX_PER_RAD,
      devicePixelRatio: 1,
      padPx: 8,
    });
    expect(rect).toEqual({ x0: 82, y0: 172, x1: 138, y1: 213 });
  });

  it('ignores outlineEmFrac unless includeOutline is set — the declutter path', () => {
    // Same 84 px-per-em anchor as the first test; a wide outline must not
    // move the declutter's overlap rect at all.
    const rect = labelScreenRect({
      label: label({ worldEmMpc: 1, minPixelSize: 1, maxPixelSize: 1000, outlineEmFrac: 0.16 }),
      bbox: BBOX,
      screenPx: [100, 200],
      clipW: 1,
      pxPerRad: PX_PER_RAD,
      devicePixelRatio: 1,
    });
    expect(rect).toEqual({ x0: 90, y0: 180, x1: 130, y1: 205 });
  });

  it('inflates by the outline fringe when includeOutline is set — the pick path', () => {
    // displayEmPx is 84 (scale 1, per the first test); outlineEmFrac 0.16 ⇒
    // a 0.16 · 84 = 13.44 px fringe, matching the vertex shader's
    // `outlineEmFrac * displayEmPx` quad expansion (labels/vertex.wesl).
    const rect = labelScreenRect({
      label: label({ worldEmMpc: 1, minPixelSize: 1, maxPixelSize: 1000, outlineEmFrac: 0.16 }),
      bbox: BBOX,
      screenPx: [100, 200],
      clipW: 1,
      pxPerRad: PX_PER_RAD,
      devicePixelRatio: 1,
      includeOutline: true,
    });
    const fringe = 0.16 * 84;
    expect(rect).toEqual({
      x0: 90 - fringe,
      y0: 180 - fringe,
      x1: 130 + fringe,
      y1: 205 + fringe,
    });
  });

  // Label sizes and pads are CSS px; the screen is device px. At dpr 2 the same
  // view has twice the device px per radian, and the label must cover the same
  // CSS box: twice the device box, on the clamp, off it, and in the pad.
  it.each([
    ['held at its size clamp', { worldEmMpc: 0.001, minPixelSize: 21, maxPixelSize: 21 }],
    ['sized by its world em', { worldEmMpc: 1, minPixelSize: 1, maxPixelSize: 1000 }],
  ])('covers the same CSS box at dpr 1 and dpr 2 when %s', (_, sizing) => {
    const rectAt = (dpr: number) =>
      labelScreenRect({
        label: label(sizing),
        bbox: BBOX,
        screenPx: [100 * dpr, 200 * dpr],
        clipW: 1,
        pxPerRad: PX_PER_RAD * dpr,
        devicePixelRatio: dpr,
        padPx: 8,
      });
    const one = rectAt(1);
    const two = rectAt(2);
    expect(two).toEqual({ x0: one.x0 * 2, y0: one.y0 * 2, x1: one.x1 * 2, y1: one.y1 * 2 });
  });
});
