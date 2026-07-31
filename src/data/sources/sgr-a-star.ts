import type { BodySourceEntry } from '../../@types/data/body/BodySourceEntry';
import { Source } from '../source';

/**
 * Sagittarius A\* — the Galactic Centre's supermassive black hole, and the
 * focus every S-star orbit hangs off.
 *
 * It DRAWS NOTHING: no sphere, no point, no glint. Its whole on-screen presence
 * is its caption, so `bearsLabel` is the one capability flag that matters here
 * and the caption production path (`captionPriority` / `captionFadeRules` /
 * `sceneBodyLabels`) is where its visibility actually lives.
 *
 * Its own registry row rather than a member of the curated star map, for the
 * reason the Sun's row records: a row makes the star map's gate a plain
 * membership test instead of an id exemption threaded through the star layers.
 *
 * ### Why the shown name is the PLACE, not the designation
 *
 * "Sgr A*" names the radio source to someone who already knows what it is; to
 * everyone else it is noise, and this is the only mark on a screen otherwise
 * showing nothing. So `label` — the caption, the settings row, the palette's
 * primary name — is the plain-language place, and the designation survives as
 * `detailLabel` plus the search aliases in `bodySearchNames`, which is what a
 * reader who types "Sgr A*" is actually reaching for.
 */
export const SGR_A_STAR_ENTRY = {
  type: 'body',
  code: Source.SgrAStar,
  id: 'sgr-a-star',
  label: 'Galactic Centre',
  // A single body, not a sky patch — allSky:true matches the other non-catalog
  // rows (the coverage-mask logic only consults this flag for galaxy footprints).
  allSky: true,
  // Seeds `bodies.items['sgr-a-star'].enabled`. Inert today in the same way
  // `gaiaStars.labelEnabled` is: nothing renders for Sgr A*, so no gate reads
  // it. Seeded true so it means "present" rather than asserting a hidden body,
  // and so a future glyph or horizon disc inherits a sane default.
  visible: true,
  bearsLabel: true,
  labelLayer: 'body',
  bearsMarker: false,
  detailLabel: 'Sagittarius A*',
  shortLabel: 'Galactic Centre',
  // `plural` heads the settings/list row, and there is exactly one Galactic
  // Centre — the singular spelling is deliberate, as it is for Earth and the Sun.
  plural: 'Galactic Centre',
} as const satisfies BodySourceEntry;
