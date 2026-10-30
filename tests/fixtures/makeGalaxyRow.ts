import { Source } from '../../src/data/source';
import type { GalaxyRow } from '../../src/@types/engine/GalaxyRow';

export function makeGalaxyRow(overrides: Partial<GalaxyRow> = {}): GalaxyRow {
  return {
    type: 'galaxyCatalog',
    source: Source.SDSS,
    index: 0,
    objId: '1',
    x: 0,
    y: 0,
    z: 0,
    redshift: 0,
    magU: 0,
    magG: 0,
    magR: 0,
    magI: 0,
    magZ: 0,
    diameterKpc: 0,
    axisRatio: 0,
    positionAngleDeg: 0,
    orientationIsFallback: false,
    diameterIsFallback: false,
    classByte: 0,
    parentSurveyByte: 0,
    ...overrides,
  };
}
