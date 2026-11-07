/**
 * placeAntiqueCraterName — a crater's name, revealed once the crater spans
 * `craterPx[0] · craterPx[1]^rank` px, so one rank ladder both declutters and reveals.
 * It sits just right of the rim, never on the floor (where it read as the crater's own
 * feature), flipping left when that box would leave the disc or its far end is dark.
 * Beside, not below: in a north-south chain a name below one crater reads as the next
 * one's, though it may step up or down beside the rim (`slackPx`). Its size follows its
 * rim's print `weight` (Tycho's the heaviest). Null when no
 * side fits or the crater is out of sight.
 */

import type { AntiqueMoonPlace } from '../../../../@types/rendering/AntiqueMoonPlace';
import type { AntiquePlaceLettering } from '../../../../@types/rendering/AntiquePlaceLettering';
import type { AntiqueBodyView } from '../@types/AntiqueBodyView';
import type { AntiqueNamePlacement } from '../@types/AntiqueNamePlacement';
import { ANTIQUE_MOON_PLACE_REVEAL } from '../../../../data/labels/antiqueMoonPlaceReveal';
import { smoothstep } from '../../../../utils/math/smoothstep';
import { degToRad } from '../../../../utils/math/degToRad';
import { rectRoomInCircle } from '../../../../utils/math/rectRoomInCircle';
import { antiqueNameBoxPx } from './antiqueNameBoxPx';
import { sunCosAlong } from './sunCosAlong';

// A beside name keeps this far inside the disc's edge, px.
const DISC_MARGIN_PX = 2;

export function placeAntiqueCraterName(
  place: Extract<AntiqueMoonPlace, { kind: 'crater' }>,
  view: AntiqueBodyView,
  lettering: AntiquePlaceLettering,
  weight = 1,
): AntiqueNamePlacement | null {
  const reveal = ANTIQUE_MOON_PLACE_REVEAL;
  const [sunLo, sunHi] = reveal.sunCos.crater;
  const { latDeg: lat, lonDeg: lon, diameterKm } = place;
  const facing = view.facing(lat, lon);
  const centre = facing > 0 ? view.project(lat, lon) : null;
  if (!centre) return null;

  const pxPerKm = view.pxPerKm(lat, lon);
  const diameterPx = diameterKm * pxPerKm;
  const revealPx = reveal.craterPx[0] * reveal.craterPx[1] ** place.rank;
  const shown =
    smoothstep(revealPx, revealPx * reveal.revealGrow, diameterPx) *
    smoothstep(reveal.facing[0], reveal.facing[1], facing);
  // A great walled plain carries its name a size up, as an engraver lettered one.
  const grow = reveal.craterTypeGrow;
  const { perWeight, range } = reveal.craterWeightType;
  const px = Math.round(
    (lettering.px + (grow.px - lettering.px) * smoothstep(grow.fromPx, grow.toPx, diameterPx)) *
      Math.min(Math.max(1 + perWeight * (weight - 1), range[0]), range[1]),
  );
  const box = antiqueNameBoxPx(
    place.name,
    lettering.cut,
    lettering.trackingEm ?? 0,
    px,
    reveal.lineEm,
  );

  const rimDeg = (diameterKm / 2 / view.radiusKm) * (180 / Math.PI);
  const rimLonDeg = rimDeg / Math.max(Math.cos(degToRad(lat)), 0.1);
  const rimE = view.project(lat, lon + rimLonDeg);
  const rimW = view.project(lat, lon - rimLonDeg);
  if (!rimE || !rimW) return null;

  const sunAt = view.sunCos(lat, lon);

  // Screen sides, not compass ones: whichever rim point lands right is the right side.
  const eastIsRight = rimE[0] >= rimW[0];
  const farKm = diameterKm / 2 + (reveal.gapPx + box.width) / pxPerKm;
  const top = centre[1] - box.height / 2;
  const bottom = centre[1] + box.height / 2;
  for (const right of [true, false]) {
    const xPx = right
      ? Math.max(rimE[0], rimW[0], centre[0]) + reveal.gapPx
      : Math.min(rimE[0], rimW[0], centre[0]) - reveal.gapPx;
    const rect = right
      ? { x0: xPx, y0: top, x1: xPx + box.width, y1: bottom }
      : { x0: xPx - box.width, y0: top, x1: xPx, y1: bottom };
    const sunFar = Math.min(
      sunAt,
      sunCosAlong(view, lat, lon, right === eastIsRight ? farKm : -farKm),
    );
    const onDisc =
      view.discCentrePx === null ||
      rectRoomInCircle(rect, view.discCentrePx, view.discRadiusPx) >= DISC_MARGIN_PX;
    if (onDisc && sunFar > sunLo) {
      const alpha = shown * smoothstep(sunLo, sunHi, sunFar);
      const slackPx = Math.max(0, diameterPx / 2 - box.height / 2);
      return { xPx, yPx: centre[1], alignX: right ? 'left' : 'right', px, alpha, slackPx };
    }
  }
  return null;
}
