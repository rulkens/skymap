/**
 * A planet on a sampled position is absent outside its track, and its snapshot position (held at
 * the first sample) would otherwise draw and occlude a body that is not there yet.
 */

import { describe, expect, it, vi } from 'vitest';

// A planet-class body on a sampled position: no such body ships yet.
vi.mock('../../../../src/data/bodies/sampledBodies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/data/bodies/sampledBodies')>();
  return { SAMPLED_BODIES: [...actual.SAMPLED_BODIES, { id: 'fixture-planet' }] };
});
vi.mock('../../../../src/data/bodies/scenePlanets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/data/bodies/scenePlanets')>();
  const mars = actual.SCENE_PLANETS.find((body) => body.id === 'mars')!;
  return { SCENE_PLANETS: [...actual.SCENE_PLANETS, { ...mars, id: 'fixture-planet' }] };
});

import { deriveFrameContext } from '../../../../src/services/engine/frame/frameContext';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
import { absoluteArm } from '../../../../src/utils/camera/arms/absoluteArm';
import { datumOnlyTerrainHeight } from '../../../../src/utils/camera/terrain/datumOnlyTerrainHeight';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../../src/@types/camera/pose/CameraPose';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };
const STATE = {
  booted: true,
  gpu: { galaxyPointRenderer: {}, galaxyPickRenderer: {}, renderTargets: {}, compositor: {} },
  terrainHeightAt: datumOnlyTerrainHeight,
  subsystems: { texturedDisks: {} },
  slabRows: [],
  visibilityEntries: [],
} as unknown as EngineState;

const FIRST = CONST_J2000 + 100;
trajectoryRegistry.set({
  id: 'fixture-planet',
  tDays: Float64Array.of(FIRST, FIRST + 10),
  posKm: Float64Array.of(2e8, 0, 0, 2e8, 1e7, 0),
  velKmS: Float32Array.of(0, 10, 0, 0, 10, 0),
});

const sceneBodyIdsAt = (simDays: number): string[] => {
  const ctx = deriveFrameContext(STATE, {
    cam: assembleOrbitCamera(
      POSE,
      { fovYRad: 1, aspect: 1, near: 0.1, far: 1e4 },
      IDENTITY,
      IDENTITY,
    ),
    arm: absoluteArm(POSE),
    altitudeMpc: POSE.distance,
    nowMs: 0,
    simDays,
    bodyStates: deriveBodyStates(simDays),
  });
  if (!ctx.isReady) throw new Error('fixture not ready');
  return ctx.sceneBodies.map(({ body }) => body.id);
};

describe('deriveFrameContext — planet presence', () => {
  it('an absent sampled planet is not in the frame’s planets', () => {
    expect(sceneBodyIdsAt(CONST_J2000)).not.toContain('fixture-planet');
    expect(sceneBodyIdsAt(FIRST + 5)).toContain('fixture-planet');
    expect(sceneBodyIdsAt(FIRST + 20)).not.toContain('fixture-planet');
  });
});
