/**
 * sceneSgrAStar — Sagittarius A*'s two seed records: its registry identity and
 * its focus-graph anchor.
 *
 * Both live here rather than split across `sceneBodies` and `sceneAnchors`
 * because they state the same three facts about one object; the two tables
 * import from this one home so the sky coordinates cannot be authored twice.
 *
 * The position is a plain `raDecDistToCartesian` of the radio source's
 * catalogue coordinates — the same right-handed equatorial J2000 conversion
 * `starAnchor` uses, so Sgr A* is not rotated against the sky the catalogues
 * paint. `MILKY_WAY_CENTER_WORLD` reads `SGR_A_STAR_ANCHOR` rather than
 * re-transcribing the coordinates, so the impostor's hub and the black hole it
 * is the hub of cannot drift apart; the rounded pair that file used to carry put
 * them 178 pc apart, plainly visible once both were on screen together.
 */

import { raDecDistToCartesian } from '../../utils/math/raDecDistToCartesian';
import { SCALE_UNITS } from '../scaleUnits';
import { SGR_A_STAR_ENTRY } from '../sources/sgr-a-star';
import { SGR_A_STAR_SCHWARZSCHILD_RADIUS_KM } from './sgrAStarSchwarzschildRadiusKm';
import type { AnchorBody } from '../../@types/scene/AnchorBody';
import type { AnchorPointBody } from '../../@types/scene/AnchorPointBody';

/** J2000 radio position, Reid & Brunthaler 2004: 17h45m40.04s, −29°00′28.1″. */
const SGR_A_STAR_RA_DEG = 266.41684;
const SGR_A_STAR_DEC_DEG = -29.00781;

/**
 * R₀ = 8178 pc (GRAVITY Collaboration 2019, A&A 625, L10). The S-star elements
 * are transcribed in arcseconds and become parsecs through this distance, so it
 * is the scale of every orbit in the `galactic-centre` region, not a framing
 * choice.
 */
const SGR_A_STAR_DISTANCE_PC = 8178;

export const SGR_A_STAR: AnchorPointBody = {
  id: SGR_A_STAR_ENTRY.id,
  label: SGR_A_STAR_ENTRY.label,
  radiusM: SGR_A_STAR_SCHWARZSCHILD_RADIUS_KM * SCALE_UNITS.KM_TO_M,
};

export const SGR_A_STAR_ANCHOR: AnchorBody = {
  id: SGR_A_STAR_ENTRY.id,
  positionMpc: raDecDistToCartesian(
    SGR_A_STAR_RA_DEG,
    SGR_A_STAR_DEC_DEG,
    SGR_A_STAR_DISTANCE_PC * SCALE_UNITS.PC_TO_MPC,
  ),
};
