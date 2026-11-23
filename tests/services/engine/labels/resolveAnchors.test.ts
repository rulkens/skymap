/**
 * The frame's body map is total (a craft before launch is parked on Earth), so a craft caption
 * must wait for the frame to admit its mesh body, or it names a craft that is not there.
 */

import { describe, expect, it } from 'vitest';

import { resolveAnchors } from '../../../../src/services/engine/labels/resolveAnchors';
import { createLabelFrame } from '../../../../src/services/engine/labels/createLabelFrame';
import { SCENE_MESH_BODIES } from '../../../../src/data/bodies/sceneMeshBodies';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import { stageInputs, stageRecords } from '../../../helpers/labels/labelStageFixture';

describe('resolveAnchors', () => {
  it('leaves a mesh body the frame does not admit unlocated', () => {
    const craft = SCENE_MESH_BODIES[0]!;
    const records = stageRecords([
      { text: 'A', position: { anchorId: craft.id } },
      { text: 'A', position: { anchorId: 'earth' } },
    ]);
    const parked = { positionMpc: [0, 0, -1] } as BodyState;
    const bodyStates = new Map([
      [craft.id, parked],
      ['earth', parked],
    ]);
    const frame = createLabelFrame(16);

    resolveAnchors(records, frame, stageInputs({ bodyStates }));
    expect([frame.located[0], frame.located[1]]).toEqual([0, 1]);

    resolveAnchors(records, frame, stageInputs({ bodyStates, meshBodies: [craft] }));
    expect(frame.located[0]).toBe(1);
  });
});
