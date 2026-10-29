/**
 * BODY_SLAB_ROWS — the two radii are DIFFERENT facts for a shelled body, and
 * the row is what both culls and the near plane read, so a row collapsing
 * them would shrink Saturn's rings out of the cull without any type error.
 */

import { describe, it, expect } from 'vitest';

import { BODY_SLAB_ROWS } from '../../../../src/layers/body/present/bodySlabRows';
import { bodyDrawRadiusM } from '../../../../src/layers/body/present/bodyDrawRadiusM';
import { SCENE_PLANETS } from '../../../../src/data/bodies/scenePlanets';
import { bodyFootprintRadiusM } from '../../../../src/utils/scene/bodyFootprintRadiusM';
import { bodySlabRowOf } from '../../../../src/utils/scene/bodySlabRowOf';
import { slabRowActive } from '../../../../src/utils/frame/slabRowActive';
import { HOSTLESS_MESH_BODIES } from '../../../../src/data/bodies/hostlessMeshBodies';
import { FOREGROUND_MAX_DISTANCE_MPC } from '../../../../src/data/rendering/foregroundMaxDistance';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import { IDENTITY_MAT3 } from '../../../../src/utils/math/identityMat3';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { SlabRow } from '../../../../src/@types/engine/frame/SlabRow';

describe('BODY_SLAB_ROWS', () => {
  it("carries Saturn's ring-inclusive draw radius apart from its footprint", () => {
    const saturn = SCENE_PLANETS.find((planet) => planet.id === 'saturn');
    const row = BODY_SLAB_ROWS.find((candidate) => candidate.anchorId === 'saturn');
    if (saturn === undefined || row === undefined) throw new Error('no saturn row');

    expect(row.footprintRadiusM).toBe(bodyFootprintRadiusM(saturn));
    expect(row.drawRadiusM(1e12, 1000)).toBe(bodyDrawRadiusM(saturn));
    expect(row.drawRadiusM(1e12, 1000)).toBeGreaterThan(row.footprintRadiusM);
  });

  it('every body slab row is active at 1 AU and inactive at the foreground cutoff', () => {
    // Past the cutoff no body slab exists, which is the only thing keeping the body
    // passes off at galaxy zoom; a hostless craft's row must yield on the same terms.
    const hostless = HOSTLESS_MESH_BODIES[0];
    if (hostless === undefined) throw new Error('no hostless mesh body');
    const rows: readonly SlabRow[] = [...BODY_SLAB_ROWS, bodySlabRowOf(hostless)];
    const anchorMpc = [1, 2, 3] as const;
    const eyeAt = (offsetMpc: number) =>
      [anchorMpc[0] + offsetMpc, anchorMpc[1], anchorMpc[2]] as const;

    for (const row of rows) {
      const states = new Map<string, BodyState>([
        [row.anchorId, { positionMpc: [...anchorMpc], orientation: [...IDENTITY_MAT3] }],
      ]);
      expect(slabRowActive(row, eyeAt(SCALE_UNITS.AU_TO_MPC), states), row.anchorId).toBe(true);
      expect(slabRowActive(row, eyeAt(FOREGROUND_MAX_DISTANCE_MPC), states), row.anchorId).toBe(
        false,
      );
    }
  });
});
