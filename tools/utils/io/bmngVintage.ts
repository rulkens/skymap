/**
 * `BMNG_VINTAGE` — the Blue Marble month Earth's imagery uses. The base texture (equirect) and the
 * surface tile pyramid (quadrants) must share a month, or a snow line would sit at the frontier between
 * them; picking both from this one row keeps them together.
 */

import { BMNG_MONTHS } from './BMNG_MONTHS';

export const BMNG_VINTAGE = BMNG_MONTHS[7]!; // August 2004
