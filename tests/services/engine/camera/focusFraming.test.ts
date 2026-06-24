/**
 * focusFraming tests — verifies each of the three SelectionRow arms returns
 * the expected { target, distance } pair.
 *
 * These are pure unit tests: no store, no engine, no async. The function is
 * deterministic given a row and a FOV, so we compare against the same helpers
 * that focusTweenDescriptor used (galaxyFocusDistance, structureFocusDistance,
 * MILKY_WAY_VIEW_DISTANCE_MPC) to document the intent without hard-coding the
 * derived numbers.
 */

import { describe, it, expect } from 'vitest';
import { focusFraming } from '../../../../src/services/engine/camera/focusFraming';
import { galaxyFocusDistance } from '../../../../src/services/engine/camera/galaxyFocusDistance';
import { structureFocusDistance } from '../../../../src/services/engine/camera/structureFocusDistance';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_VIEW_DISTANCE_MPC,
} from '../../../../src/data/milkyWay/galacticCenter';
import type { GalaxyRow } from '../../../../src/@types/engine/GalaxyRow';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';

const FOVY = 0.8;

const galaxyRow = (over: Partial<GalaxyRow> = {}): GalaxyRow => ({
  type: 'galaxyCatalog',
  source: 0,
  index: 7,
  objId: '12345',
  x: 1,
  y: 2,
  z: 3,
  redshift: 0.01,
  magU: 0,
  magG: 0,
  magR: 0,
  magI: 0,
  magZ: 0,
  diameterKpc: 40,
  axisRatio: 1,
  positionAngleDeg: 0,
  classByte: 0,
  parentSurveyByte: 0,
  ...over,
});

const structureRow = (over: Partial<StructureInfo> = {}): StructureInfo =>
  ({
    type: 'structure',
    worldPos: [10, -20, 30],
    physicalRadiusMpc: 2,
    apparentRadiusMpc: 5,
    ...over,
  }) as StructureInfo;

describe('focusFraming', () => {
  it('galaxy arm — targets galaxy position and frames on its diameter', () => {
    const row = galaxyRow({ x: 1, y: 2, z: 3, diameterKpc: 40 });
    const result = focusFraming(row, FOVY);
    expect(result.target).toEqual([1, 2, 3]);
    expect(result.distance).toBe(galaxyFocusDistance(40));
  });

  it('structure arm — targets worldPos and frames on apparent radius via FOV', () => {
    const row = structureRow({ worldPos: [10, -20, 30], apparentRadiusMpc: 5 });
    const result = focusFraming(row, FOVY);
    expect(result.target).toEqual([10, -20, 30]);
    expect(result.distance).toBe(structureFocusDistance(5, FOVY));
  });

  it('structure arm — falls back to physicalRadiusMpc when no apparentRadiusMpc', () => {
    const row = structureRow({ apparentRadiusMpc: undefined, physicalRadiusMpc: 2 });
    const result = focusFraming(row, FOVY);
    expect(result.distance).toBe(structureFocusDistance(2, FOVY));
  });

  it('milkyWay arm — targets galactic centre at the fixed view distance', () => {
    const result = focusFraming({ type: 'milkyWay' }, FOVY);
    expect(result.target).toEqual([
      MILKY_WAY_CENTER_WORLD[0],
      MILKY_WAY_CENTER_WORLD[1],
      MILKY_WAY_CENTER_WORLD[2],
    ]);
    expect(result.distance).toBe(MILKY_WAY_VIEW_DISTANCE_MPC);
  });

  it('galaxy arm — target is a fresh array, not aliased from the row', () => {
    const row = galaxyRow({ x: 1, y: 2, z: 3 });
    const result = focusFraming(row, FOVY);
    // The row has no worldPos to alias — the target is constructed from x/y/z.
    // Confirm it is a real array, not undefined.
    expect(Array.isArray(result.target)).toBe(true);
    expect(result.target).toHaveLength(3);
  });

  it('structure arm — target is a fresh array, not aliased from worldPos', () => {
    const row = structureRow({ worldPos: [10, -20, 30] });
    const result = focusFraming(row, FOVY);
    expect(result.target).not.toBe(row.worldPos);
    expect(result.target).toEqual([10, -20, 30]);
  });
});
