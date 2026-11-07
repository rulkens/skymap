/**
 * placeAntiqueAreaName — a mare's or Terra's name centred on its anchor, shown while
 * its box fits the extent as the eye sees it and both its ends are lit. The extent is
 * measured across the four mid-edge points, each walked back from past the limb
 * (`visibleSurfacePx`), so a plain foreshortened to a sliver at the limb drops its
 * name; testing the box's ends, not just its centre, keeps a name from straddling the
 * terminator into the hatched night. Null when the anchor is out of sight.
 */

import type { AntiqueMoonPlace } from '../../../../@types/rendering/AntiqueMoonPlace';
import type { AntiquePlaceLettering } from '../../../../@types/rendering/AntiquePlaceLettering';
import type { AntiqueBodyView } from '../@types/AntiqueBodyView';
import type { AntiqueNamePlacement } from '../@types/AntiqueNamePlacement';
import { ANTIQUE_MOON_PLACE_REVEAL } from '../../../../data/labels/antiqueMoonPlaceReveal';
import { smoothstep } from '../../../../utils/math/smoothstep';
import { antiqueNameBoxPx } from './antiqueNameBoxPx';
import { visibleSurfacePx } from './visibleSurfacePx';
import { sunCosAlong } from './sunCosAlong';

export function placeAntiqueAreaName(
  place: Extract<AntiqueMoonPlace, { kind: 'mare' | 'terra' }>,
  view: AntiqueBodyView,
  lettering: AntiquePlaceLettering,
): AntiqueNamePlacement | null {
  const { fitPx, sunCos, lineEm } = ANTIQUE_MOON_PLACE_REVEAL;
  const { latDeg: lat, lonDeg: lon } = place;
  const [south, north, west, east] = place.extentDeg;
  if (view.facing(lat, lon) <= 0) return null;
  const centre = view.project(lat, lon);
  const w = visibleSurfacePx(view, lat, west, lat, lon);
  const e = visibleSurfacePx(view, lat, east, lat, lon);
  const s = visibleSurfacePx(view, south, lon, lat, lon);
  const n = visibleSurfacePx(view, north, lon, lat, lon);
  if (!centre || !w || !e || !s || !n) return null;

  const { px, cut, trackingEm = 0 } = lettering;
  const box = antiqueNameBoxPx(place.name, cut, trackingEm, px, lineEm);
  const roomPx = Math.min(Math.abs(e[0] - w[0]) - box.width, Math.abs(n[1] - s[1]) - box.height);
  const halfKm = box.width / 2 / view.pxPerKm(lat, lon);
  const sun = Math.min(
    view.sunCos(lat, lon),
    sunCosAlong(view, lat, lon, halfKm),
    sunCosAlong(view, lat, lon, -halfKm),
  );
  return {
    xPx: centre[0],
    yPx: centre[1],
    alignX: 'center',
    px,
    alpha: smoothstep(fitPx[0], fitPx[1], roomPx) * smoothstep(sunCos.area[0], sunCos.area[1], sun),
  };
}
