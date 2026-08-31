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
    // worldEmMpc 1 at clipW 1 with a 168 px viewport height projects to
    // (1 / 1) · 84 = 84 px per em — exactly ATLAS_FONT_SIZE, so the scale is 1
    // and the bbox lands on the anchor unchanged. The clamps are opened wide so
    // neither of them is what makes this pass.
    const rect = labelScreenRect({
      label: label({ worldEmMpc: 1, minPixelSize: 1, maxPixelSize: 1000 }),
      bbox: BBOX,
      screenPx: [100, 200],
      clipW: 1,
      viewportHeightPx: 2 * ATLAS_FONT_SIZE,
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
      viewportHeightPx: 2 * ATLAS_FONT_SIZE,
    });
    expect(rect).toEqual({ x0: 95, y0: 190, x1: 115, y1: 202.5 });
  });

  it('clamps the projected em to minPixelSize when the anchor is far away', () => {
    // clipW 100 drops the projected em to 0.84 px; the floor lifts it to 42,
    // the same scale 0.5 as above — a far label keeps a legible, clickable box.
    const rect = labelScreenRect({
      label: label({ worldEmMpc: 1, minPixelSize: ATLAS_FONT_SIZE / 2, maxPixelSize: 1000 }),
      bbox: BBOX,
      screenPx: [100, 200],
      clipW: 100,
      viewportHeightPx: 2 * ATLAS_FONT_SIZE,
    });
    expect(rect).toEqual({ x0: 95, y0: 190, x1: 115, y1: 202.5 });
  });

  it('inflates by padPx on every side', () => {
    const rect = labelScreenRect({
      label: label({ worldEmMpc: 1, minPixelSize: 1, maxPixelSize: 1000 }),
      bbox: BBOX,
      screenPx: [100, 200],
      clipW: 1,
      viewportHeightPx: 2 * ATLAS_FONT_SIZE,
      padPx: 8,
    });
    expect(rect).toEqual({ x0: 82, y0: 172, x1: 138, y1: 213 });
  });
});
