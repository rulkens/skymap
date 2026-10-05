import { describe, expect, it } from 'vitest';

import { sceneBodyPartition } from '../../../../src/services/engine/frame/sceneBodyPartition';
import { sceneBodyLabels } from '../../../../src/services/engine/presentation/sceneBodyLabels';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import type { FrameView } from '../../../../src/@types/engine/frame/FrameView';
import type { PassState } from '../../../../src/@types/engine/frame/PassState';

// One module instance per test file, so the registry set here stays out of the main suite.
const T0 = 2444000.5;

const state = {
  data: { bodies: { planets: [], meshBodies: SCENE_MESH_BODIES } },
  gpu: {},
} as unknown as PassState;

const ctxAt = (simDays: number): FrameView =>
  ({
    snapshot: { simDays },
    drawCamPos: [0, 0, 0],
    drawPxPerRad: 1000,
  }) as unknown as FrameView;

const drawnIds = (simDays: number): string[] => {
  const { glints, meshes } = sceneBodyPartition(state, ctxAt(simDays));
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
    expect(drawnIds(T0 + 5)).toContain('voyager1');
    expect(labelIds(T0 + 5)).toContain('sceneBody-voyager1');
    // Before the first sample the track exists but the craft does not.
    expect(drawnIds(T0 - 1)).not.toContain('voyager1');
    expect(labelIds(T0 - 1)).not.toContain('sceneBody-voyager1');
  });
});
