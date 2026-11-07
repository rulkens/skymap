/**
 * produceAntiqueEarthTowns — the antique look's town names (`ANTIQUE_EARTH_TOWNS`),
 * each set to the right of its sign, just above the sign's foot, arriving with it
 * (`antiqueMapDetail` against the tier's level, as `sign.wesl` reveals the sign).
 * A renamed world city carries its modern name beneath, in brackets (`gloss`). Facing the
 * eye and in daylight or twilight only. With the look off it returns before any
 * work. The cut and size come from `ANTIQUE_PLACE_LETTERING`.
 */

import type { Label2D } from '../../../../@types/rendering/Label2D';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { LayerScreenLabel } from '../../../../@types/engine/layer/LayerScreenLabel';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { ANTIQUE_EARTH_TOWNS } from '../../../../data/labels/antiqueEarthTowns';
import { ANTIQUE_EARTH_PLACE_REVEAL } from '../../../../data/labels/antiqueEarthPlaceReveal';
import { ANTIQUE_REFERENCE_HEIGHT_CSS } from '../../../../data/rendering/antiqueLook';
import { CAPTION_PRIORITY_SCALE } from '../../../../data/labels/captionPriorityScale';
import { SCENE_EARTH } from '../../../../data/bodies/sceneEarth';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { BODY_CAPTION_ROWS } from '../data/bodyCaptionRows';
import { ANTIQUE_TOWN_REVEAL } from '../../earth/antiqueMap/data/antiqueTownReveal';
import { antiqueMapDetail } from '../../../../utils/gpu/antiqueLook/antiqueMapDetail';
import { bodyCodeOf } from '../../selection/present/bodyCodeOf';
import { antiqueLookOn } from '../../../../utils/render/antiqueLookOn';
import { sceneBodyStates } from '../../../../services/engine/frame/sceneBodyStates';
import { sceneBodyPickId } from '../../../../utils/picking/sceneBodyPickId';
import { surfacePointBodyFixed } from '../../../../utils/geo/surfacePointBodyFixed';
import { rotateVec3ByTightMat3 } from '../../../../utils/math/rotateVec3ByTightMat3';
import { normalize3 } from '../../../../utils/math/normalize3';
import { dot3 } from '../../../../utils/math/dot3';
import { smoothstep } from '../../../../utils/math/smoothstep';

const NONE = { labels: [], awake: false } as const;
// A name starts this many spaces right of its anchor, clear of its tier's sign.
const SIGN_GAP = ['     ', '    ', '   ', '   '] as const;

export function produceAntiqueEarthTowns(
  pickCodes: BodyRuntime['pickCodes'],
): LayerScreenLabel<'body'>['produceLabels'] {
  const codeOf = bodyCodeOf(pickCodes);
  const { priority, item } = BODY_CAPTION_ROWS.earthPlace;
  const { sunCos } = ANTIQUE_EARTH_PLACE_REVEAL;
  const radiusM = SCENE_EARTH.surface.datumRadiusM;
  const radiusMpc = radiusM * SCALE_UNITS.M_TO_MPC;
  const ups = ANTIQUE_EARTH_TOWNS.map((town) => surfacePointBodyFixed(town.latDeg, town.lonDeg, 1));

  return (state, ctx, fade) => {
    if (!antiqueLookOn(state)) return NONE;
    const bodies = sceneBodyStates(state, ctx);
    const earth = bodies.get(SCENE_EARTH.id)!;
    const e = earth.positionMpc;
    const cam = ctx.drawCamPos;
    const altitudeKm =
      (Math.hypot(e[0] - cam[0], e[1] - cam[1], e[2] - cam[2]) * SCALE_UNITS.MPC_TO_M - radiusM) /
      1000;
    const unitPx = ctx.canvasSize.height / ANTIQUE_REFERENCE_HEIGHT_CSS;
    const detail = antiqueMapDetail(ctx.drawPxPerRad / unitPx, altitudeKm);
    if (detail <= ANTIQUE_TOWN_REVEAL.tierLevel[0]) return NONE;

    const s = bodies.get('sun')!.positionMpc;
    const toSun = normalize3([s[0] - e[0], s[1] - e[1], s[2] - e[2]]);
    const subjectId = sceneBodyPickId(SCENE_EARTH.id, codeOf) ?? undefined;
    const labels: Label2D[] = [];
    ANTIQUE_EARTH_TOWNS.forEach((town, i) => {
      const arrive = Math.min(1, detail - ANTIQUE_TOWN_REVEAL.tierLevel[town.tier]);
      if (arrive <= 0) return;
      const up = rotateVec3ByTightMat3(earth.orientation, ups[i]!);
      // Camera-relative, as `composeForegroundCaption` hands every NEAR0 caption.
      const anchor: Vec3 = [
        e[0] + up[0] * radiusMpc - cam[0],
        e[1] + up[1] * radiusMpc - cam[1],
        e[2] + up[2] * radiusMpc - cam[2],
      ];
      const facing = -dot3(up, normalize3(anchor));
      const fadeAlpha =
        arrive *
        fade[item] *
        smoothstep(0.05, 0.2, facing) *
        smoothstep(sunCos[0], sunCos[1], dot3(up, toSun));
      if (fadeAlpha <= 0) return;
      const declutterPriority =
        priority * CAPTION_PRIORITY_SCALE +
        (3 - town.tier) * 10 +
        (4 - town.popClass) * 2 +
        (town.home ? 1 : 0);
      const base = {
        worldPos: anchor,
        font: 'cormorant',
        pixelSize: 0,
        worldEmMpc: radiusMpc,
        alignX: 'left',
        fadeAlpha,
        // Printed on the globe it names; the facing fade hides the far side.
        occludeWeight: 0,
        subjectId,
      } as const;
      // A gloss shares the name's label: as a label of its own its rect would touch
      // the name's inside the declutter pad, and the name would cut it.
      const gap = SIGN_GAP[town.tier];
      const gloss = town.gloss === undefined ? '' : `\n${gap}(${town.gloss})`;
      labels.push({
        ...base,
        id: town.id,
        text: gap + town.name + gloss,
        alignY: 'bottom',
        declutterPriority,
      });
    });
    return { labels, awake: false };
  };
}
