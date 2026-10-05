import { describe, expect, it } from 'vitest';
import { detailCardFor } from '../../../src/utils/infoCard/detailCardFor';
import { detailCardTable } from '../../../src/components/InfoCard/detailCardTable';
import { APP_COMPOSITION } from '../../../src/compositions/app';
import { MILKY_WAY_INFO } from '../../../src/data/milkyWay/milkyWayInfo';

describe('detailCardFor', () => {
  it('returns the table row matching the target arm', () => {
    const table = detailCardTable(APP_COMPOSITION.layers);

    expect(detailCardFor(table, MILKY_WAY_INFO)).toBe(table.milkyWay);
  });
});
