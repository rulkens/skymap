import { describe, expect, it } from 'vitest';

import { canvasViewOf } from '../../../helpers/frame/canvasViewOf';
import { assembleOrbitCamera } from '../../../../src/services/engine/camera/assembleOrbitCamera';
import { sceneBodyPartition } from '../../../../src/services/engine/frame/sceneBodyPartition';
import { sceneBodyLabels } from '../../../../src/services/engine/presentation/sceneBodyLabels';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
import { absoluteArm } from '../../../../src/utils/camera/absoluteArm';
import { SCENE_EARTH } from '../../../../src/data/bodies/sceneEarth';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { Mat3 } from '../../../../src/@types/math/Mat3';

// One module instance per test file, so the registry set here stays out of the main suite.
const T0 = 2444000.5;
const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const STATE = {
  booted: true,
  gpu: {
    galaxyPointRenderer: {},
    galaxyPickRenderer: {},
    renderTargets: {},
    compositor: {},
    texturedBodyRenderer: null,
  },
  subsystems: { texturedDisks: {} },
  selectionRows: { hover: null, select: null, focus: null },
  slabRows: [],
  data: { bodies: { earth: SCENE_EARTH, planets: [], meshBodies: SCENE_MESH_BODIES } },
  settings: {
    starCatalogs: { enabled: false, items: { famousStar: { enabled: false } } },
    bodies: { items: {} },
  },
  picking: { pickInFlight: false, pointerDown: false, cursorTexPx: null },
} as unknown as EngineState;

const POSE: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1e-9 };

const viewAt = (simDays: number) =>
  canvasViewOf(
    STATE,
    {
      cam: assembleOrbitCamera(
        POSE,
        { fovYRad: 1, aspect: 16 / 9, near: 0.1, far: 10000 },
        IDENTITY,
        IDENTITY,
      ),
      arm: absoluteArm(POSE),
      altitudeMpc: POSE.distance,
      nowMs: 0,
      simDays,
      visibleSourceMask: 0,
    },
    { width: 1920, height: 1080 },
  )!;

const drawnIds = (simDays: number): string[] => {
  const view = viewAt(simDays);
  const { glints, meshes } = sceneBodyPartition(STATE as never, view);
  return [...glints, ...meshes].map((body) => body.id);
};
const labelIds = (simDays: number): string[] =>
  sceneBodyLabels(deriveBodyStates(simDays), simDays).map((label) => label.id);

describe('spacecraft presence', () => {
  it('an absent craft is in neither glints nor meshes and has no label', () => {
    expect(drawnIds(T0 + 5)).not.toContain('voyager1');
    expect(labelIds(T0 + 5)).not.toContain('sceneBody-voyager1');
  });

  it('a present craft is', () => {
    trajectoryRegistry.set({
      id: 'voyager1',
      tDays: Float64Array.from([T0, T0 + 10]),
      posKm: Float64Array.from([1e9, 0, 0, 1e9, 0, 0]),
      velKmS: new Float32Array(6),
    });
    expect(viewAt(T0 + 5).snapshot.meshBodies.map((b) => b.id)).toContain('voyager1');
    expect(labelIds(T0 + 5)).toContain('sceneBody-voyager1');
    // Before the first sample the track exists but the craft does not.
    expect(viewAt(T0 - 1).snapshot.meshBodies.map((b) => b.id)).not.toContain('voyager1');
    expect(drawnIds(T0 - 1)).not.toContain('voyager1');
    expect(labelIds(T0 - 1)).not.toContain('sceneBody-voyager1');
  });
});
