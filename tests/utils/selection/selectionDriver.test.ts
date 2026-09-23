import { describe, it, expect } from 'vitest';
import { selectionDriver } from '../../../src/utils/selection/selectionDriver';
import { makeGalaxyRow } from '../../fixtures/makeGalaxyRow';
import { bodyDriverGeometry } from '../../../src/utils/scene/bodyDriverGeometry';
import type { SelectionRow } from '../../../src/@types/engine/SelectionRow';

describe('selectionDriver', () => {
  it('returns the driver on a driving arm', () => {
    const driver = bodyDriverGeometry('earth');
    const row: SelectionRow = {
      type: 'body',
      id: 'earth',
      label: 'Earth',
      positionMpc: [0, 0, 0],
      driver,
    };
    expect(selectionDriver(row)).toBe(driver);
  });

  it('returns null for a non-driving arm', () => {
    expect(selectionDriver(makeGalaxyRow())).toBeNull();
  });

  it('returns null for a null row', () => {
    expect(selectionDriver(null)).toBeNull();
  });
});
