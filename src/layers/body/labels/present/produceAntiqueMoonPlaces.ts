/**
 * produceAntiqueMoonPlaces — the antique look's Moon names (`ANTIQUE_MOON_PLACES`):
 * maria and Terrae fitted across what they name (`placeAntiqueAreaName`), then craters
 * beside their rims, sized by their print weight (`placeAntiqueCraterName`), each name
 * stepping off the outranking names placed before it (`verticalClearance`), all faded in
 * with the disc (`ANTIQUE_MOON_PLACE_REVEAL.discPx`). The producer owns each name's px and
 * side, which `antiqueLabel` keeps; the director declutters by band (seas first), then
 * `rank`. With the look off it returns before any work. A name carries the Moon as
 * subject, so it recedes with it.
 */

import type { Label2D } from '../../../../@types/rendering/Label2D';
import type { AntiqueMoonPlace } from '../../../../@types/rendering/AntiqueMoonPlace';
import type { LayerScreenLabel } from '../../../../@types/engine/layer/LayerScreenLabel';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { ANTIQUE_MOON_LABEL_PLACES as ANTIQUE_MOON_PLACES } from '../../../../data/labels/antiqueMoonLabelPlaces';
import { ANTIQUE_MOON_PLACE_REVEAL } from '../../../../data/labels/antiqueMoonPlaceReveal';
import { ANTIQUE_PLACE_LETTERING } from '../../../../data/labels/antiquePlaceLettering';
import { CAPTION_PRIORITY_SCALE } from '../../../../data/labels/captionPriorityScale';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { SCENE_CELESTIAL_BODIES } from '../../../../data/bodies/sceneCelestialBodies';
import { BODY_CAPTION_ROWS } from '../data/bodyCaptionRows';
import { bodyCodeOf } from '../../selection/present/bodyCodeOf';
import { antiqueLookOn } from '../../../../utils/render/antiqueLookOn';
import { sceneBodyStates } from '../../../../services/engine/frame/sceneBodyStates';
import { bodyApparentDiameterPx } from '../../../../utils/scene/bodyApparentDiameterPx';
import { sceneBodyPickId } from '../../../../utils/picking/sceneBodyPickId';
import { findByIdOrThrow } from '../../../../utils/object/findByIdOrThrow';
import { normalize3 } from '../../../../utils/math/normalize3';
import { smoothstep } from '../../../../utils/math/smoothstep';
import { ANTIQUE_MOON_CRATER_WEIGHTS } from '../../spheres/data/antiqueMoonCraterWeights';
import { antiqueBodyView } from './antiqueBodyView';
import { placeAntiqueAreaName } from '../utils/placeAntiqueAreaName';
import { placeAntiqueCraterName } from '../utils/placeAntiqueCraterName';
import { antiqueNameBoxPx } from '../utils/antiqueNameBoxPx';
import { verticalClearance } from '../utils/verticalClearance';
import { rectRoomInCircle } from '../../../../utils/math/rectRoomInCircle';
import type { ScreenRectPx } from '../../../../@types/rendering/ScreenRectPx';

const NONE = { labels: [], awake: false } as const;
// Above every rank, so rank 1 carries the highest priority within its band. The bands, a
// ceiling apart: Riccioli's plate prints every sea first, then the craters a reader looks
// for first, then the bays, lakes, marshes and Terrae, then every other crater.
const RANK_CEILING = 1000;
const HEADLINE_CRATERS: ReadonlySet<string> = new Set(
  [
    'tycho',
    'copernicus',
    'plato',
    'aristarchus',
    'kepler',
    'ptolemaeus',
    'grimaldi',
    'posidonius',
    'aristoteles',
    'petavius',
    'langrenus',
  ].map((n) => `moonPlace-${n}`),
);
const SEA = /^(Mare|Oceanus)\b/;
const SEA_BAND = 3;
const bandOf = (place: AntiqueMoonPlace): number =>
  place.kind === 'crater'
    ? HEADLINE_CRATERS.has(place.id)
      ? 2
      : 0
    : SEA.test(place.name)
      ? SEA_BAND
      : 1;
// The director's antique pad (`ANTIQUE_LABEL_DECLUTTER`, 8) and a margin for the set
// glyphs over `antiqueNameBoxPx`'s estimate.
const SEA_PAD_PX = 16;
// A placement's fade (its reveal, facing and light ramps) sharpened to a cut.
const NAME_CUT = [0.45, 0.55] as const;
// placeAntiqueAreaName's limb clearance.
const SEA_LIMB_CLEAR_PX = 4;

// Areas, then craters, so a crater's name knows every area name it must step off.
const AREAS_FIRST = ANTIQUE_MOON_PLACES.map((_, i) => i).sort(
  (a, b) =>
    Number(ANTIQUE_MOON_PLACES[a]!.kind === 'crater') -
    Number(ANTIQUE_MOON_PLACES[b]!.kind === 'crater'),
);

