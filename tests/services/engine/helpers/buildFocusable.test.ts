import { describe, it, expect } from 'vitest';

import { buildFocusable } from '../../../../src/services/engine/helpers/buildFocusable';
import { MILKY_WAY_INFO } from '../../../../src/data/milkyWay/milkyWayInfo';
import type { GalaxyRow } from '../../../../src/@types/engine/GalaxyRow';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import { Source } from '../../../../src/data/sources';

const galaxyRow: GalaxyRow = {
  type: 'galaxyCatalog',
  source: Source.SDSS,
  index: 0,
  objId: '1237668',
  x: 10,
  y: 20,
  z: 30,
  redshift: 0.0123,
  magU: 18.1,
  magG: 17.4,
  magR: 16.9,
  magI: 16.6,
  magZ: 16.4,
  diameterKpc: 42,
  axisRatio: 0.7,
  positionAngleDeg: 35,
  classByte: 0,
  parentSurveyByte: 0,
};

const structure: StructureInfo = {
  type: 'structure',
  category: 'cluster',
  id: 'abell-2065',
  name: 'Corona Borealis',
  worldPos: [1, 2, 3],
  featured: true,
  physicalRadiusMpc: 5,
} as unknown as StructureInfo;

describe('buildFocusable', () => {
  it('null → null', () => expect(buildFocusable(null)).toBeNull());
  it('galaxy row → GalaxyInfo', () => {
    const info = buildFocusable(galaxyRow);
    expect(info).toMatchObject({ type: 'galaxyCatalog', objID: 1237668n, source: Source.SDSS });
  });
  it('structure row → the StructureInfo as-is', () => {
    expect(buildFocusable(structure)).toBe(structure);
  });
  it('milkyWay row → MILKY_WAY_INFO', () => {
    expect(buildFocusable({ type: 'milkyWay' })).toBe(MILKY_WAY_INFO);
  });
});
