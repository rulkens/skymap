/**
 * A body's SURFACE-FIXED chain, nearest first and ending at the root that is
 * not itself surface-fixed: `['curiosity', 'mars']` for a rover, `['mars']` for
 * a planet, `[]` for no body. The ladder's ONE such walk — the rung a focus
 * keeps and the surface a remembered tilt belongs to are both read off it, and
 * a second copy would let them disagree about what a rover hangs from.
 */

import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import { positionDriverById } from '../../data/bodies/positionDrivers';
import type { PlaceId } from '../../@types/scene/PlaceId';

export function surfaceFixedChain(
  id: SceneBodyId | PlaceId | null,
): readonly (SceneBodyId | PlaceId)[] {
  if (id === null) return [];
  const chain: (SceneBodyId | PlaceId)[] = [id];
  let driver = positionDriverById(id);
  while (driver.kind === 'surfaceFixed') {
    chain.push(driver.hostId);
    driver = positionDriverById(driver.hostId);
  }
  return chain;
}
