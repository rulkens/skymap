import { describe, it, expect } from 'vitest';
import type { AntiqueMoonPlace } from '../../../../../src/@types/rendering/AntiqueMoonPlace';
import { placeAntiqueAreaName } from '../../../../../src/layers/body/labels/utils/placeAntiqueAreaName';
import { ANTIQUE_PLACE_LETTERING } from '../../../../../src/data/labels/antiquePlaceLettering';
import { ANTIQUE_MOON_PLACES } from '../../../../../src/data/labels/antiqueMoonPlaces';
import { orthographicMoonView, sunOverLon } from '../../../../helpers/labels/orthographicMoonView';

const LETTERING = ANTIQUE_PLACE_LETTERING['moonPlace-mareCrisium']!;
// Mare Crisium's IAU box, turned so its anchor sits `lonDeg` east of the eye's meridian.
const crisiumAt = (lonDeg: number): Extract<AntiqueMoonPlace, { kind: 'mare' | 'terra' }> => ({
  id: 'moonPlace-mareCrisium',
  name: 'Mare\nCrisium',
  kind: 'mare',
  rank: 10,
  latDeg: 16.2,
  lonDeg,
  extentDeg: [9.7, 24.5, lonDeg - 9.6, lonDeg + 9.4],
});

describe('placeAntiqueAreaName', () => {
  it('centres a mare name on its anchor while the mare holds it face-on', () => {
    const view = orthographicMoonView(800);
    const at = placeAntiqueAreaName(crisiumAt(0), view, LETTERING)!;
    expect(at.alignX).toBe('center');
    expect(at.xPx).toBeCloseTo(view.project(16.2, 0)![0]);
    expect(at.alpha).toBe(1);
  });

  it('drops the name when the limb foreshortens the mare to a sliver, though its anchor is in sight', () => {
    // Anchor 84° east: still facing the eye, but the far edge is clipped at the limb.
    const at = placeAntiqueAreaName(crisiumAt(84), orthographicMoonView(800), LETTERING);
    expect(at).not.toBeNull();
    expect(at!.alpha).toBe(0);
  });

  it('drops the name when one end of its box would cross the terminator, though its anchor is lit', () => {
    // Terminator 5° east of the anchor; the box's east end reaches past it.
    const view = orthographicMoonView(800, sunOverLon(-85));
    expect(view.sunCos(16.2, 0)).toBeGreaterThan(0.06);
    expect(placeAntiqueAreaName(crisiumAt(0), view, LETTERING)!.alpha).toBe(0);
  });

  it("fades a name out before it overhangs the limb, where the extent's corners droop below it", () => {
    // Seen from 20° south, Mare Frigoris's long box fits its extent but not the disc.
    const frigoris = ANTIQUE_MOON_PLACES.find((p) => p.id === 'moonPlace-mareFrigoris')!;
    if (frigoris.kind === 'crater') throw new Error('Mare Frigoris is a mare');
    const view = orthographicMoonView(315, [1, 0, 0], -20);
    const at = placeAntiqueAreaName(frigoris, view, ANTIQUE_PLACE_LETTERING[frigoris.id]!);
    expect(at!.alpha).toBe(0);
  });

  it("moves a wide sea's name inward off the limb rather than dropping it", () => {
    const procellarum = ANTIQUE_MOON_PLACES.find((p) => p.id === 'moonPlace-oceanusProcellarum')!;
    if (procellarum.kind === 'crater') throw new Error('Procellarum is a mare');
    const view = orthographicMoonView(317, [1, 0, 0], -14);
    const anchor = view.project(procellarum.latDeg, procellarum.lonDeg)!;
    const at = placeAntiqueAreaName(procellarum, view, ANTIQUE_PLACE_LETTERING[procellarum.id]!)!;
    expect(at.alpha).toBe(1);
    expect(at.xPx).toBeGreaterThan(anchor[0]);
    expect(at.yPx).toBeGreaterThan(anchor[1]);
  });
});
