/**
 * flyToPoseClip — pins that a view's pose reaches the compiled clip without
 * a `FocusId`/catalog lookup, the property that distinguishes it from
 * `flyToClip`.
 */

import { describe, it, expect } from 'vitest';
import type { CameraPose } from '../../../../../src/@types/camera/CameraPose';
import { FLY_TO_POSE_SEC, flyToPoseClip } from '../../../../../src/data/animation/clips/makers/flyToPoseClip';

describe('flyToPoseClip', () => {
  it('targets the pose, including its bearing, without a focus lookup', () => {
    // Arbitrary numbers, not a registry pose — this must not break when the
    // user re-frames a real view's pose.
    const pose: CameraPose = {
      target: [12, -34, 56],
      yaw: 1.25,
      pitch: -0.5,
      distance: 78,
    };

    const clip = flyToPoseClip(pose);

    expect(clip.start).toBe('live');
    const flat = JSON.stringify(clip.timeline);
    expect(flat).toContain(JSON.stringify(pose.target));
    expect(flat).toContain(String(pose.distance));
    expect(flat).toContain(String(pose.yaw));
    expect(flat).toContain(String(pose.pitch));
  });

  // The whole reason the pivot is held back: `distance` interpolates in log
  // space and `target` cannot, so starting them together sends the pivot
  // across a hundred Mpc while the eye is still micro-parsecs from it — the
  // camera is only out past ~30 Mpc in the pull-back's last sixth. The legs
  // overlap so the join doesn't stall, but only there. See the module header.
  it('holds the pivot back until the pull-back is nearly done', () => {
    const pose: CameraPose = { target: [12, -34, 56], yaw: 1.25, pitch: -0.5, distance: 78 };

    const [block, ...rest] = flyToPoseClip(pose).timeline;
    expect(rest).toEqual([]);
    expect(block).toMatchObject({ kind: 'all' });

    // The two legs are the block's children: one writes `distance` from the
    // first frame, the other waits before it touches `target`.
    const legs = (block as { children: unknown[] }).children;
    const pullBack = legs.find((leg) => JSON.stringify(leg).includes(String(pose.distance)));
    const reframe = legs.find((leg) => JSON.stringify(leg).includes(JSON.stringify(pose.target)));
    expect(pullBack).toMatchObject({ kind: 'set', ch: 'distance', over: expect.any(Number) });
    expect(JSON.stringify(pullBack)).not.toContain(JSON.stringify(pose.target));
    expect(JSON.stringify(reframe)).toContain(String(pose.yaw));

    const held = reframe as { children: [{ kind: string; sec: number }, unknown] };
    expect(held.children).toHaveLength(2);
    expect(held.children[0].kind).toBe('wait');
    const pullBackSec = (pullBack as { over: number }).over;
    expect(held.children[0].sec).toBeGreaterThanOrEqual(pullBackSec * 0.8);
    expect(held.children[0].sec).toBeLessThan(pullBackSec);
  });

  // The copy's entrance is timed off this, so a leg-duration edit that didn't
  // reach the exported total would leave the notes arriving early or late.
  it('reports a duration that covers both legs', () => {
    const pose: CameraPose = { target: [12, -34, 56], yaw: 1.25, pitch: -0.5, distance: 78 };

    const [block] = flyToPoseClip(pose).timeline;
    const legs = (block as { children: unknown[] }).children;
    const reframe = legs.find((leg) =>
      JSON.stringify(leg).includes(JSON.stringify(pose.target)),
    ) as { children: [{ sec: number }, { children: [{ over: number }, unknown] }] };

    const [lead, move] = reframe.children;
    expect(FLY_TO_POSE_SEC).toBeCloseTo(lead.sec + move.children[0].over);
  });
});
