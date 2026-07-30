import type { BodySourceEntry } from '../../@types/data/body/BodySourceEntry';
import { Source } from '../source';

export const PLANET_ENTRY = {
  type: 'body',
  code: Source.Planet,
  id: 'planet',
  label: 'Planet',
  // A collection of bodies sitting at the observer's near field, not a sky
  // patch — allSky:true matches the other non-catalog rows (the coverage-mask
  // logic only consults this flag for galaxy-catalog footprints).
  allSky: true,
  // On by default: the planets are part of the baseline near-field scene,
  // resolved only on close approach through their content-layer. The flag never
  // reaches ALL_VISIBLE_MASK (galaxy-catalog rows only), so it's a scene-intent
  // marker, not a bitmask contributor.
  visible: true,
  // The planets caption themselves on the final descent, so this row bears
  // labels like any other named source — the foreground-labels layer draws the
  // captions on the NEAR0 slab rather than the COSMO one, which is a routing
  // detail. The Moon rides this row's 'planet' caption kind, so it follows the
  // same gate.
  bearsLabel: true,
  labelLayer: 'body',
  bearsMarker: false,
  detailLabel: 'Planet',
  shortLabel: 'Planet',
  plural: 'Planets',
} as const satisfies BodySourceEntry;
