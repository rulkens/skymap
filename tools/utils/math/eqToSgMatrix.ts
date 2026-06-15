/**
 * Equatorial → Supergalactic rotation matrix (Mpc Cartesian frames).
 *
 * Derived as the transpose of the repo's canonical
 * `SG_TO_EQ_MATRIX` (a rotation, so transpose = inverse).  Kept in its
 * own file so both `eqToSg` and any other equatorial→SG consumer share
 * one definition rather than each transposing independently.
 */
import { SG_TO_EQ_MATRIX } from '../../../src/data/superGalacticTransform';
import { transpose3 } from './transpose3';

export const EQ_TO_SG_MATRIX = transpose3(SG_TO_EQ_MATRIX);
