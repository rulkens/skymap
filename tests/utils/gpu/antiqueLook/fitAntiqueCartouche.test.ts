import { describe, expect, it } from 'vitest';

import type { AntiqueSheetAnchor } from '../../../../src/@types/rendering/AntiqueSheetAnchor';
import type { ScreenDiscPx } from '../../../../src/@types/rendering/ScreenDiscPx';
import type { ScreenRectPx } from '../../../../src/@types/rendering/ScreenRectPx';
import type { Vec2 } from '../../../../src/@types/math/Vec2';
import { fitAntiqueCartouche } from '../../../../src/utils/gpu/antiqueLook/fitAntiqueCartouche';
import { sheetAnchorCentre } from '../../../../src/utils/render/sheetAnchorCentre';

const CARTOUCHE: AntiqueSheetAnchor = { corner: 'topLeft', insetUnits: [240, 233], sizeUnits: 380 };
const ASPECT = 1.07;
const DESKTOP: Vec2 = [1600, 900];
// A 400×850 CSS phone at dpr 2: print units follow the canvas height.
const PHONE: Vec2 = [800, 1700];
const PHONE_UNIT = 1700 / 900;

const fit = (
  size: Vec2,
  unitPx: number,
  covers: readonly ScreenRectPx[] = [],
  subjects: readonly ScreenDiscPx[] = [],
) => fitAntiqueCartouche({ anchor: CARTOUCHE, aspect: ASPECT, size, unitPx, covers, subjects });
const rectOf = (a: AntiqueSheetAnchor, size = DESKTOP, unitPx = 1): ScreenRectPx => {
  const [cx, cy] = sheetAnchorCentre(a, size[0], size[1], unitPx);
  const hw = (a.sizeUnits * unitPx) / 2;
  const hh = hw * ASPECT;
  return { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
};
const overlaps = (a: ScreenRectPx, b: ScreenRectPx) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
// Whether any part of the rect's box lies inside the disc.
const touches = (r: ScreenRectPx, d: ScreenDiscPx) => {
  const x = Math.min(Math.max(d.centre[0], r.x0), r.x1);
  const y = Math.min(Math.max(d.centre[1], r.y0), r.y1);
  return Math.hypot(x - d.centre[0], y - d.centre[1]) < d.radius;
};

describe('fitAntiqueCartouche', () => {
  it('keeps the authored corner and size when nothing covers it', () => {
    expect(fit(DESKTOP, 1)).toEqual(CARTOUCHE);
  });

  it('moves to the next free corner, its outer edges at the same margins', () => {
    const navigation = { x0: 0, y0: 240, x1: 290, y1: 880 };
    const moved = fit(DESKTOP, 1, [navigation]);
    expect(moved.corner).toBe('topRight');
    expect(moved.insetUnits).toEqual(CARTOUCHE.insetUnits);
    expect(overlaps(rectOf(moved), navigation)).toBe(false);
  });

  it('shrinks into its corner when every corner is covered at full size', () => {
    const covers = [
      { x0: 0, y0: 300, x1: 290, y1: 880 }, // the left stack
      { x0: 1260, y0: 0, x1: 1600, y1: 470 }, // an open card
      { x0: 1040, y0: 740, x1: 1600, y1: 900 }, // the time bar
    ];
    const fitted = fit(DESKTOP, 1, covers);
    expect(fitted.corner).toBe('topLeft');
    expect(fitted.sizeUnits).toBeLessThan(CARTOUCHE.sizeUnits);
    expect(covers.some((c) => overlaps(rectOf(fitted), c))).toBe(false);
    // The corner-side edges stay where the full-size cartouche had them.
    const full = rectOf(CARTOUCHE);
    expect(rectOf(fitted).x0).toBeCloseTo(full.x0);
    expect(rectOf(fitted).y0).toBeCloseTo(full.y0);
  });

  it('shrinks hard on a phone, to two fifths of the screen width', () => {
    const r = rectOf(fit(PHONE, PHONE_UNIT), PHONE, PHONE_UNIT);
    expect(r.x1 - r.x0).toBeLessThanOrEqual(0.4 * PHONE[0] + 1e-6);
    expect(r.x0).toBeGreaterThanOrEqual(0);
  });

  it('never covers the subject while a free place exists', () => {
    // Saturn and its rings just below the top-left corner of a phone, the sheet open below.
    const saturn = { centre: [330, 760] as Vec2, radius: 300 };
    const sheet = { x0: 0, y0: 1270, x1: 800, y1: 1700 };
    const placed = fit(PHONE, PHONE_UNIT, [sheet], [saturn]);
    const r = rectOf(placed, PHONE, PHONE_UNIT);
    expect(touches(r, saturn)).toBe(false);
    expect(overlaps(r, sheet)).toBe(false);
  });

  it('takes the smallest share of the subject when every place touches it', () => {
    const moon = { centre: [800, 450] as Vec2, radius: 560 };
    const placed = rectOf(fit(DESKTOP, 1, [], [moon]));
    const authored = rectOf(CARTOUCHE);
    const inside = (r: ScreenRectPx) => {
      let n = 0;
      for (let i = 0; i < 20; i++)
        for (let j = 0; j < 20; j++) {
          const x = r.x0 + ((i + 0.5) / 20) * (r.x1 - r.x0);
          const y = r.y0 + ((j + 0.5) / 20) * (r.y1 - r.y0);
          if (Math.hypot(x - moon.centre[0], y - moon.centre[1]) < moon.radius) n++;
        }
      return n * (r.x1 - r.x0) * (r.y1 - r.y0);
    };
    expect(inside(placed)).toBeLessThan(inside(authored));
  });

  it('treats a globe filling the whole plate as ground, not a subject to keep clear', () => {
    const earth = { centre: [800, 2400] as Vec2, radius: 4000 };
    expect(fit(DESKTOP, 1, [], [earth])).toEqual(CARTOUCHE);
  });
});
