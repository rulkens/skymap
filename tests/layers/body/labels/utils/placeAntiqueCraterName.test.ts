import { describe, it, expect } from 'vitest';
import type { AntiqueMoonPlace } from '../../../../../src/@types/rendering/AntiqueMoonPlace';
import { placeAntiqueCraterName } from '../../../../../src/layers/body/labels/utils/placeAntiqueCraterName';
import { ANTIQUE_PLACE_LETTERING } from '../../../../../src/data/labels/antiquePlaceLettering';
import { orthographicMoonView, sunOverLon } from '../../../../helpers/labels/orthographicMoonView';

const LETTERING = ANTIQUE_PLACE_LETTERING['moonPlace-copernicus']!;
const crater = (
  name: string,
  lonDeg: number,
  diameterKm: number,
  rank: number,
): Extract<AntiqueMoonPlace, { kind: 'crater' }> => ({
  id: `moonPlace-test-${name}`,
  name,
  kind: 'crater',
  rank,
  latDeg: 0,
  lonDeg,
  diameterKm,
});

describe('placeAntiqueCraterName', () => {
  it('sets a name beside the rim even where the floor could hold it, never on the floor', () => {
    const view = orthographicMoonView(4000);
    const at = placeAntiqueCraterName(crater('Clavius', 0, 230, 12), view, LETTERING)!;
    expect(at.alignX).toBe('left');
    expect(at.xPx).toBeGreaterThan(view.project(0, 115 / 1737 / (Math.PI / 180))![0]);
    expect(at.alpha).toBe(1);
  });

  it('sizes a name by the print weight of its rim: a fresh crater larger, a worn one smaller', () => {
    const view = orthographicMoonView(400);
    const px = (weight: number) =>
      placeAntiqueCraterName(crater('Tycho', 0, 85, 1), view, LETTERING, weight)!.px;
    expect(px(1.3)).toBeGreaterThan(px(1));
    expect(px(0.4)).toBeLessThan(px(1));
  });

  it('sets it right of the east rim when the crater is too small to hold it', () => {
    const view = orthographicMoonView(400);
    const place = crater('Clavius', 0, 230, 12);
    const at = placeAntiqueCraterName(place, view, LETTERING)!;
    expect(at.alignX).toBe('left');
    expect(at.xPx).toBeGreaterThan(view.project(0, 115 / 1737 / (Math.PI / 180))![0]);
    expect(at.yPx).toBeCloseTo(450);
  });

  it('flips left of the rim when the right-hand box would run off the limb', () => {
    const view = orthographicMoonView(800);
    const at = placeAntiqueCraterName(crater('Tycho', 75, 85, 1), view, LETTERING)!;
    expect(at.alignX).toBe('right');
    expect(at.xPx).toBeLessThan(view.project(0, 75)![0]);
    expect(at.alpha).toBeGreaterThan(0);
  });

  it('flips left of the rim when the right-hand box would end past the terminator', () => {
    // Terminator 6° east of the crater: the name's far end would sit in the night.
    const view = orthographicMoonView(400, sunOverLon(-84));
    const at = placeAntiqueCraterName(crater('Copernicus', 0, 96, 2), view, LETTERING)!;
    expect(at.alignX).toBe('right');
    expect(at.alpha).toBe(1);
  });

  it('keeps no name on the night side', () => {
    const night = sunOverLon(180);
    for (const radiusPx of [400, 4000]) {
      const at = placeAntiqueCraterName(
        crater('Clavius', 0, 230, 12),
        orthographicMoonView(radiusPx, night),
        LETTERING,
      );
      expect(at?.alpha ?? 0).toBe(0);
    }
  });

  it('reveals by rank: at one size a top-ranked crater shows and a low-ranked one does not', () => {
    // 30 km across at ~0.33 px/km: 10 px, past rank 1's 3.6 px but short of rank 87's ~70 px.
    const view = orthographicMoonView(580);
    expect(placeAntiqueCraterName(crater('Plato', 0, 30, 1), view, LETTERING)!.alpha).toBe(1);
    expect(placeAntiqueCraterName(crater('Plato', 0, 30, 87), view, LETTERING)!.alpha).toBe(0);
  });
});
