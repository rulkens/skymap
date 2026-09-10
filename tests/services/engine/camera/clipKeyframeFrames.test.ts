/**
 * Frame-tagged keyframes (spec §8): a `set`/`setVec` endpoint names the frame
 * its `to` is read in, interpolation runs in that frame, and a leg whose
 * endpoints disagree converts its start ONCE.
 */

import { describe, it, expect, vi } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { evaluateFramedClip } from '../../../../src/services/engine/camera/evaluateClip';
import {
  all,
  dollyTo,
  moveTarget,
  seq,
  spin,
  tween,
} from '../../../../src/services/engine/animation/effectHelpers';
import { CAMERA_DRIVERS } from '../../../../src/services/engine/camera/cameraDrivers';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { decodeBodyFixedChannels } from '../../../../src/utils/camera/decodeBodyFixedChannels';
import { eyeMpcOf } from '../../../../src/utils/camera/eyeMpcOf';
import { yawPitchToDir } from '../../../../src/utils/camera/yawPitchToDir';
import { rotateVec3ByTightMat3 } from '../../../../src/utils/math/rotateVec3ByTightMat3';
import { makeDriverCtx } from '../../../helpers/camera/makeDriverCtx';
import { rootReducer } from '../../../../src/store/rootReducer';
import { clipStarted } from '../../../../src/state/camera/cameraSlice';
import { DEFAULT_ORIENTATION } from '../../../../src/data/defaults';
import { ORIENTATION_FRAMES } from '../../../../src/data/orientation/orientationFrames';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { BodyId } from '../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { ClipData } from '../../../../src/@types/animation/ClipData';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { RootState } from '../../../../src/store/types';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

vi.mock('../../../../src/services/engine/camera/clipFrameChannels', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../src/services/engine/camera/clipFrameChannels')
    >();
  return { ...actual, toBodyFixedChannels: vi.fn(actual.toBodyFixedChannels) };
});
import {
  fromBodyFixedChannels,
  toBodyFixedChannels,
} from '../../../../src/services/engine/camera/clipFrameChannels';

const EARTH = { body: 'earth' as BodyId };
const BODIES = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
const BASIS = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const START: CameraPose = { target: [0, 0, 0], yaw: 0.5, pitch: 0.2, distance: 10 };

function opts(playback: object = {}) {
  return { bodies: BODIES, frameBasis: BASIS, playback };
}

/**
 * Both channels open on a zero-length body-framed endpoint, so the leg's own
 * first value is authored rather than converted — which is what lets the
 * midpoint below be hand-computed independently of the conversion.
 */
function earthLeg(): ClipData['timeline'][number] {
  return all([
    seq([moveTarget([0, 0, 7e6], 0, 'linear', EARTH), moveTarget([0, 0, 9e6], 4, 'linear', EARTH)]),
    seq([
      tween('distance', { to: 1e6, over: 0, frame: EARTH }),
      tween('distance', { to: 3e6, over: 4, frame: EARTH }),
    ]),
  ]);
}

function earthFramedClip(): ClipData {
  return { start: START, timeline: [earthLeg()] };
}

/** The world aim (target → eye is its negation) an absolute pose encodes. */
function aimOf(pose: CameraPose): Vec3 {
  const dir = rotateVec3ByTightMat3(yawPitchToDir(pose.yaw, pose.pitch), BASIS);
  return [-dir[0], -dir[1], -dir[2]];
}

