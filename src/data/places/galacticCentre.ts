/**
 * GALACTIC_CENTRE_ANCHOR — the Galactic Centre as a PLACE: the position the
 * `galactic-centre` region, the lensing slab row, `MILKY_WAY_CENTER_WORLD`
 * and R₀ all key on. Sgr A* is what sits there, not what defines it.
 *
 * A plain `raDecDistToCartesian` of the radio source's catalogue coordinates
 * — the same right-handed equatorial J2000 conversion `starAnchor` uses, so
 * the Centre is not rotated against the sky the catalogues paint. Every
 * reader imports THIS rather than re-transcribing the pair; the rounded one
 * `galacticCenter.ts` used to carry put the impostor's hub 178 pc off the
 * black hole it is the hub of, plainly visible with both on screen.
 */

import { raDecDistToCartesian } from '../../utils/math/raDecDistToCartesian';
import { SCALE_UNITS } from '../scaleUnits';
import type { AnchorBody } from '../../@types/scene/AnchorBody';
import type { PlaceId } from '../../@types/scene/PlaceId';

/** J2000 radio position, Reid & Brunthaler 2004: 17h45m40.04s, −29°00′28.1″. */
const SGR_A_STAR_RA_DEG = 266.41684;
const SGR_A_STAR_DEC_DEG = -29.00781;

/**
 * R₀ = 8178 pc (GRAVITY Collaboration 2019, A&A 625, L10). The S-star elements
 * are transcribed in arcseconds and become parsecs through this distance, so it
 * is the scale of every orbit in the `galactic-centre` region, not a framing
 * choice.
 */
const GALACTIC_CENTRE_DISTANCE_PC = 8178;

export const GALACTIC_CENTRE_ANCHOR: AnchorBody & { readonly id: PlaceId } = {
  id: 'galactic-centre',
  positionMpc: raDecDistToCartesian(
    SGR_A_STAR_RA_DEG,
    SGR_A_STAR_DEC_DEG,
    GALACTIC_CENTRE_DISTANCE_PC * SCALE_UNITS.PC_TO_MPC,
  ),
};
