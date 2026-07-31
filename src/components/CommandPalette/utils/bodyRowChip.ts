/**
 * bodyRowChip — the category chip a scene-body row shows: its constellation when
 * it has one, otherwise the scale regime it sits in.
 *
 * The region fallback replaces a blanket 'Solar System' literal that was true
 * only for the Sun's own subtree; a body 8 kpc away chips as its own region.
 * Famous stars stay on the constellation branch — routing them through the
 * region would trade 'Canis Major' for 'Solar Neighbourhood'. `regionOfBody`
 * over `regionById`: an unclaimed body must drop the chip, never throw mid-row.
 *
 * A chip equal to the row's own name is dropped rather than shown twice: the
 * Galactic Centre anchors the region it is named after, so it would otherwise
 * read "Galactic Centre — Galactic Centre". The chip's job is to place a body
 * the reader may not recognise, which a restatement cannot do.
 */

import { constellationOfBody } from '../../../utils/scene/constellationOfBody';
import { regionOfBody } from '../../../utils/scene/regionOfBody';

export function bodyRowChip(bodyId: string, label: string): string | undefined {
  const chip = constellationOfBody(bodyId) ?? regionOfBody(bodyId)?.label;
  return chip === label ? undefined : chip;
}
