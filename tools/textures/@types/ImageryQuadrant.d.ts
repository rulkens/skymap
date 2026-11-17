/** ImageryQuadrant — one of the eight quadrant names of the BMNG / Black
 *  Marble tiling: column letter then row digit (`A1` … `D2`). */
import type { QUADRANT_COLUMNS } from '../data/quadrantColumns';
import type { QUADRANT_ROWS } from '../data/quadrantRows';

export type ImageryQuadrant =
  `${(typeof QUADRANT_COLUMNS)[number]}${(typeof QUADRANT_ROWS)[number]}`;
