/**
 * focusDriverId — the arm→driver-id table the six camera sites share. A wrong
 * arm mapping is invisible to the compiler (every arm returns `string | null`),
 * so the table is asserted row by row; PR 2 extends it with the star Layer arm.
 */

import { describe, it, expect } from 'vitest';

import { focusDriverId } from '../../../src/utils/camera/focusDriverId';
import { makeGalaxyRow } from '../../fixtures/makeGalaxyRow';
import type { SelectionRow } from '../../../src/@types/engine/SelectionRow';

const ROWS: readonly (readonly [string, SelectionRow | null, string | null])[] = [
  ['galaxyCatalog', makeGalaxyRow({ objId: '42' }), null],
  [
    'structure',
    {
      type: 'structure',
      category: 'cluster',
      id: 'coma',
      name: 'Coma',
      worldPos: [0, 0, 0],
      featured: true,
      physicalRadiusMpc: 2,
    },
    null,
  ],
  ['milkyWay', { type: 'milkyWay' }, null],
  ['zoneOfAvoidance', { type: 'zoneOfAvoidance' }, null],
  ['body', { type: 'body', id: 'earth', label: 'Earth', positionMpc: [0, 0, 0] }, 'earth'],
  [
    'star',
    { type: 'star', index: 7, positionMpc: [0, 0, 0], absMag: 4, bpRp: 0.8, radiusM: 7e8 },
    null,
  ],
  ['null', null, null],
];

describe('focusDriverId', () => {
  it.each(ROWS)('%s', (_arm, row, expected) => {
    expect(focusDriverId(row)).toBe(expected);
  });
});
