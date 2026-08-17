import type { BodySourceEntry } from '../../@types/data/body/BodySourceEntry';
import { Source } from '../source';

export const EARTH_ENTRY = {
  type: 'body',
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
  // Earth captions itself on the final descent, so it bears labels like any
  // other named source — the foreground-labels layer draws the caption on the
  // NEAR0 slab rather than the COSMO one, which is a routing detail.
  bearsLabel: true,
  labelLayer: 'body',
  bearsMarker: false,
  detailLabel: 'Earth',
  shortLabel: 'Earth',
  // `plural` is the list/toggle header string, and the panel row for the one
  // Earth reads "Earth" — the singular spelling is deliberate.
  plural: 'Earth',
} as const satisfies BodySourceEntry;
