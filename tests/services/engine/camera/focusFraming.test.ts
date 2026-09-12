/**
 * focusFraming tests — verifies each SelectionRow arm returns the expected
 * { target, distance } pair.
 *
 * These are pure unit tests: no store, no engine, no async. The function is
 * deterministic given a row and a FOV, so we compare against the same helpers
 * that focusTweenDescriptor used (galaxyFocusDistance, structureFocusDistance,
 * bodyFocusDistance, MILKY_WAY_VIEW_DISTANCE_MPC) to document the intent
 * without hard-coding the derived numbers.
 */

import { describe, it, expect } from 'vitest';
import { focusFraming } from '../../../../src/services/engine/camera/focusFraming';
import { galaxyFocusDistance } from '../../../../src/services/engine/camera/galaxyFocusDistance';
import { structureFocusDistance } from '../../../../src/services/engine/camera/structureFocusDistance';
import { bodyFocusDistance } from '../../../../src/services/engine/camera/bodyFocusDistance';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { SOLAR_RADIUS_KM } from '../../../../src/data/bodies/solarRadiusKm';
import { SCENE_BODIES } from '../../../../src/data/bodies/sceneBodies';
import { SGR_A_STAR } from '../../../../src/data/bodies/sceneSgrAStar';
import { findByIdOrThrow } from '../../../../src/utils/object/findByIdOrThrow';
import { bodyFootprintRadiusM } from '../../../../src/utils/scene/bodyFootprintRadiusM';
import {
  MILKY_WAY_CENTER_WORLD,
  MILKY_WAY_VIEW_DISTANCE_MPC,
} from '../../../../src/data/milkyWay/galacticCenter';
import type { GalaxyRow } from '../../../../src/@types/engine/GalaxyRow';
import type { StructureInfo } from '../../../../src/@types/data/structure/StructureInfo';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import { makeGalaxyRow } from '../../../fixtures/makeGalaxyRow';

type BodyRow = Extract<SelectionRow, { type: 'body' }>;

const FOVY = 0.8;

