import type { StarSourceEntry } from '../../@types/data/body/StarSourceEntry';
import { Source } from '../source';

export const STAR_ENTRY = {
  type: 'star',
  code: Source.Star,
  id: 'star',
  label: 'Star',
  // A collection of bodies sitting at the observer's near field, not a sky
  // patch — allSky:true matches the other non-catalog rows (the coverage-mask
  // logic only consults this flag for galaxy-catalog footprints).
  allSky: true,
  // On by default: the stars are part of the baseline near-field scene,
  // resolved only on close approach through their content-layer. The flag never
  // reaches ALL_VISIBLE_MASK (galaxy-catalog rows only), so it's a scene-intent
  // marker, not a bitmask contributor.
  visible: true,
  // Bodies bypass the COSMO label/marker systems — star captions ship through
  // the foreground-labels layer — so neither capability flag is set.
  bearsLabel: false,
  bearsMarker: false,
} as const satisfies StarSourceEntry;
