/**
 * bodySlabRowOf — the `SlabRow` a store-fed scene body contributes. The
 * adapter that keeps Earth, the planets and the hostless mesh bodies
 * per-frame rows while authored rows (`Layer.slabs`) join the same list.
 *
 * No band: a body draws itself, so the roster culls in `visibleSlabBodies`
 * are the whole gate.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import type { SceneBody } from '../../@types/scene/SceneBody';
import type { SlabRow } from '../../@types/engine/frame/SlabRow';
import { bodyDrawRadiusM } from './bodyDrawRadiusM';
import { bodyFootprintRadiusM } from './bodyFootprintRadiusM';

export function bodySlabRowOf(body: SceneBody): SlabRow {
  return {
    anchorId: body.id as BodyId,
    drawRadiusM: (distM, pxPerRad) => bodyDrawRadiusM(body, distM, pxPerRad),
    footprintRadiusM: bodyFootprintRadiusM(body),
    source: 'foreground',
  };
}
