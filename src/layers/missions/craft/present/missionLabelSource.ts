/**
 * missionLabelSource — one caption per craft, all switched by the one `craft` item; a craft not
 * in the scene this frame (before launch, or a sampled craft before its track) gets none. Only
 * the sampled craft dim when the visitor emphasises the other one (a Voyager-exhibit idea), and
 * the dim pops with the setting, as it did. A click on a name picks what a click on the mesh does.
 */

import type { MeshBody } from '../../../../@types/scene/MeshBody';
import { labelSource } from '../../../../utils/labels/labelSource';
import { NEAR0 } from '../../../../services/engine/frame/slabs';
import { SCALE_UNITS } from '../../../../data/scaleUnits';
import { isMeshBody } from '../../../../utils/meshBodies/isMeshBody';
import { scaleToUnitMax } from '../../../../utils/color/scaleToUnitMax';
import { bodyFootprintRadiusM } from '../../../../utils/scene/bodyFootprintRadiusM';
import { footprintRadiusMpc } from '../../../../utils/selection/footprintRadiusMpc';
import { MISSIONS_BODY_ROWS } from '../../bodies/missionsBodyRows';
import { CRAFT_ENTRY } from '../../sources/craft';
import { emphasisDim } from '../utils/emphasisDim';
import { MESH_BODY_CAPTION_PRIORITY } from '../data/meshBodyCaptionPriority';
import { CRAFT_ORDER } from './craftOrder';

const CRAFT = MISSIONS_BODY_ROWS.flatMap((row) =>
  isMeshBody(row.body) ? [{ body: row.body, sampled: row.position.kind === 'sampled' }] : [],
);

/** The seed's reveal distance is alpha 1 at it and 0 at twice it, so a seed tune stays one number. */
function revealBandOf(body: MeshBody) {
  if (body.captionRevealM === undefined) return undefined;
  const fullAt = body.captionRevealM * SCALE_UNITS.M_TO_MPC;
  return { fullAt, goneAt: 2 * fullAt };
}

export function missionLabelSource(pickCode: number) {
  return labelSource({
    slab: NEAR0,
    toggle: 'missions',
    style: 'caption',
    changes: (state) => state.settings.missions.craft,
    items: (state) =>
      CRAFT.map(({ body, sampled }) => ({
        body,
        dim: sampled ? emphasisDim(state.settings.missions.craft, body.id) : 1,
      })),
    describe: ({ body, dim }) => {
      // A baked albedo is a whole-surface mean far below a planet's, so the caption keeps its hue
      // at full brightness rather than its darkness.
      const [r, g, b] = scaleToUnitMax(body.albedo);
      return {
        text: body.label,
        position: { anchorId: body.id },
        subjectRadiusMpc: footprintRadiusMpc({ footprintRadiusM: bodyFootprintRadiusM(body) }),
        color: [r, g, b, dim],
        priority: MESH_BODY_CAPTION_PRIORITY,
        pick: { code: pickCode, index: CRAFT_ORDER.indexOf(body.id) },
        fadeKey: CRAFT_ENTRY.id,
        revealBand: revealBandOf(body),
      };
    },
  });
}
