/**
 * bodyCodeOf — a body registry entry's pick code under the body Layer's `pickCodes`,
 * the one function the sphere, glint, mesh, caption and selection stamps share.
 */

import type { CatalogPickCodes } from '../../../../@types/engine/selection/CatalogPickCodes';
import type { BodySourceEntry } from '../../../../@types/data/body/BodySourceEntry';
import type { BodySourceId } from '../../../../@types/data/body/BodySourceId';

export function bodyCodeOf(
  pickCodes: CatalogPickCodes<BodySourceId>,
): (entry: BodySourceEntry) => number {
  return (entry) => pickCodes.pickCodeOf(entry.id as BodySourceId);
}
