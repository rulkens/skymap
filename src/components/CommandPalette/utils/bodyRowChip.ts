/**
 * bodyRowChip — a seeded star's constellation, else its scale regime. `regionOfBody` over
 * `regionById`: an unclaimed body must drop the chip, never throw mid-row.
 */

import { constellationOfBody } from '../../../utils/scene/constellationOfBody';
import { regionOfBody } from '../../../utils/regions/regionOfBody';

export function bodyRowChip(bodyId: string): string | undefined {
  return constellationOfBody(bodyId) ?? regionOfBody(bodyId)?.label;
}
