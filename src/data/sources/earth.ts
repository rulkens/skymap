import type { EarthSourceEntry } from '../../@types/data/body/EarthSourceEntry';
import { Source } from '../source';

export const EARTH_ENTRY = {
  type: 'earth',
  code: Source.Earth,
  id: 'earth',
  label: 'Earth',
  // A single body sitting at the observer's near field, not a sky patch —
  // allSky:true matches the other non-catalog rows (the coverage-mask logic
  // only consults this flag for galaxy-catalog footprints).
  allSky: true,
  // On by default: the body is part of the baseline near-field scene, resolved
  // only on close approach through its content-layer. The flag never reaches
  // ALL_VISIBLE_MASK (galaxy-catalog rows only), so it's a scene-intent marker,
  // not a bitmask contributor.
  visible: true,
  // Bodies bypass the COSMO label/marker systems — Earth's caption ships
  // through the foreground-labels layer — so neither capability flag is set.
  bearsLabel: false,
  bearsMarker: false,
} as const satisfies EarthSourceEntry;
