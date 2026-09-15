/**
 * A body's SURFACE-FIXED chain, nearest first and ending at the root that is
 * not itself surface-fixed: `['curiosity', 'mars']` for a rover, `['mars']` for
 * a planet, `[]` for no body. The ladder's ONE such walk — the rung a focus
 * keeps and the surface a remembered tilt belongs to are both read off it, and
 * a second copy would let them disagree about what a rover hangs from.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import { positionDriverById } from '../../data/bodies/positionDrivers';

export function surfaceFixedChain(id: BodyId | null): readonly BodyId[] {
  if (id === null) return [];
  const chain: BodyId[] = [id];
  let driver = positionDriverById(id);
  while (driver.kind === 'surfaceFixed') {
    // `SurfaceFixedSite.hostId` is typed `string`; every id it carries is a
    // roster body by construction (`positionDriverById` throws otherwise).
    const host = driver.hostId as BodyId;
    chain.push(host);
    driver = positionDriverById(host);
  }
  return chain;
}
