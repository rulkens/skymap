/**
 * makeGalaxyRow — one shared builder for the `GalaxyRow` literal that many
 * tests hand-assemble inline. Same churn rationale as `makeGalaxyCatalog`:
 * centralise the field list so a new field on the row is one edit, not ~N
 * identical breakages.
 *
 * Defaults are neutral zeros / falses; each test passes the values it actually
 * asserts on via `overrides`. `famous` is optional, so it is omitted here and
 * an override supplies it when a test exercises the famous-galaxies-meta block.
 */

import { Source } from '../../src/data/sources';

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
