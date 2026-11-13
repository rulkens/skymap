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

  it('sets a name smaller in a sea too narrow for its type, down to a floor', () => {
    const narrow = placeAntiqueAreaName(crisiumAt(0), orthographicMoonView(200), LETTERING)!;
    expect(narrow.alpha).toBe(1);
    expect(narrow.px).toBeLessThan(LETTERING.px);
    expect(narrow.px).toBeGreaterThanOrEqual(0.72 * LETTERING.px);
    expect(placeAntiqueAreaName(crisiumAt(0), orthographicMoonView(110), LETTERING)!.alpha).toBe(0);
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

  it('keeps a sea foreshortened at the limb named, moved inward off it', () => {
    // Seen from 25° south, Mare Frigoris is a sliver under the north limb, but its
    // extent square-on holds its name: Riccioli letters every sea.
    const frigoris = ANTIQUE_MOON_PLACES.find((p) => p.id === 'moonPlace-mareFrigoris')!;
    if (frigoris.kind === 'crater') throw new Error('Mare Frigoris is a mare');
    const view = orthographicMoonView(315, [1, 0, 0], -25);
    const anchor = view.project(frigoris.latDeg, frigoris.lonDeg)!;
    const at = placeAntiqueAreaName(frigoris, view, ANTIQUE_PLACE_LETTERING[frigoris.id]!)!;
    expect(at.alpha).toBeCloseTo(1);
    expect(at.yPx).toBeGreaterThan(anchor[1]);
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
