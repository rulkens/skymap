/**
 * produceAntiqueMoonPlaces — the antique look's Moon names (`ANTIQUE_MOON_PLACES`):
 * maria and Terrae fitted across what they name (`placeAntiqueAreaName`), craters on
 * their floors or beside their rims (`placeAntiqueCraterName`), all faded in with the
 * disc (`ANTIQUE_MOON_PLACE_REVEAL.discPx`). The producer owns each name's px and side,
 * which `antiqueLabel` keeps; the director declutters by `rank`. With the look off it
 * returns before any work. A name carries the Moon as subject, so it recedes with it.
 */

import type { Label2D } from '../../../../@types/rendering/Label2D';
import type { LayerScreenLabel } from '../../../../@types/engine/layer/LayerScreenLabel';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { ANTIQUE_MOON_PLACES } from '../../../../data/labels/antiqueMoonPlaces';
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
import { antiqueBodyView } from './antiqueBodyView';
import { placeAntiqueAreaName } from '../utils/placeAntiqueAreaName';
import { placeAntiqueCraterName } from '../utils/placeAntiqueCraterName';

const NONE = { labels: [], awake: false } as const;
// Above every rank, so rank 1 carries the highest priority within the row.
const RANK_CEILING = 1000;

export function produceAntiqueMoonPlaces(
  pickCodes: BodyRuntime['pickCodes'],
): LayerScreenLabel<'body'>['produceLabels'] {
  const codeOf = bodyCodeOf(pickCodes);
  const { priority, item } = BODY_CAPTION_ROWS.moonPlace;
  const { discPx } = ANTIQUE_MOON_PLACE_REVEAL;
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
    ANTIQUE_MOON_PLACES.forEach((place, i) => {
      const lettering = letterings[i]!;
      const at =
        place.kind === 'crater'
          ? placeAntiqueCraterName(place, view, lettering)
          : placeAntiqueAreaName(place, view, lettering);
      if (!at) return;
      labels.push({
        id: place.id,
        text: place.name,
        worldPos: view.anchorMpc(at.xPx, at.yPx, place.latDeg, place.lonDeg),
        font: 'cormorant',
        pixelSize: 0,
        worldEmMpc: radiusMpc,
        minPixelSize: at.px,
        maxPixelSize: at.px,
        alignX: at.alignX,
        alignY: 'center',
        fadeAlpha: discAlpha * at.alpha,
        // Engraved over the disc it names; the placement already keeps it on the lit side.
        occludeWeight: 0,
        declutterPriority: priority * CAPTION_PRIORITY_SCALE + RANK_CEILING - place.rank,
        subjectId,
      });
    });
    return { labels, awake: false };
  };
}
