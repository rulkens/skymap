/**
 * pivotRadiusMpc — which focus rows give the zoom clamp a surface to stand off.
 *
 * The split is the point: a body / star is a surface the camera can crash into,
 * so it yields a radius; a galaxy, structure, or the Milky Way is a volume the
 * camera flies INTO, so it must yield `null` and leave the focus tween on the
 * absolute floor. Getting the galaxy arm wrong would ratchet every galaxy focus
 * outward by its own half-diameter — the invariant `clampDistance`'s docblock
 * exists to protect.
 */

import { describe, it, expect } from 'vitest';

import {
  pivotRadiusMpc,
  pivotFraming,
  SURFACELESS_FLOOR_MPC,
} from '../../../../src/services/engine/camera/pivotRadiusMpc';
import {
  MIN_DISTANCE_MPC,
  SURFACE_STANDOFF_RADII,
} from '../../../../src/utils/camera/clampDistance';
import { MIN_NEAR_MPC } from '../../../../src/utils/camera/foregroundFrustum';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { makeGalaxyRow } from '../../../fixtures/makeGalaxyRow';
import { SGR_A_STAR } from '../../../../src/data/bodies/sceneSgrAStar';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import { findByIdOrThrow } from '../../../../src/utils/object/findByIdOrThrow';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';

const EARTH_ROW: SelectionRow = {
  type: 'body',
  id: 'earth',
  label: 'Earth',
  positionMpc: [0, 0, 0],
};

describe('pivotRadiusMpc', () => {
  it('converts a body row’s radius to Mpc', () => {
    expect(pivotRadiusMpc(EARTH_ROW)).toBeCloseTo(6371 * SCALE_UNITS.KM_TO_MPC, 30);
  });

  it('gives a star row its stamped radius too — same near-field discrete case', () => {
    const star: SelectionRow = {
      type: 'star',
      index: 7,
      positionMpc: [1, 2, 3],
      absMag: 4,
      bpRp: 0.6,
      radiusM: 696340000,
    };
    expect(pivotRadiusMpc(star)).toBeCloseTo(696340 * SCALE_UNITS.KM_TO_MPC, 30);
  });

  it('yields null for a galaxy — a volume flown into, never a floor', () => {
    // A galaxy's half-diameter is Mpc-scale; treating it as a standoff radius
    // would push every galaxy focus tween back out past its own end distance.
    expect(pivotRadiusMpc(makeGalaxyRow({ diameterKpc: 30 }))).toBeNull();
  });

  it('yields null for the Milky Way and for no focus at all', () => {
    expect(pivotRadiusMpc({ type: 'milkyWay' })).toBeNull();
    expect(pivotRadiusMpc(null)).toBeNull();
  });
});

describe('pivotFraming', () => {
  it('floors a body row at the global ratio when it carries no override', () => {
    expect(pivotFraming(EARTH_ROW).floorMpc).toBeCloseTo(
      6371 * SCALE_UNITS.KM_TO_MPC * SURFACE_STANDOFF_RADII,
      30,
    );
  });

  it('floors a body row at its own override — Sgr A’s Q10 descent floor (2 r_s)', () => {
    // Far outside the Earth-tuned global ratio, so a body that opts in must be
    // floored at ITS OWN multiple, not the shared constant.
    const sgrAStar: SelectionRow = {
      type: 'body',
      id: 'sgr-a-star',
      label: 'Sagittarius A*',
      positionMpc: [0, 0, 0],
    };
    const radiusMpc = SGR_A_STAR.radiusM * SCALE_UNITS.M_TO_MPC;
    expect(pivotFraming(sgrAStar)).toEqual({
      radiusMpc,
      floorMpc: radiusMpc * SGR_A_STAR.standoffRadii!,
    });
    expect(SGR_A_STAR.standoffRadii).toBe(2.0); // the override, not the shared constant
  });

  it('a mesh body reports NO surface radius, and floors on its bounding sphere', () => {
    // Two halves of one rule. The null is the currency fix: the zoom taper and
    // the h/R readouts anchor on `radiusMpc`, and a bake hull is not ground to
    // measure an altitude over. The floor is the wheel-zoom snap regression:
    // the whale must keep the standoff the fly-to landed against instead of
    // being flung out to the backstop.
    const whale: SelectionRow = {
      type: 'body',
      id: 'whale',
      label: 'Whale',
      positionMpc: [0, 0, 0],
    };
    const seed = findByIdOrThrow(SCENE_MESH_BODIES, 'whale', 'test');
    expect(pivotFraming(whale).radiusMpc).toBeNull();
    expect(pivotFraming(whale).floorMpc).toBeCloseTo(
      seed.boundingRadiusM * seed.standoffRadii * SCALE_UNITS.M_TO_MPC,
      30,
    );
    expect(pivotFraming(whale).floorMpc).toBeGreaterThan(MIN_DISTANCE_MPC);
  });

  it('falls through to the global ratio for a star, and to the absolute floor for a galaxy / no focus', () => {
    const star: SelectionRow = {
      type: 'star',
      index: 7,
      positionMpc: [1, 2, 3],
      absMag: 4,
      bpRp: 0.6,
      radiusM: 696340000,
    };
    expect(pivotFraming(star).floorMpc).toBeCloseTo(
      696340 * SCALE_UNITS.KM_TO_MPC * SURFACE_STANDOFF_RADII,
      30,
    );
    expect(pivotFraming(makeGalaxyRow({ diameterKpc: 30 }))).toEqual({
      radiusMpc: null,
      floorMpc: SURFACELESS_FLOOR_MPC,
    });
    expect(pivotFraming(null)).toEqual({ radiusMpc: null, floorMpc: SURFACELESS_FLOOR_MPC });
  });

  it('keeps a surfaceless pivot outside the near plane', () => {
    // A galaxy has no radius to stand off from, so nothing but this floor stops
    // the wheel pulling the target through `MIN_NEAR_MPC`, where it vanishes.
    // The metre-scale mesh bodies dragged the absolute floor down to ~3 cm,
    // which is BELOW the near plane — this is what keeps them apart.
    expect(pivotFraming(makeGalaxyRow({ diameterKpc: 30 })).floorMpc).toBeGreaterThan(MIN_NEAR_MPC);
    expect(pivotFraming(null).floorMpc).toBeGreaterThan(MIN_NEAR_MPC);
  });
});
