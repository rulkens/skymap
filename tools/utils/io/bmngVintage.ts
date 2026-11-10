/**
 * `BMNG_VINTAGE` — the one place Earth's Blue Marble imagery month is chosen.
 *
 * Blue Marble Next Generation is a MONTHLY series: twelve whole-globe images,
 * all from 2004, each published as a 21600x10800 equirect plus eight
 * 21600x21600 quadrants (86400x43200 composited) — nine files per vintage.
 *
 * Earth's base texture bakes from the equirect, the surface tile pyramid
 * from the quadrants, and the tile layer falls back to the base outside the
 * baked range — so the two MUST share a month, or a snow line would sit at
 * the frontier this feature exists to make inspectable. The three fields
 * (filename stamp, URL segment, prose label) encode that month three ways
 * and change together — now one row of `BMNG_MONTHS`, which
 * this picks from.
 */

import { BMNG_MONTHS } from './BMNG_MONTHS';

export const BMNG_VINTAGE = BMNG_MONTHS[7]!; // August 2004
