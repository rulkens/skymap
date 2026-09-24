/**
 * SCENE_ANCHORS — roots of the focus graph: positions stated outright, not
 * derived from `OrbitalElements`. The seeded star map lives here, the Sun's own
 * one-row table beside it; their records carry identity and photometry only.
 * Sgr A* is a root too — an anchor need not be drawn, only positioned.
 *
 * The Sun's `[0, 0, 0]` comes from its seed row (distance 0) and is not a
 * reference to `RENDER_ORIGIN_MPC` (`data/renderOrigin.ts`) — the Sun's position
 * and the frame's origin are different facts that share a value only because the
 * origin was chosen to be the Sun. `renderOrigin.ts:15-18` flags a future dynamic
 * origin; importing the constant here would drag the Sun along with a moving
 * frame instead of leaving it fixed in heliocentric space.
 */

import { FAMOUS_STARS_GENERATED } from './famousStars.generated';
import { SUN_GENERATED } from './sun.generated';
import { starAnchor } from './makers/starAnchor';
import { GALACTIC_CENTRE_ANCHOR } from '../places/galacticCentre';
import { SGR_A_STAR } from './sceneSgrAStar';
import type { AnchorBody } from '../../@types/scene/AnchorBody';

// PR 2 removes this: the position belongs to the PLACE now, but the S-star
// elements still focus on `sgr-a-star` and the glint, the caption and the
// pick stamp still read its state, so the body needs a row. The place's own
// array by reference — never a second coordinate. `bodyRegions` claims both
// ids into `galactic-centre`, or an unclaimed one would inflate the
// neighbourhood's extent to 8 kpc.
const SGR_A_STAR_ALIAS: AnchorBody = {
  id: SGR_A_STAR.id,
  positionMpc: GALACTIC_CENTRE_ANCHOR.positionMpc,
};

export const SCENE_ANCHORS: readonly AnchorBody[] = [
  ...SUN_GENERATED.map(starAnchor),
  ...FAMOUS_STARS_GENERATED.map(starAnchor),
  // The Galactic Centre trails the star roster so the seed order above is
  // untouched. It anchors the `galactic-centre` region rather than falling
  // into the neighbourhood's residual set, so its 8 kpc distance never
  // reaches an extent.
  GALACTIC_CENTRE_ANCHOR,
  SGR_A_STAR_ALIAS,
];
