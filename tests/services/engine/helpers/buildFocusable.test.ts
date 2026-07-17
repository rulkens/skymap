import { describe, it, expect } from 'vitest';

import { buildFocusable } from '../../../../src/services/engine/helpers/buildFocusable';
import { MILKY_WAY_INFO } from '../../../../src/data/milkyWay/milkyWayInfo';
import { apparentMagnitudeFromAbs } from '../../../../src/utils/star/apparentMagnitudeFromAbs';
import { spectralClassFromBpRp } from '../../../../src/utils/star/spectralClassFromBpRp';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { GalaxyRow } from '../../../../src/@types/engine/GalaxyRow';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { StarInfo } from '../../../../src/@types/engine/StarInfo';
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

  it('star builds a StarInfo with derived fields', () => {
    // A star placed exactly 10 pc away (10 pc = 10 · PC_TO_MPC Mpc, laid on one
    // axis) so the distance modulus is zero and apparentMag === absMag — the
    // hand-checkable anchor for the derivation.
    const absMag = 4.83;
    const bpRp = 0.82;
    const info = buildFocusable({
      type: 'star',
      index: 7,
      positionMpc: [10 * SCALE_UNITS.PC_TO_MPC, 0, 0],
      absMag,
      bpRp,
    }) as StarInfo;

    expect(info.distancePc).toBeCloseTo(10, 9);
    expect(info.apparentMag).toBeCloseTo(absMag, 9);
    expect(info.apparentMag).toBe(apparentMagnitudeFromAbs(absMag, info.distancePc));
    expect(info.spectralClass).toBe(spectralClassFromBpRp(bpRp));
  });
});