const galaxyRow = (over: Partial<GalaxyRow> = {}): GalaxyRow =>
  makeGalaxyRow({
    source: 0,
    index: 7,
    objId: '12345',
    x: 1,
    y: 2,
    z: 3,
    redshift: 0.01,
    diameterKpc: 40,
    axisRatio: 1,
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
    // radius = diameter/2 in Mpc — the pass-by offset unit (40 kpc → 0.02 Mpc).
    expect(result.radius).toBeCloseTo(0.02, 6);
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

  it('structure arm — returns radius 0 so a flyPath flies INTO it, never past it', () => {
    // Pass-by is a galaxy idiom (swoop beside a discrete object). A cluster /
    // group / supercluster is a volume you approach head-on, so its pass-by
    // extent is 0 — the offset loop skips any knot with radius ≤ 0.
    const row = structureRow({ apparentRadiusMpc: 5, physicalRadiusMpc: 2 });
    expect(focusFraming(row, FOVY).radius).toBe(0);
  });

  it('milkyWay arm — targets galactic centre at the fixed view distance', () => {
    const result = focusFraming({ type: 'milkyWay' }, FOVY);
    expect(result.target).toEqual([
      MILKY_WAY_CENTER_WORLD[0],
      MILKY_WAY_CENTER_WORLD[1],
      MILKY_WAY_CENTER_WORLD[2],
    ]);
    expect(result.distance).toBe(MILKY_WAY_VIEW_DISTANCE_MPC);
    expect(result.radius).toBe(0);
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

  // ── body arm ───────────────────────────────────────────────────────────────

  const EARTH_RADIUS_M = 6_371_000;
  const bodyRow = (over: Partial<BodyRow> = {}): BodyRow => ({
    type: 'body',
    id: 'earth',
    label: 'Earth',
    positionMpc: [4.8481e-12, 0, 0], // ~1 AU in Mpc
    ...over,
  });

  it('body arm — targets the body position and frames via bodyFocusDistance', () => {
    const row = bodyRow();
    const result = focusFraming(row, FOVY);
    expect(result.target).toEqual([4.8481e-12, 0, 0]);
    expect(result.distance).toBe(bodyFocusDistance(EARTH_RADIUS_M * SCALE_UNITS.M_TO_MPC, FOVY));
  });

  it('body arm — distance is proportional to the physical radius (no clamp)', () => {
    // The relation, not a magic number: the ratio of two bodies' framing
    // distances is the ratio of their radii, and at Earth scale (~2e-16 Mpc)
    // the result stays proportional instead of being swallowed by a Mpc-scale
    // minimum like the galaxy / structure helpers apply.
    const marsRadiusM = bodyFootprintRadiusM(findByIdOrThrow(SCENE_BODIES, 'mars', 'test'));
    const earth = focusFraming(bodyRow(), FOVY).distance;
    const mars = focusFraming(bodyRow({ id: 'mars', label: 'Mars' }), FOVY).distance;
    expect(mars / earth).toBeCloseTo(marsRadiusM / EARTH_RADIUS_M, 10);
    // Sanity of the regime: framing Earth lands within a handful of Earth
    // radii, i.e. far below any Mpc-scale clamp floor.
    const earthRadiusMpc = EARTH_RADIUS_M * SCALE_UNITS.M_TO_MPC;
    expect(earth).toBeGreaterThan(earthRadiusMpc);
    expect(earth).toBeLessThan(100 * earthRadiusMpc);
  });

  it('body arm — radius is the physical radius in Mpc (a real pass-by extent)', () => {
    const result = focusFraming(bodyRow(), FOVY);
    expect(result.radius).toBeCloseTo(EARTH_RADIUS_M * SCALE_UNITS.M_TO_MPC, 20);
  });

  it('body arm — focusDistanceRadii override lands at a fixed radius multiple, bypassing screen-fill', () => {
    // Sgr A*'s arrival distance is an r_s count the user framed live, not a
    // FOV-dependent viewport fraction — this pins that the override replaces
    // bodyFocusDistance's tan(fovY/2) math rather than merely scaling it. The
    // multiple rides the SEED, so the row no longer carries it.
    const radiusMpc = SGR_A_STAR.radiusM * SCALE_UNITS.M_TO_MPC;
    const row = bodyRow({ id: SGR_A_STAR.id, label: SGR_A_STAR.label });
    const result = focusFraming(row, FOVY);
    expect(result.distance).toBe(radiusMpc * SGR_A_STAR.focusDistanceRadii!);
    expect(result.distance).not.toBe(bodyFocusDistance(radiusMpc, FOVY));
  });

  it('body arm — focusDistanceRadii override is independent of FOV', () => {
    const row = bodyRow({ id: SGR_A_STAR.id, label: SGR_A_STAR.label });
    const atFovA = focusFraming(row, 0.5).distance;
    const atFovB = focusFraming(row, 1.4).distance;
    expect(atFovA).toBe(atFovB);
  });

  it('body arm — target is a fresh array, not aliased from positionMpc', () => {
    const row = bodyRow();
    const result = focusFraming(row, FOVY);
    expect(result.target).not.toBe(row.positionMpc);
    expect(result.target).toEqual(row.positionMpc);
  });

  // ── shared body/star framing (bodyLikeFraming) ───────────────────────────────

  it('frames a star and a body identically for equal position + radius', () => {
    // Star and body rows differ in shape (the essential asymmetry the switch
    // keeps), but both delegate their framing to the one bodyLikeFraming helper.
    // Given the same position + physical radius they must yield the same pose —
    // pinning that the two arms share a single framing body, not two drifting copies.
    const positionMpc: Vec3 = [4.8481e-12, 0, 0];
    // The Sun is the one seeded body whose radius is the star arm's stamped
    // nominal radius, so the two arms are comparable without a fabricated row.
    const radiusM = SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M;
    const bodyResult = focusFraming({ type: 'body', id: 'sun', label: 'Sun', positionMpc }, FOVY);
    const starResult = focusFraming(
      { type: 'star', index: 3, positionMpc, absMag: 4, bpRp: 0.5, radiusM },
      FOVY,
    );
    expect(starResult).toEqual(bodyResult);
  });
});
