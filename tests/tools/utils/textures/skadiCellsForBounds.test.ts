import { describe, expect, it } from 'vitest';

import { EOX_REGIONS } from '../../../../tools/fetch/eoxRegions';
import { skadiCellsForBounds } from '../../../../tools/utils/textures/skadiCellsForBounds';

describe('skadiCellsForBounds', () => {
  it('covers the sjaelland EOX box with its nine whole-degree cells', () => {
    const box = EOX_REGIONS.sjaelland;
    expect(skadiCellsForBounds({ ...box })).toEqual([
      'N54/N54E010',
      'N54/N54E011',
      'N54/N54E012',
      'N55/N55E010',
      'N55/N55E011',
      'N55/N55E012',
      'N56/N56E010',
      'N56/N56E011',
      'N56/N56E012',
    ]);
  });

  it('names the cells either side of the prime meridian', () => {
    const cells = skadiCellsForBounds({ west: -0.4, east: 0.4, south: 51.2, north: 51.6 });
    expect(cells).toEqual(['N51/N51W001', 'N51/N51E000']);
  });

  it('zero-pads southern and western cells', () => {
    const cells = skadiCellsForBounds({ west: -71.2, east: -71.1, south: -5.6, north: -5.5 });
    expect(cells).toEqual(['S06/S06W072']);
  });
});
