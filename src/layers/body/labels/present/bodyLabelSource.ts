/**
 * bodyLabelSource — name captions for Earth, the planets, their moons and small bodies (craft
 * caption through the missions Layer; stars, the Sun and the Galactic Centre through theirs).
 * Tints come from the body records (planet `albedo`, a fixed Earth blue), so no colour table
 * drifts from the seeds. A click on a name picks what a click on its body does.
 */

import { hexToGl } from '../../../../utils/color/hexToGl';
import type { BodyRuntime } from '../../@types/BodyRuntime';
import { labelSource } from '../../../../utils/labels/labelSource';
import { NEAR0 } from '../../../../services/engine/frame/slabs';
import { footprintRadiusMpc } from '../../../../utils/selection/footprintRadiusMpc';
import { SCENE_EARTH } from '../../../../data/bodies/sceneEarth';
import { SCENE_PLANETS } from '../../../../data/bodies/scenePlanets';
import { compressBrightness } from '../../../../utils/color/compressBrightness';
import { bodyFootprintRadiusM } from '../../../../utils/scene/bodyFootprintRadiusM';
import { sceneBodyPick } from '../../../../utils/picking/sceneBodyPick';
import { BODY_CAPTION_ROWS } from '../data/bodyCaptionRows';
import { bodyCodeOf } from '../../selection/present/bodyCodeOf';

// `EarthBody` carries a texture rather than a colour, so this is the one authored tint.
const EARTH_TINT = hexToGl('#80B8FF');

/**
 * A raw albedo makes a dark body's caption dark text on a black sky (Mercury and the Moon peak
 * near 0.3). This exponent lifts them to ~0.7 while keeping them dimmer than Venus or
 * Enceladus, so the captions still rank by albedo.
 */
const PLANET_TINT_GAMMA = 0.3;

const CAPTIONED = [
  { body: SCENE_EARTH, tint: EARTH_TINT, row: BODY_CAPTION_ROWS.earth },
  ...SCENE_PLANETS.map((planet) => ({
    body: planet,
    tint: compressBrightness(planet.albedo, PLANET_TINT_GAMMA),
    row: BODY_CAPTION_ROWS[planet.captionKind],
  })),
];

export function bodyLabelSource(runtime: Pick<BodyRuntime, 'pickCodes'>) {
  const codeOf = bodyCodeOf(runtime.pickCodes);
  return labelSource({
    slab: NEAR0,
    toggle: 'body',
    style: 'caption',
    items: () => CAPTIONED,
    describe: ({ body, tint, row }) => ({
      text: body.label,
      position: { anchorId: body.id },
      subjectRadiusMpc: footprintRadiusMpc({ footprintRadiusM: bodyFootprintRadiusM(body) }),
      color: [tint[0], tint[1], tint[2], 1],
      priority: row.priority,
      pick: sceneBodyPick(body.id, codeOf) ?? undefined,
      fadeKey: row.item,
    }),
  });
}
