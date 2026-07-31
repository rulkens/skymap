/**
 * bodyRowChip — the category chip a scene-body row shows: its constellation when
 * it has one, otherwise the scale regime it sits in.
 *
 * The region fallback replaces a blanket 'Solar System' literal that was true
 * only for the Sun's own subtree; a body 8 kpc away chips as its own region.
 * Famous stars stay on the constellation branch — routing them through the
 * region would trade 'Canis Major' for 'Solar Neighbourhood'. `regionOfBody`
 * over `regionById`: an unclaimed body must drop the chip, never throw mid-row.
 */

import { constellationOfBody } from '../../../utils/scene/constellationOfBody';
import { regionOfBody } from '../../../utils/scene/regionOfBody';

export function bodyRowChip(bodyId: string): string | undefined {
  return constellationOfBody(bodyId) ?? regionOfBody(bodyId)?.label;
}
