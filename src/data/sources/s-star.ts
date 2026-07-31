import type { BodySourceEntry } from '../../@types/data/body/BodySourceEntry';
import { Source } from '../source';

/**
 * The bound S-stars of the Galactic Centre — one registry row for all 39.
 *
 * `type: 'body'`, not `'starCatalog'`: an S-star is element-positioned about
 * Sgr A\* exactly as a planet is about the Sun, while the star-catalog cluster
 * means "a stellar point set seeded or streamed as a unit". Filing them there
 * would duplicate the registry-versus-data disagreement
 * `docs/backlog/2026-07-29-near-field-stars-body-vs-star-domain.md` records.
 *
 * They are DRAWN, unlike Sgr A\* itself: the star layers pick them up from the
 * body store's star list, so this row's `visible` seeds the gate that decides
 * whether they appear at all.
 */
export const S_STAR_ENTRY = {
  type: 'body',
  code: Source.SStar,
  id: 's-star',
  label: 'S-Star',
  // A tight cluster at one point on the sky, not a survey footprint —
  // allSky:true matches the other non-catalog rows.
  allSky: true,
  // Seeds `bodies.items['s-star'].enabled`, which `visibleStars` reads to gate
  // the drawn set. Live, but unwritable, exactly like the Sun's row: no setter
  // exists because no control has been designed for it.
  visible: true,
  // No captions: 39 names inside a few arcseconds would pile into an unreadable
  // smear, and Sgr A* already names the place. So no `labelLayer`/`detailLabel`/
  // `shortLabel`/`plural` either — those are present iff `bearsLabel`.
  bearsLabel: false,
  bearsMarker: false,
} as const satisfies BodySourceEntry;
