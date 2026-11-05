/**
 * bodyCodeOf — a body registry entry's pick code under the body Layer's `pickCodes`,
 * the one function the sphere, glint, mesh, caption and selection stamps share.
 */

import type { CatalogPickCodes } from '../../../../@types/engine/selection/CatalogPickCodes';
import type { BodySourceEntry } from '../../../../@types/data/body/BodySourceEntry';
import type { SourceType } from '../../../../@types/data/SourceType';

export function bodyCodeOf(
  pickCodes: CatalogPickCodes<SourceType>,
): (entry: BodySourceEntry) => number {
  return (entry) => pickCodes.pickCodeOf(entry.code as SourceType);
}
