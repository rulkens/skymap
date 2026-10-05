import type { BlackHoleSourceEntry } from '../../../@types/data/blackHole/BlackHoleSourceEntry';
import { Source } from '../../../data/source';

/**
 * Sagittarius A\* — the Galactic Centre's supermassive black hole.
 *
 * `label` is the place; the designation survives as `detailLabel` plus the
 * search aliases in `blackHoleSearch`.
 */
export const SGR_A_STAR_ENTRY = {
  type: 'blackHole',
  code: Source.SgrAStar,
  id: 'sgr-a-star',
  label: 'Galactic Centre',
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
