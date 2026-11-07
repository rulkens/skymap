/**
 * isUnderfoot — whether a search result is the ground a standing person is on: the host body
 * itself or a site on its surface. Turning the head cannot show those (the host's centre is
 * straight down), so the search flies to them instead (spec Review focus 1).
 */

import type { SelectionRowBase } from '../../@types/engine/selection/SelectionRowBase';
import type { SkySpot } from '../../@types/camera/pose/SkySpot';
import { SURFACE_FIXED_SITES } from '../../data/bodies/surfaceFixedSites';
import { selectionDriver } from '../selection/selectionDriver';

export function isUnderfoot(row: SelectionRowBase, spot: SkySpot): boolean {
  const id = selectionDriver(row)?.poseId ?? null;
  if (id === null) return false;
  return id === spot.body || SURFACE_FIXED_SITES.some((s) => s.id === id && s.hostId === spot.body);
}
