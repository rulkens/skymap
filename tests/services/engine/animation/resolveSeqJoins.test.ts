import { describe, it, expect } from 'vitest';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import {
  tween,
  dollyTo,
  spin,
  seq,
  all,
  flyPath,
  atPoint,
} from '../../../../src/services/engine/animation/effectHelpers';
import { asSceneBodyId } from '../../../../src/utils/scene/asSceneBodyId';
import type { ClipData } from '../../../../src/@types/animation/ClipData';

const START = { target: [0, 0, 0] as [number, number, number], yaw: 0, pitch: 0, distance: 100 };
const compile = (timeline: ClipData['timeline']) => compileClip({ start: START, timeline });

describe('resolveSeqJoins', () => {
  it.each<[string, ClipData['timeline'], RegExp]>([
    [
      'a flyPath overlapping a dollyTo',
      [
        seq([flyPath([atPoint([10, 0, 0], 10)], { over: 4, linger: 0 }), dollyTo(50, 4)], {
          overlap: 1,
        }),
      ],
      /composite move/,
    ],
    [
      'a zero-length step between two dolly steps',
      [seq([dollyTo(400, 4), dollyTo(300, 0), dollyTo(200, 4)], { overlap: 2 })],
      /ends at 2s, before/,
    ],
    [
      'a looping spin followed by a yaw tween',
      [
        seq([spin('yaw', { by: 1, over: 4, loop: true }), tween('yaw', { to: 1, over: 4 })], {
          overlap: 1,
        }),
      ],
      /looping spin/,
    ],
    [
      'an incoming dolly that ends before the outgoing one',
      [
        seq([dollyTo(400, 4), all([dollyTo(200, 1), spin('yaw', { by: 1, over: 4 })])], {
          overlap: 2,
        }),
      ],
      /ends at 3s, before/,
    ],
    [
      'a body-framed set crossfading into an absolute one',
      [
        seq(
          [
            tween('distance', { to: 5e6, over: 4, frame: { body: asSceneBodyId('earth') } }),
            dollyTo(100, 4),
          ],
          { overlap: 2 },
        ),
      ],
      /crosses a frame change/,
    ],
  ])('throws on %s', (_name, timeline, reason) => {
    expect(() => compile(timeline)).toThrow(/seq at 0s, join 1/);
    expect(() => compile(timeline)).toThrow(reason);
  });

  it('channels on different steps run together', () => {
    const clip = compile([seq([dollyTo(400, 4), spin('yaw', { by: 1, over: 4 })], { overlap: 1 })]);
    const segs = Object.values(clip.baseTracks).flat();
    expect(segs).toHaveLength(2);
    expect(segs.every((s) => s.blendIn === undefined)).toBe(true);
  });
});
