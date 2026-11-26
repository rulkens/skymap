/**
 * The frame's body map is total (an absent body is parked somewhere), so a caption must wait for
 * its body to be present, or it names a body that is not there.
 */

import { describe, expect, it, vi } from 'vitest';

// A planet-class body on a sampled position: no such body ships yet.
vi.mock('../../../../src/data/bodies/sampledBodies', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/data/bodies/sampledBodies')>();
  return { SAMPLED_BODIES: [...actual.SAMPLED_BODIES, { id: 'fixture-planet' }] };
});

import { resolveAnchors } from '../../../../src/services/engine/labels/resolveAnchors';
import { createLabelFrame } from '../../../../src/services/engine/labels/createLabelFrame';
import { trajectoryRegistry } from '../../../../src/services/bodies/trajectoryRegistry';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import { stageInputs, stageRecords } from '../../../helpers/labels/labelStageFixture';

describe('resolveAnchors', () => {
  it('a caption anchored on an absent planet is dropped', () => {
    const records = stageRecords([
      { text: 'A', position: { anchorId: 'fixture-planet' } },
      { text: 'A', position: { anchorId: 'earth' } },
    ]);
    const parked = { positionMpc: [0, 0, -1] } as BodyState;
    const bodyStates = new Map([
      ['fixture-planet', parked],
      ['earth', parked],
    ]);
    const frame = createLabelFrame(16);

    resolveAnchors(records, frame, stageInputs({ bodyStates, simDays: 0 }));
    expect([frame.located[0], frame.located[1]]).toEqual([0, 1]);

    trajectoryRegistry.set({
      id: 'fixture-planet',
      tDays: Float64Array.of(-1, 1),
      posKm: Float64Array.of(1e8, 0, 0, 1e8, 1e6, 0),
      velKmS: Float32Array.of(0, 1, 0, 0, 1, 0),
    });
    resolveAnchors(records, frame, stageInputs({ bodyStates, simDays: 0 }));
    expect(frame.located[0]).toBe(1);
  });
});
