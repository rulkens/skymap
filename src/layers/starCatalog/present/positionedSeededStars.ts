/**
 * positionedSeededStars — the seeded stars among some of the frame's sorted scene bodies,
 * found by their own seed refs, each as the `PositionedStar` the point renderer and the
 * pick ids read. The record comes from its seed table, so it is typed without a cast.
 */

import type { PositionedSceneBody } from '../../../@types/engine/frame/PositionedSceneBody';
import type { PositionedStar } from '../../../@types/scene/PositionedStar';
import { SEEDED_STAR_CATALOGS } from '../../../data/bodies/seededStarCatalogs';
import { SEEDED_STAR_REFS } from './seededStarRefs';

export function positionedSeededStars(
  bodies: readonly PositionedSceneBody[],
): readonly PositionedStar[] {
  const stars: PositionedStar[] = [];
  for (const { body, positionMpc } of bodies) {
    const ref = SEEDED_STAR_REFS.get(body.id);
    if (ref === undefined) continue;
    const { source, seedIndex } = ref;
    stars.push({ ...SEEDED_STAR_CATALOGS[ref.item][seedIndex]!, positionMpc, source, seedIndex });
  }
  return stars;
}
