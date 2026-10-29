/**
 * bodySlabRowOf — the `SlabRow` core derives for a hostless mesh body, the
 * one store body no Layer declares a row for. A craft carries no atmosphere,
 * cloud envelope or ring, so its drawn extent is its footprint.
 *
 * No band and no hosted line: a body draws itself, so the roster culls in
 * `visibleSlabBodies` are the whole gate.
 */

import type { SceneBody } from '../../@types/scene/SceneBody';
import type { SlabRow } from '../../@types/engine/frame/SlabRow';
import { bodyFootprintRadiusM } from './bodyFootprintRadiusM';

export function bodySlabRowOf(body: SceneBody): SlabRow {
  const footprintRadiusM = bodyFootprintRadiusM(body);
  return {
    anchorId: body.id,
    drawRadiusM: () => footprintRadiusM,
    footprintRadiusM,
  };
}