export function produceAntiqueMoonPlaces(
  pickCodes: BodyRuntime['pickCodes'],
): LayerScreenLabel<'body'>['produceLabels'] {
  const codeOf = bodyCodeOf(pickCodes);
  const { priority, item } = BODY_CAPTION_ROWS.moonPlace;
  const { discPx, lineEm } = ANTIQUE_MOON_PLACE_REVEAL;
  const moonId = 'moon';
  const radiusM = findByIdOrThrow(SCENE_CELESTIAL_BODIES, moonId, 'produceAntiqueMoonPlaces')
    .surface.datumRadiusM;
  const radiusMpc = radiusM * SCALE_UNITS.M_TO_MPC;
  const letterings = ANTIQUE_MOON_PLACES.map((place) => ANTIQUE_PLACE_LETTERING[place.id]!);

  return (state, ctx, fade) => {
    if (!antiqueLookOn(state)) return NONE;
    const bodies = sceneBodyStates(state, ctx);
    const moon = bodies.get(moonId);
    if (!moon) return NONE;
    const diameterPx = bodyApparentDiameterPx({
      positionMpc: moon.positionMpc,
      radiusM,
      camPosMpc: ctx.drawCamPos,
      pxPerRad: ctx.drawPxPerRad,
    });
    if (diameterPx < discPx[0]) return NONE;
    const discAlpha = smoothstep(discPx[0], discPx[1], diameterPx) * fade[item];
    if (discAlpha <= 0) return NONE;

    const m = moon.positionMpc;
    const s = bodies.get('sun')!.positionMpc;
    const toSun = normalize3([s[0] - m[0], s[1] - m[1], s[2] - m[2]]);
    const view = antiqueBodyView(moon, radiusM, toSun, ctx);
    const subjectId = sceneBodyPickId(moonId, codeOf) ?? undefined;
    const labels: Label2D[] = [];
    // The area names placed so far, in rank order: a later area name steps off them, a
    // crater's off the seas' alone (it outranks a bay or Terra).
    const areas: ScreenRectPx[] = [];
    const seas: ScreenRectPx[] = [];
    const inDisc = (r: ScreenRectPx): boolean =>
      view.discCentrePx === null ||
      rectRoomInCircle(r, view.discCentrePx, view.discRadiusPx) >= SEA_LIMB_CLEAR_PX;
    AREAS_FIRST.forEach((i) => {
      const place = ANTIQUE_MOON_PLACES[i]!;
      const lettering = letterings[i]!;
      const at =
        place.kind === 'crater'
          ? placeAntiqueCraterName(place, view, lettering, ANTIQUE_MOON_CRATER_WEIGHTS[place.id])
          : placeAntiqueAreaName(place, view, lettering);
      if (!at) return;
      let yPx = at.yPx;
      if (at.alpha > 0) {
        const { cut, trackingEm = 0 } = lettering;
        const box = antiqueNameBoxPx(place.name, cut, trackingEm, at.px, lineEm);
        const x0 =
          at.alignX === 'left'
            ? at.xPx
            : at.alignX === 'right'
              ? at.xPx - box.width
              : at.xPx - box.width / 2;
        const rect = { x0, y0: yPx - box.height / 2, x1: x0 + box.width, y1: yPx + box.height / 2 };
        const kept = place.kind === 'crater' ? seas : areas;
        const dy = verticalClearance(rect, at.slackPx ?? 0, kept, SEA_PAD_PX, inDisc) ?? 0;
        yPx += dy;
        const moved = { ...rect, y0: rect.y0 + dy, y1: rect.y1 + dy };
        if (place.kind !== 'crater') areas.push(moved);
        if (bandOf(place) === SEA_BAND) seas.push(moved);
      }
      labels.push({
        id: place.id,
        text: place.name,
        worldPos: view.anchorMpc(at.xPx, yPx, place.latDeg, place.lonDeg),
        font: 'cormorant',
        pixelSize: 0,
        worldEmMpc: radiusMpc,
        minPixelSize: at.px,
        maxPixelSize: at.px,
        alignX: at.alignX,
        alignY: 'center',
        // A name prints or it does not: a ghost-grey half fade reads as a smudge.
        fadeAlpha: discAlpha * smoothstep(NAME_CUT[0], NAME_CUT[1], at.alpha),
        // Engraved over the disc it names; the placement already keeps it on the lit side.
        occludeWeight: 0,
        declutterPriority:
          priority * CAPTION_PRIORITY_SCALE + (bandOf(place) + 1) * RANK_CEILING - place.rank,
        subjectId,
      });
    });
    return { labels, awake: false };
  };
}
