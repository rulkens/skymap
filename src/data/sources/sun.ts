import type { BodySourceEntry } from '../../@types/data/body/BodySourceEntry';
import { Source } from '../source';

/**
 * The Sun — the near-field descent's aim point, and the origin the whole
 * solar-system scene is expressed relative to.
 *
 * A body row rather than a member of the curated star map. The Sun shares the
 * famous-star SEED table with the map, but not its registry row — otherwise
 * every gate that table touches would need an exemption for it (the star
 * layers' visible-set filter, the caption pipeline's target derivation).
 * Its own row keeps those as ordinary data: the map's gate is a plain
 * membership test, and the Sun's caption reads its own `labelEnabled`.
 *
 * Its caption kind and `sunCaption` fade band stay where they are — those are
 * declutter and pacing concerns rather than visibility routing, and the Sun
 * genuinely does out-rank every other caption.
 */
export const SUN_ENTRY = {
  type: 'body',
  code: Source.Sun,
  id: 'sun',
  label: 'Sun',
  // A single body at the near-field origin, not a sky patch — allSky:true
  // matches the other non-catalog rows.
  allSky: true,
  // `bodies.items.sun.enabled` is seeded true from this. Unlike a truly inert
  // axis (`gaiaStars.labelEnabled`, which nothing ever reads), this one IS
  // live — `visibleStars` gates the Sun's dot on it — but it is unwritable
  // today: no setter exists, because no product decision has been made to
  // expose a control for hiding the render origin. Seeded true so the Sun
  // renders until such a control (or a restored snapshot) says otherwise.
  visible: true,
  bearsLabel: true,
  labelLayer: 'body',
  bearsMarker: false,
  detailLabel: 'Sun',
  shortLabel: 'Sun',
  // `plural` is the list/toggle header string, and the panel row for the one
  // Sun reads "Sun" — the singular spelling is deliberate, as it is for Earth.
  plural: 'Sun',
} as const satisfies BodySourceEntry;
