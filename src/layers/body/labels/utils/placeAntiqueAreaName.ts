/**
 * placeAntiqueAreaName — a mare's or Terra's name centred on its anchor, shown while
 * its box (set smaller, to a floor, in a narrow sea) fits the extent and both its ends
 * are lit. The extent is the larger of the four mid-edge points as seen, each walked
 * back from past the limb (`visibleSurfacePx`), and the extent square-on: foreshortening
 * never drops a sea big enough for its name (Crisium at the limb of a full Moon; Riccioli
 * letters every sea), only turning past `facing` does. Testing the box's ends, not just
 * its centre, keeps a name from straddling the terminator. Null when the anchor is out of sight.
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
const DEG = Math.PI / 180;
const SHRINK_STEP = 0.92;

export function placeAntiqueAreaName(
  place: Extract<AntiqueMoonPlace, { kind: 'mare' | 'terra' }>,
  view: AntiqueBodyView,
  lettering: AntiquePlaceLettering,
): AntiqueNamePlacement | null {
  const { fitPx, sunCos, lineEm, areaShrink, facing } = ANTIQUE_MOON_PLACE_REVEAL;
  const { latDeg: lat, lonDeg: lon } = place;
  const [south, north, west, east] = place.extentDeg;
  const facingCos = view.facing(lat, lon);
  if (facingCos <= 0) return null;
  const centre = view.project(lat, lon);
  const w = visibleSurfacePx(view, lat, west, lat, lon);
  const e = visibleSurfacePx(view, lat, east, lat, lon);
  const s = visibleSurfacePx(view, south, lon, lat, lon);
  const n = visibleSurfacePx(view, north, lon, lat, lon);
  if (!centre || !w || !e || !s || !n) return null;

  const pxPerDeg = (view.pxPerKm(lat, lon) * view.radiusKm * Math.PI) / 180;
  const widthPx = Math.max(Math.abs(e[0] - w[0]), (east - west) * Math.cos(lat * DEG) * pxPerDeg);
  const heightPx = Math.max(Math.abs(n[1] - s[1]), (north - south) * pxPerDeg);
  const { cut, trackingEm = 0 } = lettering;
  const disc = view.discCentrePx;
  // An extent's corners can droop below the limb's curve, so a name must also clear the
  // limb. As an engraver would, it first moves inward, but never by more than its room
  // in the extent, so a name never leaves the sea it names; within ~27° of an axis it
  // moves along it, keeping its row clear of the names above and below.
  const fitAt = (px: number) => {
    const box = antiqueNameBoxPx(place.name, cut, trackingEm, px, lineEm);
    const extentRoomPx = Math.min(widthPx - box.width, heightPx - box.height);
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
      const [dx, dy] = [disc[0] - centre[0], disc[1] - centre[1]];
      const dir: Vec2 =
        Math.abs(dx) > 2 * Math.abs(dy)
          ? [dx, 0]
          : Math.abs(dy) > 2 * Math.abs(dx)
            ? [0, dy]
            : [dx, dy];
      const len = Math.hypot(dir[0], dir[1]) || 1;
      const shift = Math.min(Math.max(extentRoomPx, 0), len);
      // Steps shrink a corner's distance by less than their length; a few settle it.
      for (let moved = 0, k = 0; k < 8 && discRoomAt(at) < fitPx[1] && moved < shift; k++) {
        moved += Math.min(fitPx[1] - discRoomAt(at), shift - moved);
        at = [centre[0] + (dir[0] / len) * moved, centre[1] + (dir[1] / len) * moved];
      }
    }
    return { px, box, at, roomPx: Math.min(extentRoomPx, discRoomAt(at)) };
  };
  // A sea too narrow for its name, or too near the limb, sets it smaller, down to
  // `areaShrink` of the type.
  const full = antiqueNameBoxPx(place.name, cut, trackingEm, lettering.px, lineEm);
  const fit = Math.min((widthPx - fitPx[1]) / full.width, (heightPx - fitPx[1]) / full.height);
  const floorPx = areaShrink * lettering.px;
  let placed = fitAt(Math.max(floorPx, lettering.px * Math.min(1, fit)));
  for (let k = 0; k < 4 && placed.roomPx < fitPx[1] - 0.5 && placed.px > floorPx; k++) {
    placed = fitAt(Math.max(floorPx, placed.px * SHRINK_STEP));
  }
  const { px, box, at, roomPx } = placed;
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
    slackPx: Math.max(0, (heightPx - box.height) / 2 - Math.abs(at[1] - centre[1])),
    alpha:
      smoothstep(fitPx[0], fitPx[1], roomPx) *
      smoothstep(sunCos.area[0], sunCos.area[1], sun) *
      smoothstep(facing[0], facing[1], facingCos),
  };
}
