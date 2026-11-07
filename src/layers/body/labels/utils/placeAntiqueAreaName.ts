/**
 * placeAntiqueAreaName — a mare's or Terra's name centred on its anchor, shown while
 * its box (set smaller, to a floor, in a narrow sea) fits the extent as the eye sees
 * it and both its ends are lit. The extent is measured across the four mid-edge
 * points, each walked back from past the limb
 * (`visibleSurfacePx`), so a plain foreshortened to a sliver at the limb drops its
 * name; testing the box's ends, not just its centre, keeps a name from straddling the
 * terminator into the hatched night. Null when the anchor is out of sight.
 */

import type { Vec2 } from '../../../../@types/math/Vec2';
import type { AntiqueMoonPlace } from '../../../../@types/rendering/AntiqueMoonPlace';
import type { AntiquePlaceLettering } from '../../../../@types/rendering/AntiquePlaceLettering';
import type { AntiqueBodyView } from '../@types/AntiqueBodyView';
import type { AntiqueNamePlacement } from '../@types/AntiqueNamePlacement';
import { ANTIQUE_MOON_PLACE_REVEAL } from '../../../../data/labels/antiqueMoonPlaceReveal';
import { smoothstep } from '../../../../utils/math/smoothstep';
import { rectRoomInCircle } from '../../../../utils/math/rectRoomInCircle';
import { antiqueNameBoxPx } from './antiqueNameBoxPx';
import { visibleSurfacePx } from './visibleSurfacePx';
import { sunCosAlong } from './sunCosAlong';

const LIMB_CLEAR_PX = 4;

export function placeAntiqueAreaName(
  place: Extract<AntiqueMoonPlace, { kind: 'mare' | 'terra' }>,
  view: AntiqueBodyView,
  lettering: AntiquePlaceLettering,
): AntiqueNamePlacement | null {
  const { fitPx, sunCos, lineEm, areaShrink } = ANTIQUE_MOON_PLACE_REVEAL;
  const { latDeg: lat, lonDeg: lon } = place;
  const [south, north, west, east] = place.extentDeg;
  if (view.facing(lat, lon) <= 0) return null;
  const centre = view.project(lat, lon);
  const w = visibleSurfacePx(view, lat, west, lat, lon);
  const e = visibleSurfacePx(view, lat, east, lat, lon);
  const s = visibleSurfacePx(view, south, lon, lat, lon);
  const n = visibleSurfacePx(view, north, lon, lat, lon);
  if (!centre || !w || !e || !s || !n) return null;

  const { cut, trackingEm = 0 } = lettering;
  // A sea narrower than its name sets it smaller, down to `areaShrink` of the type.
  const full = antiqueNameBoxPx(place.name, cut, trackingEm, lettering.px, lineEm);
  const fit = Math.min(
    (Math.abs(e[0] - w[0]) - fitPx[1]) / full.width,
    (Math.abs(n[1] - s[1]) - fitPx[1]) / full.height,
  );
  const px = lettering.px * Math.min(1, Math.max(areaShrink, fit));
  const box = antiqueNameBoxPx(place.name, cut, trackingEm, px, lineEm);
  const extentRoomPx = Math.min(
    Math.abs(e[0] - w[0]) - box.width,
    Math.abs(n[1] - s[1]) - box.height,
  );
  // An extent's corners can droop below the limb's curve, so a name must also clear the
  // limb. As an engraver would, it first moves inward, but never by more than its room
  // in the extent: Procellarum can, a thin strip like Frigoris fades instead.
  const disc = view.discCentrePx;
  const discRoomAt = (at: Vec2): number =>
    disc === null
      ? Infinity
      : rectRoomInCircle(
          {
            x0: at[0] - box.width / 2,
            y0: at[1] - box.height / 2,
            x1: at[0] + box.width / 2,
            y1: at[1] + box.height / 2,
          },
          disc,
          view.discRadiusPx,
        ) - LIMB_CLEAR_PX;
  let at: Vec2 = centre;
  if (disc !== null && discRoomAt(at) < fitPx[1]) {
    const toCentre = [disc[0] - centre[0], disc[1] - centre[1]] as const;
    const len = Math.hypot(toCentre[0], toCentre[1]) || 1;
    const shift = Math.min(Math.max(extentRoomPx, 0), len);
    // Radial steps shrink a corner's distance by less than their length; a few settle it.
    for (let moved = 0, k = 0; k < 4 && discRoomAt(at) < fitPx[1] && moved < shift; k++) {
      const step = Math.min(fitPx[1] - discRoomAt(at), shift - moved);
      moved += step;
      at = [centre[0] + (toCentre[0] / len) * moved, centre[1] + (toCentre[1] / len) * moved];
    }
  }
  const roomPx = Math.min(extentRoomPx, discRoomAt(at));
  const halfKm = box.width / 2 / view.pxPerKm(lat, lon);
  const sun = Math.min(
    view.sunCos(lat, lon),
    sunCosAlong(view, lat, lon, halfKm),
    sunCosAlong(view, lat, lon, -halfKm),
  );
  return {
    xPx: at[0],
    yPx: at[1],
    alignX: 'center',
    px,
    alpha: smoothstep(fitPx[0], fitPx[1], roomPx) * smoothstep(sunCos.area[0], sunCos.area[1], sun),
  };
}
