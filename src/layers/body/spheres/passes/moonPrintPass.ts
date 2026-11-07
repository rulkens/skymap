/**
 * moonPrintPass: the antique look's engraving inputs for the Moon (`fsMoonPrint`: the
 * maria's albedo, the relief ratio, crater rims and wall bands), drawn into the look's
 * `antique-relief` row on the Moon's `surfaceMask` line. The rings are picked here
 * each frame (`pickMoonCraters`) from the baked table, the named ones first. Listed in `ANTIQUE_ONLY_PASSES`,
 * so it never draws with the look off.
 */

import type { ContentPass } from '../../../../@types/engine/frame/ContentPass';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { ANTIQUE_MOON_CRATERS } from '../../../../data/rendering/antiqueMoonCraters.generated';
import { ANTIQUE_REFERENCE_HEIGHT_CSS } from '../../../../data/rendering/antiqueLook';
import { ANTIQUE_MOON_PLACES } from '../../../../data/labels/antiqueMoonPlaces';
import { SCENE_CELESTIAL_BODIES } from '../../../../data/bodies/sceneCelestialBodies';
import { composeBodySlabMvp } from '../../../../utils/camera/bodyCompose/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../../utils/camera/bodyCompose/bodySlabCamLocal';
import { innerBoundRadiusM } from '../../../../utils/occlusion/innerBoundRadiusM';
import {
  ANTIQUE_MOON_HOST,
  ANTIQUE_MOON_PRINT_BYTES,
  ANTIQUE_MOON_RIM_SCALE,
  ANTIQUE_MOON_TABLE_RADIUS_KM,
} from '../data/antiqueMoonPrint';
import { moonCraterTable } from '../present/moonCraterTable';
import { namedMoonCraters } from '../present/namedMoonCraters';
import { pickMoonCraters } from '../present/pickMoonCraters';
import { texturedBodyUniforms } from '../present/texturedBodyUniforms';
import { packMoonPrint } from '../render/packMoonPrint';

export function moonPrintPass(runtime: BodyRuntime): ContentPass {
  // Arcs on a sphere 1/scale as big: the rings drawn at the rim the plain shows.
  const table = moonCraterTable(
    ANTIQUE_MOON_CRATERS,
    ANTIQUE_MOON_TABLE_RADIUS_KM / ANTIQUE_MOON_RIM_SCALE,
  );
  const named = namedMoonCraters(table, ANTIQUE_MOON_PLACES, ANTIQUE_MOON_TABLE_RADIUS_KM);
  const namedRows = new Set(named.map((n) => n.index));
  const radiusM = innerBoundRadiusM(
    SCENE_CELESTIAL_BODIES.find((b) => b.id === ANTIQUE_MOON_HOST)!.surface,
  );
  const bytes = new ArrayBuffer(ANTIQUE_MOON_PRINT_BYTES);
  return {
    name: 'moon-print',

    enabled(_state, _ctx, view) {
      return view.slab.frame.kind === 'body-m' && view.slab.frame.hostId === ANTIQUE_MOON_HOST;
    },

    draw(pass, view, ctx, state) {
      if (view.slab.frame.kind !== 'body-m') return;
      const record = texturedBodyUniforms(state, ctx, view, runtime);
      const pose = ctx.bodyPose(view.slab.frame.hostId);
      if (record === null || pose === null) return;
      const unitPx = ctx.canvasSize.height / ANTIQUE_REFERENCE_HEIGHT_CSS;
      const picked = pickMoonCraters(
        table,
        {
          eye: bodySlabCamLocal(pose.eyeRelBodyM, radiusM),
          mvp: composeBodySlabMvp(view.slab.vp, pose.eyeRelBodyM, radiusM),
          widthPx: ctx.canvasSize.width,
          heightPx: ctx.canvasSize.height,
          pxPerRad: ctx.drawPxPerRad,
          unitPx,
        },
        named,
      );
      packMoonPrint(table, picked, unitPx, ctx.drawPxPerRad, bytes, namedRows);
      runtime.texturedBodyRenderer.drawMoonPrint(pass, record.bodyId, record.uniforms, bytes);
    },
  };
}
