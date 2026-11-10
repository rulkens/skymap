import type { BLACK_HOLE_SOURCE_ROWS } from '../sources/blackHoleSourceRows';

/**
 * The closed set of black-hole ids — the key domain for
 * `settings.blackHoles.items`. Follows the Layer's own rows tuple, so a second
 * hole widens the union by existing.
 */
export type BlackHoleId = (typeof BLACK_HOLE_SOURCE_ROWS)[number][1]['id'];
