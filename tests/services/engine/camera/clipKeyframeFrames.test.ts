/**
 * Frame-tagged keyframes (spec §8): a `set`/`setVec` endpoint names the frame
 * its `to` is read in, interpolation runs in that frame, and a leg whose
 * endpoints disagree converts its start ONCE.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  evaluateClip,
  evaluateFramedClip,
} from '../../../../src/services/engine/camera/evaluateClip';
import {
  all,
  dollyTo,
  moveTarget,
  seq,
  tween,
} from '../../../../src/services/engine/animation/effectHelpers';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { clipRegistry } from '../../../../src/data/animation/clips/clipRegistry';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

vi.mock('../../../../src/services/engine/camera/clipFrameChannels', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../src/services/engine/camera/clipFrameChannels')
    >();
  return { ...actual, toBodyFixedChannels: vi.fn(actual.toBodyFixedChannels) };
});
import { toBodyFixedChannels } from '../../../../src/services/engine/camera/clipFrameChannels';

const EARTH = { body: 'earth' as BodyId };
const BODIES = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
const START: CameraPose = { target: [0, 0, 0], yaw: 0.5, pitch: 0.2, distance: 10 };

/**
 * Both channels open on a zero-length body-framed endpoint, so the leg's own
 * first value is authored rather than converted — which is what lets the
 * midpoint below be hand-computed independently of the conversion.
 */
function earthFramedClip(): ClipData {
  return {
    start: START,
    timeline: [
      all([
        seq([
          moveTarget([0, 0, 7e6], 0, 'linear', EARTH),
          moveTarget([0, 0, 9e6], 4, 'linear', EARTH),
        ]),
        seq([
          tween('distance', { to: 1e6, over: 0, frame: EARTH }),
          tween('distance', { to: 3e6, over: 4, frame: EARTH }),
        ]),
      ]),
    ],
  };
}

describe('frame-tagged keyframes', () => {
  it('an untagged endpoint parses as absolute', () => {
    const data: ClipData = { start: START, timeline: [dollyTo(100, 2)] };

    const framed = evaluateFramedClip(data, 1);

    expect(framed.frame).toBe('absolute');
    // The legacy path is untouched, not merely re-labelled.
    expect(framed.channels).toEqual(evaluateClip(data, 1));
  });

  it('a leg with disagreeing endpoints converts its start once, at leg start', () => {
    const data = earthFramedClip();
    const playback = {};
    vi.mocked(toBodyFixedChannels).mockClear();

    for (const t of [0, 0.5, 1, 2, 3, 4]) {
      evaluateFramedClip(data, t, { bodies: BODIES, playback });
    }

    expect(toBodyFixedChannels).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toBodyFixedChannels).mock.calls[0]![1]).toBe('earth');
  });

  it('a body-framed leg interpolates in body-fixed metres', () => {
    const framed = evaluateFramedClip(earthFramedClip(), 2, { bodies: BODIES, playback: {} });

    expect(framed.frame).toEqual(EARTH);
    // Linear midpoint of 7,000 km and 9,000 km along the body's own +Z.
    expect(framed.channels.target).toEqual([0, 0, 8e6]);
    // `distance` is a range in metres, interpolated in the channel's log space:
    // √(1e6 · 3e6) = 1e6·√3.
    expect(framed.channels.distance).toBeCloseTo(1e6 * Math.SQRT2 * Math.sqrt(1.5), 3);
  });

  it("no existing clip's evaluated pose changes", () => {
    // Pinned from `cosmicFlows` before frames existed — the registry is entirely
    // untagged, so a frame-aware evaluator must reproduce it to the bit.
    const expected = [
      { target: [0, -0.01, 0], yaw: -1.7455, pitch: -0.3589, distance: 0.14 },
      {
        target: [0, -0.01, 0],
        yaw: -1.4081164537941397,
        pitch: -0.2757508420739842,
        distance: 0.22610757481935573,
      },
      {
        target: [0, -0.01, 0],
        yaw: -0.6582842468215864,
        pitch: -0.42253961030678927,
        distance: 300,
      },
      {
        target: [0, -0.01, 0],
        yaw: -0.46050000000000013,
        pitch: -0.39334150891285813,
        distance: 950,
      },
      {
        target: [0, -0.01, 0],
        yaw: -0.33550000000000013,
        pitch: -0.26890000000000003,
        distance: 950,
      },
    ];
    const { data } = clipRegistry.cosmicFlows;

    const actual = [0, 0.25, 0.5, 0.75, 1].map((f) => evaluateFramedClip(data, f * 20));

    expect(actual.map((a) => a.frame)).toEqual(Array(5).fill('absolute'));
    expect(actual.map((a) => a.channels)).toEqual(expected);
  });
});