describe('frame-tagged keyframes', () => {
  it('an untagged endpoint parses as absolute', () => {
    const data: ClipData = { start: START, timeline: [dollyTo(100, 2)] };

    expect(evaluateFramedClip(data, 1).frame).toBe('absolute');
  });

  it('a leg with disagreeing endpoints converts its start once, at leg start', () => {
    const data = earthFramedClip();
    const playback = {};
    vi.mocked(toBodyFixedChannels).mockClear();

    for (const t of [0, 0.5, 1, 2, 3, 4]) {
      evaluateFramedClip(data, t, opts(playback));
    }

    expect(toBodyFixedChannels).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toBodyFixedChannels).mock.calls[0]![1]).toBe('earth');
  });

  it('a body-framed leg interpolates in body-fixed metres', () => {
    const framed = evaluateFramedClip(earthFramedClip(), 2, opts());

    expect(framed.frame).toEqual(EARTH);
    // Linear midpoint of 7,000 km and 9,000 km along the body's own +Z.
    expect(framed.channels.target).toEqual([0, 0, 8e6]);
    // `distance` is a range in metres, interpolated in the channel's log space:
    // √(1e6 · 3e6) = 1e6·√3.
    expect(framed.channels.distance).toBeCloseTo(1e6 * Math.SQRT2 * Math.sqrt(1.5), 3);
  });

  it('a relative spin does not end the body leg it runs inside', () => {
    const data: ClipData = {
      start: START,
      timeline: [earthLeg(), spin('yaw', { by: Math.PI, over: 4 })],
    };

    expect(evaluateFramedClip(data, 1, opts()).frame).toEqual(EARTH);
    expect(evaluateFramedClip(data, 6, opts()).frame).toEqual(EARTH);
  });

  it("a leg's start converts with its OWN final values, not the next leg's opening cut", () => {
    // The cut is zero-length and absolute, so it opens the absolute leg AT the
    // instant the body leg ends: folding its 50 Mpc into the pose handed to the
    // conversion would read it as 50 metres of range.
    const data: ClipData = { start: START, timeline: [earthLeg(), dollyTo(50, 0)] };
    const openingAngles = toBodyFixedChannels(START, 'earth', BODIES, BASIS);
    const expected = fromBodyFixedChannels(
      {
        target: [0, 0, 9e6],
        yaw: openingAngles.yaw,
        pitch: openingAngles.pitch,
        distance: 3e6,
      },
      'earth',
      BODIES,
      BASIS,
    );

    const framed = evaluateFramedClip(data, 4, opts());

    expect(framed.frame).toBe('absolute');
    expect(framed.channels.target).toEqual(expected.target);
  });

  it('absolute → body → absolute keeps the eye and the aim', () => {
    const pose: CameraPose = {
      target: BODIES.get('earth' as BodyId)!.positionMpc,
      yaw: 0.9,
      pitch: -0.3,
      distance: 3e-10,
    };

    const back = fromBodyFixedChannels(
      toBodyFixedChannels(pose, 'earth', BODIES, BASIS),
      'earth',
      BODIES,
      BASIS,
    );

    const [ex, ey, ez] = eyeMpcOf(pose, BASIS);
    const [bx, by, bz] = eyeMpcOf(back, BASIS);
    // Relative to the range, so the tolerance means something at this scale.
    expect(Math.hypot(bx - ex, by - ey, bz - ez) / pose.distance).toBeLessThan(1e-9);
    const a = aimOf(pose);
    const b = aimOf(back);
    expect(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).toBeCloseTo(1, 12);
  });

  it('the clip driver hands out a decoded body arm, never a re-encoded absolute one', () => {
    const store = configureStore({ reducer: rootReducer });
    const data = earthFramedClip();
    store.dispatch(clipStarted({ data, frame: DEFAULT_ORIENTATION }));
    const state = store.getState() as unknown as RootState;
    const clipRow = CAMERA_DRIVERS.find((d) => d.id === 'clip')!;

    const { pose } = clipRow.pose(makeDriverCtx({ state, elapsedMs: 2000, bodies: BODIES }), null);

    expect(pose.frame).toEqual(EARTH);
    // The same LookAt decode the evaluator's channels imply — body-fixed metres,
    // with no orientation re-encode applied to them on the way out.
    const channels = evaluateFramedClip(data, 2, opts(state.camera.clip!)).channels;
    expect(pose.pose).toEqual(decodeBodyFixedChannels(channels, 'earth'));
  });
});
