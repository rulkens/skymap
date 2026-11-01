/**
 * A body's SURFACE-FIXED chain, nearest first and ending at the root that is
 * not itself surface-fixed: `['curiosity', 'mars']` for a rover, `['mars']` for
 * a planet, `[]` for no body. The ladder's ONE such walk — the rung a focus
 * keeps and the surface a remembered tilt belongs to are both read off it, and
 * a second copy would let them disagree about what a rover hangs from.
 */

import { positionDriverOrNull } from '../../data/bodies/positionDrivers';
import type { PositionedId } from '../../@types/scene/PositionedId';

export function surfaceFixedChain(id: PositionedId | null): readonly PositionedId[] {
  if (id === null) return [];
  const chain: PositionedId[] = [id];
  let driver = positionDriverOrNull(id);
  while (driver?.kind === 'surfaceFixed') {
    chain.push(driver.hostId);
    driver = positionDriverOrNull(driver.hostId);
  }
  return chain;
}
