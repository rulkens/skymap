/**
 * produceAntiqueEarthPlaces — the antique look's land and sea names on Earth's
 * globe (`ANTIQUE_EARTH_PLACES`), anchored on the ground and faded in by
 * `ANTIQUE_EARTH_PLACE_REVEAL`: a large enough globe, room for the name inside the
 * rim, and daylight or twilight. With the look off it returns before any work. Each
 * candidate emits at its fade target so a name eases out; `antiqueLabel` sets the
 * type. A name carries Earth as subject, so it recedes only when Earth does.
 */

import type { Label2D } from '../../../../@types/rendering/Label2D';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { LayerScreenLabel } from '../../../../@types/engine/layer/LayerScreenLabel';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { ANTIQUE_EARTH_PLACES } from '../../../../data/labels/antiqueEarthPlaces';
import { ANTIQUE_EARTH_PLACE_REVEAL } from '../../../../data/labels/antiqueEarthPlaceReveal';
import { ANTIQUE_AREA_LETTERING } from '../../../../data/labels/antiqueAreaLettering';
import { ANTIQUE_LABEL_STYLE } from '../../../../data/labels/antiqueLabelStyle';
import { CAPTION_PRIORITY_SCALE } from '../../../../data/labels/captionPriorityScale';
import { SCENE_EARTH } from '../../../../data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { BODY_CAPTION_ROWS } from '../data/bodyCaptionRows';
import { ANTIQUE_REFERENCE_HEIGHT_CSS } from '../../../../data/rendering/antiqueLook';
import { antiqueMapDetail } from '../../../../utils/gpu/antiqueLook/antiqueMapDetail';
import { bodyCodeOf } from '../../selection/present/bodyCodeOf';
import { antiqueLookOn } from '../../../../utils/render/antiqueLookOn';
import { sceneBodyStates } from '../../../../services/engine/frame/sceneBodyStates';
import { bodyApparentDiameterPx } from '../../../../utils/scene/bodyApparentDiameterPx';
import { sceneBodyPickId } from '../../../../utils/picking/sceneBodyPickId';
import { surfacePointBodyFixed } from '../../../../utils/geo/surfacePointBodyFixed';
import { rotateVec3ByTightMat3 } from '../../../../utils/math/rotateVec3ByTightMat3';
import { normalize3 } from '../../../../utils/math/normalize3';
import { dot3 } from '../../../../utils/math/dot3';
import { smoothstep } from '../../../../utils/math/smoothstep';
import { antiqueNameBoxPx } from '../utils/antiqueNameBoxPx';

const NONE = { labels: [], awake: false } as const;

export function produceAntiqueEarthPlaces(
  pickCodes: BodyRuntime['pickCodes'],
): LayerScreenLabel<'body'>['produceLabels'] {
  const codeOf = bodyCodeOf(pickCodes);
  const { priority, item } = BODY_CAPTION_ROWS.earthPlace;
  const { globePx, fitPx, sunCos, detailOut, lineEm } = ANTIQUE_EARTH_PLACE_REVEAL;
  const radiusM = SCENE_EARTH.surface.datumRadiusM;
  const radiusMpc = radiusM * SCALE_UNITS.M_TO_MPC;
  // Half the larger side of each name's box as `antiqueLabel` sets it, px: what must stay inside the rim.
  const halfBoxPx = ANTIQUE_EARTH_PLACES.map((place) => {
    const cut = ANTIQUE_AREA_LETTERING[place.id]!;
    const { trackingEm } = ANTIQUE_LABEL_STYLE[cut];
    const box = antiqueNameBoxPx(place.name, cut, trackingEm, ANTIQUE_LABEL_STYLE.areaPx, lineEm);
    return Math.max(box.width, box.height) / 2;
  });

  return (state, ctx, fade) => {
    if (!antiqueLookOn(state)) return NONE;
    const bodies = sceneBodyStates(state, ctx);
    const earth = bodies.get(SCENE_EARTH.id)!;
    const cam = ctx.drawCamPos;
    const diameterPx = bodyApparentDiameterPx({
      positionMpc: earth.positionMpc,
      radiusM,
      camPosMpc: cam,
      // CSS px, the unit `globePx` and the names' boxes are in.
      pxPerRad: ctx.drawPxPerRad / ctx.snapshot.devicePixelRatio,
    });
    if (diameterPx < globePx[0]) return NONE;

    const e = earth.positionMpc;
    const s = bodies.get('sun')!.positionMpc;
    const toSun = normalize3([s[0] - e[0], s[1] - e[1], s[2] - e[2]]);
    const altitudeKm =
      (Math.hypot(e[0] - cam[0], e[1] - cam[1], e[2] - cam[2]) * SCALE_UNITS.MPC_TO_M - radiusM) /
      1000;
    const unitsPerRad = ctx.drawPxPerRad / (ctx.canvasSize.height / ANTIQUE_REFERENCE_HEIGHT_CSS);
    const detail = antiqueMapDetail(unitsPerRad, altitudeKm);
    const globeAlpha =
      smoothstep(globePx[0], globePx[1], diameterPx) *
      (1 - smoothstep(detailOut[0], detailOut[1], detail)) *
      fade[item];
    if (globeAlpha <= 0) return NONE;
    const rimPx = diameterPx / 2;
    const subjectId = sceneBodyPickId(SCENE_EARTH.id, codeOf) ?? undefined;

    const labels = ANTIQUE_EARTH_PLACES.map((place, i): Label2D => {
      const up = rotateVec3ByTightMat3(
        earth.orientation,
        surfacePointBodyFixed(place.latDeg, place.lonDeg, 1),
      );
      // Camera-relative, as `composeForegroundCaption` hands every NEAR0 caption.
      const anchor: Vec3 = [
        e[0] + up[0] * radiusMpc - cam[0],
        e[1] + up[1] * radiusMpc - cam[1],
        e[2] + up[2] * radiusMpc - cam[2],
      ];
      // The anchor sits about rim · sin(angle off the eye's line) from the disc's centre.
      const facing = -dot3(up, normalize3(anchor));
      const roomPx = rimPx * (1 - Math.sqrt(Math.max(0, 1 - facing * facing))) - halfBoxPx[i]!;
      return {
        id: place.id,
        text: place.name,
        worldPos: anchor,
        font: 'cormorant',
        pixelSize: 0,
        worldEmMpc: radiusMpc,
        alignX: 'center',
        alignY: 'center',
        fadeAlpha:
          globeAlpha *
          (facing > 0 ? smoothstep(fitPx[0], fitPx[1], roomPx) : 0) *
          smoothstep(sunCos[0], sunCos[1], dot3(up, toSun)),
        // Painted over the globe it names; the fit fade already hides the far side.
        occludeWeight: 0,
        // A land outranks a sea that crowds it.
        declutterPriority: priority * CAPTION_PRIORITY_SCALE + (place.kind === 'land' ? 1 : 0),
        subjectId,
      };
    });
    return { labels, awake: false };
  };
}
