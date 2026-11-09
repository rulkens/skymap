import { describe, expect, it } from 'vitest';

import { placedStructureRow } from '../../../../../src/layers/structure/selection/utils/placedStructureRow';
import type { StructureInfo } from '../../../../../src/@types/data/structure/StructureInfo';

const record = (radii: Partial<StructureInfo>): StructureInfo =>
  ({
    type: 'structure',
    id: 'virgo',
    name: 'Virgo Cluster',
    category: 'galaxy-cluster',
    worldPos: [3, 4, 5],
    featured: true,
    physicalRadiusMpc: 2,
    ...radii,
  }) as StructureInfo;

describe('placedStructureRow focusRegion', () => {
  it('fades across the [physical, apparent] band, the two radii independent', () => {
    expect(placedStructureRow(record({ apparentRadiusMpc: 5 })).focusRegion).toEqual({
      center: [3, 4, 5],
      apparentRadiusMpc: 5,
      physicalRadiusMpc: 2,
    });
  });

  it('without an apparent extent the outer edge falls back to the physical radius', () => {
    expect(placedStructureRow(record({})).focusRegion).toEqual({
      center: [3, 4, 5],
      apparentRadiusMpc: 2,
      physicalRadiusMpc: 2,
    });
  });
});
