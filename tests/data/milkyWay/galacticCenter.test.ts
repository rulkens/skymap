/**
 * The impostor's hub and the black hole it is the hub of must be the SAME point.
 *
 * They were authored twice — this file's own rounded RA/Dec at a round-numbers
 * 8.0 kpc, and `sceneSgrAStar`'s catalogue pair at R₀ = 8.178 kpc. Each is
 * defensible alone (placing a spiral painting is 2%-tolerant), and the drift is
 * invisible until both are on screen together, where 2% of R₀ is 178 pc of
 * daylight between the disc's centre and the object at its centre.
 *
 * A tolerance would defeat the point: any nonzero budget re-admits the bug it
 * exists to catch, and there is no second source to be tolerant OF now that the
 * seed is shared. Exact identity is the property.
 */

import { describe, it, expect } from 'vitest';

import { MILKY_WAY_CENTER_WORLD } from '../../../src/data/milkyWay/galacticCenter';
import { SGR_A_STAR_ANCHOR } from '../../../src/data/bodies/sceneSgrAStar';

describe('MILKY_WAY_CENTER_WORLD', () => {
  it('is the Sgr A* anchor itself, not a second transcription of its coordinates', () => {
    expect([...MILKY_WAY_CENTER_WORLD]).toEqual([...SGR_A_STAR_ANCHOR.positionMpc]);
  });
});
