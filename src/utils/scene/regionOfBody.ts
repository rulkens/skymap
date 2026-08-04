/**
 * regionOfBody — the scale regime a scene body sits in: the palette category
 * chip's lookup, and the anchor a near-field band keys its distance against.
 *
 * `null` rather than a throw, because a body seeded without a region should
 * show no chip rather than break the palette. `BODY_REGIONS` membership is
 * total over `SCENE_BODIES`, so nothing takes that branch today.
 */

import { BODY_REGIONS } from '../../data/bodies/bodyRegions';
import type { BodyRegion } from '../../@types/scene/BodyRegion';

export function regionOfBody(bodyId: string): BodyRegion | null {
  return BODY_REGIONS.find((region) => region.memberIds.includes(bodyId)) ?? null;
}
