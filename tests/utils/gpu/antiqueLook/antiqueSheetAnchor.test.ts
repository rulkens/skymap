import { describe, expect, it } from 'vitest';

import type { AntiqueOrnamentAnchor } from '../../../../src/@types/rendering/AntiqueOrnamentAnchor';
import type { ScreenRectPx } from '../../../../src/@types/rendering/ScreenRectPx';
import { antiqueSheetAnchor } from '../../../../src/utils/gpu/antiqueLook/antiqueSheetAnchor';
import { sheetAnchorCentre } from '../../../../src/utils/render/sheetAnchorCentre';

const CARTOUCHE: Extract<AntiqueOrnamentAnchor, { kind: 'sheet' }> = {
  kind: 'sheet',
  corner: 'topLeft',
  insetUnits: [240, 178],
  sizeUnits: 380,
};
const ASPECT = 1.07;
const SIZE = [1600, 900] as const;

const rectOf = (a: ReturnType<typeof antiqueSheetAnchor>): ScreenRectPx => {
  const [cx, cy] = sheetAnchorCentre(a, SIZE[0], SIZE[1], 1);
  const hw = a.sizeUnits / 2;
  const hh = hw * ASPECT;
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
};
const overlaps = (a: ScreenRectPx, b: ScreenRectPx) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

describe('antiqueSheetAnchor', () => {
  it('keeps the authored corner and size when nothing covers it', () => {
    expect(antiqueSheetAnchor(CARTOUCHE, ASPECT, SIZE, 1, [])).toEqual(CARTOUCHE);
  });

  it('moves to the next free corner, its outer edges at the same margins', () => {
    const navigation = { x0: 0, y0: 240, x1: 290, y1: 880 };
    const moved = antiqueSheetAnchor(CARTOUCHE, ASPECT, SIZE, 1, [navigation]);
    expect(moved.corner).toBe('topRight');
    expect(moved.insetUnits).toEqual(CARTOUCHE.insetUnits);
    expect(overlaps(rectOf(moved), navigation)).toBe(false);
  });

  it('shrinks into its corner when every corner is covered at full size', () => {
    const covers = [
      { x0: 0, y0: 240, x1: 290, y1: 880 }, // the left stack
      { x0: 1260, y0: 0, x1: 1600, y1: 470 }, // an open card
      { x0: 1040, y0: 740, x1: 1600, y1: 900 }, // the time bar
    ];
    const fitted = antiqueSheetAnchor(CARTOUCHE, ASPECT, SIZE, 1, covers);
    expect(fitted.corner).toBe('topLeft');
    expect(fitted.sizeUnits).toBeLessThan(CARTOUCHE.sizeUnits);
    expect(covers.some((c) => overlaps(rectOf(fitted), c))).toBe(false);
    // The corner-side edges stay where the full-size cartouche had them.
    const full = rectOf(CARTOUCHE);
    expect(rectOf(fitted).x0).toBeCloseTo(full.x0);
    expect(rectOf(fitted).y0).toBeCloseTo(full.y0);
  });
});
