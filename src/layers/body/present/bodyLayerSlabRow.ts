/**
 * bodyLayerSlabRow — the slab row the body Layer declares for one of its
 * bodies: drawn out to its outermost shell (`bodyDrawRadiusM`), and, for an
 * atmosphere body, hosting the `insideAtmosphere` line inside its
 * `atmosphereInsideBand`, the one rule the shell's `inside` reads too.
 */

import type { SlabRow } from '../../../@types/engine/frame/SlabRow';
import type { SceneBody } from '../../../@types/scene/SceneBody';
import { bodyFootprintRadiusM } from '../../../utils/scene/bodyFootprintRadiusM';
import { atmosphereInsideBand } from './atmosphereInsideBand';
import { bodyDrawRadiusM } from './bodyDrawRadiusM';

export function bodyLayerSlabRow(body: SceneBody): SlabRow {
  const drawRadiusM = bodyDrawRadiusM(body);
  const band = atmosphereInsideBand(body.id);
  return {
    anchorId: body.id,
    drawRadiusM: () => drawRadiusM,
    footprintRadiusM: bodyFootprintRadiusM(body),
    ...(band === undefined ? {} : { hosts: [{ line: 'insideAtmosphere', band }] }),
  };
}
