/**
 * Core's, the missions craft and the earthScenes rosters split the body-slab roster between three
 * mesh passes and three glint passes. A body in both draws twice (z-fighting, or a double-bright
 * glint); a body in neither vanishes.
 */

import { describe, expect, it } from 'vitest';

import { positionedBodiesOf } from '../../helpers/frame/positionedBodiesOf';
import { CORE_SCENE_BODY_IDS } from '../../../src/data/bodies/coreSceneBodyIds';
import { bodySlabRosterIds } from '../../../src/services/engine/frame/bodySlabRosterIds';
import { coreSceneBodyPartition } from '../../../src/services/engine/frame/coreSceneBodyPartition';
import { drawableMeshBodies } from '../../../src/services/engine/frame/drawableMeshBodies';
import { sceneBodyPartition } from '../../../src/services/engine/frame/sceneBodyPartition';
import { deriveBodyStates } from '../../../src/services/engine/frame/deriveBodyStates';
import { EARTH_SCENE_BODY_IDS } from '../../../src/data/bodies/earthSceneBodyIds';
import { MISSION_CRAFT_IDS } from '../../../src/layers/missions/present/missionCraftIds';
import { SCENE_MESH_BODIES } from '../../../src/data/bodies/sceneMeshBodies';
import { SCENE_PLANETS } from '../../../src/data/bodies/scenePlanets';
import { SCALE_UNITS } from '../../../src/data/scaleUnits';
import type { FrameView } from '../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../src/@types/engine/frame/PassState';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import { asSceneBodyId } from '../../../src/utils/scene/asSceneBodyId';

const SIM_DAYS = 0;
const STATES = deriveBodyStates(SIM_DAYS);
const STATE = {
  gpu: { meshBodyRenderer: { hasMesh: () => true }, texturedBodyRenderer: null },
} as unknown as PassState;

function ctxAt(camPosMpc: Readonly<Vec3>, pxPerRad: number): FrameView {
  return {
    snapshot: {
      simDays: SIM_DAYS,
      meshBodies: SCENE_MESH_BODIES,
      sceneBodies: positionedBodiesOf([...SCENE_PLANETS, ...SCENE_MESH_BODIES], STATES),
    },
    drawCamPos: camPosMpc,
    drawPxPerRad: pxPerRad,
  } as unknown as FrameView;
}

const idsOf = (bodies: readonly { readonly id: string }[]) => bodies.map((body) => body.id);
const sorted = (ids: readonly string[]) => [...ids].sort();

describe('the core, missions and earthScenes rosters', () => {
  // A telephoto pxPerRad resolves every body on the row, so each one reaches a mesh pass.
  it.each([
    ['mars', 'curiosity'],
    ['earth', 'hubble'],
  ])(
    'every resident mesh body on a host row is drawn by exactly one mesh pass (%s)',
    (hostId, cameraAt) => {
      const ctx = ctxAt(STATES.get(asSceneBodyId(cameraAt))!.positionMpc, 1e12);
      const core = idsOf(drawableMeshBodies(STATE, ctx, hostId, CORE_SCENE_BODY_IDS));
      const missions = idsOf(drawableMeshBodies(STATE, ctx, hostId, MISSION_CRAFT_IDS));
      const whole = idsOf(
        drawableMeshBodies(STATE, ctx, hostId, bodySlabRosterIds(SCENE_MESH_BODIES)),
      );
      const earthScenes = idsOf(drawableMeshBodies(STATE, ctx, hostId, EARTH_SCENE_BODY_IDS));

      expect(missions).toContain(cameraAt);
      expect(core.filter((id) => missions.includes(id))).toEqual([]);
      expect(sorted([...core, ...missions, ...earthScenes])).toEqual(sorted(whole));
    },
  );

  it('every sub-pixel scene body glints in exactly one glint pass', () => {
    const fiveAu: Vec3 = [5 * SCALE_UNITS.AU_TO_MPC, 0, 0];
    const ctx = ctxAt(fiveAu, 1000);
    const core = idsOf(coreSceneBodyPartition(STATE, ctx).glints);
    const missions = idsOf(sceneBodyPartition(STATE, ctx, MISSION_CRAFT_IDS, () => false).glints);
    const earthScenes = idsOf(
      sceneBodyPartition(STATE, ctx, EARTH_SCENE_BODY_IDS, () => false).glints,
    );
    const whole = idsOf(
      sceneBodyPartition(STATE, ctx, bodySlabRosterIds(SCENE_MESH_BODIES), () => false).glints,
    );

    expect(missions.length).toBeGreaterThan(0);
    expect(core.filter((id) => missions.includes(id))).toEqual([]);
    expect(sorted([...core, ...missions, ...earthScenes])).toEqual(sorted(whole));
  });
});
