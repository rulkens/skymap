import type { BlackHoleSourceEntry } from '../../../@types/data/blackHole/BlackHoleSourceEntry';
import { Source } from '../../../data/source';

/**
 * Sagittarius A\* — the Galactic Centre's supermassive black hole.
 *
 * ### Why the shown name is the PLACE, not the designation
 *
 * "Sgr A*" names the radio source to someone who already knows what it is; to
 * everyone else it is noise, and the caption is often the only mark on screen.
 * So `label` — the caption, the settings row, the palette's primary name — is
 * the plain-language place, and the designation survives as `detailLabel` plus
 * the search aliases in `blackHoleSearch`, which a reader typing "Sgr A*" reaches.
 */
export const SGR_A_STAR_ENTRY = {
  type: 'blackHole',
  code: Source.SgrAStar,
  id: 'sgr-a-star',
  label: 'Galactic Centre',
  // A single object, not a sky patch — allSky:true matches the other non-catalog
  // rows (the coverage-mask logic only consults this flag for galaxy footprints).
  allSky: true,
  bearsLabel: true,
  labelLayer: 'blackHoles',
  bearsMarker: false,
  detailLabel: 'Sagittarius A*',
  shortLabel: 'Galactic Centre',
  // `plural` heads the settings/list row, and there is exactly one Galactic
  // Centre — the singular spelling is deliberate, as it is for Earth and the Sun.
  plural: 'Galactic Centre',
} as const satisfies BlackHoleSourceEntry;
