/**
 * bodySlabRowOf — the `SlabRow` core derives for a hostless mesh body, the
 * one store body no Layer declares a row for. A craft carries no atmosphere,
 * cloud envelope or ring, so its drawn extent is its footprint.
 *
 * No hosted line: a body draws itself. It yields at the same foreground band
 * as the body Layer's rows, so past it no `body-m` slab exists at all.
 */

import type { SceneBody } from '../../@types/scene/SceneBody';
import type { SlabRow } from '../../@types/engine/frame/SlabRow';
import { FOREGROUND_RECEDE_FADE_BAND } from '../../data/bands/foregroundRecedeFadeBand';
import { bodyFootprintRadiusM } from './bodyFootprintRadiusM';

export function bodySlabRowOf(body: SceneBody): SlabRow {
  const footprintRadiusM = bodyFootprintRadiusM(body);
  return {
    anchorId: body.id,
    drawRadiusM: () => footprintRadiusM,
    footprintRadiusM,
    activeBand: FOREGROUND_RECEDE_FADE_BAND,
  };
}
