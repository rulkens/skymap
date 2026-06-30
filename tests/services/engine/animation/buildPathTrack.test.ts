/**
 * buildPathTrack — unit tests for the `flyPath` compile-time builder.
 *
 * The builder turns resolved waypoints + a start pose + a total duration + a
 * global ease into a `PathTrack` whose `sample(localSec)` returns the camera
 * pose at that instant. The camera (EYE) flies a centripetal Catmull-Rom
 * through `[liveEye, ...waypoints]`, looking down the path; the returned
 * `target` is the look-at point DERIVED from eye + aim, so to test the path we
 * reconstruct the eye from the pose via the orbit convention (`eyeOf`).
 *
 * Contracts under test:
 *   - The EYE begins at the live camera position and ends at the last waypoint.
 *   - Distance interpolates monotonically along a monotone path.
 *   - Per-leg `over` controls timing: with `ease:'linear'` the eye is AT a
 *     waypoint precisely at that waypoint's cumulative scheduled time.
 *   - The camera AIMS down the path (forward), and aligns to that aim promptly
 *     at the start (align-in) rather than creeping across a long first leg.
 *   - The live orientation is preserved at t=0 (no aim pop on handoff).
 *   - A per-waypoint yaw/pitch override pins the aim there.
 *   - Uneven knot spacing does not slingshot the eye past a waypoint.
 *   - Over-pinned legs (pinned seconds exceed the total) throw at build time.
 */

import { describe, it, expect } from 'vitest';
import { buildPathTrack } from '../../../../src/services/engine/animation/buildPathTrack';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { PathSample } from '../../../../src/@types/animation/CompiledClip';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const START: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };

/** Reconstruct the eye position from a pose via the orbit convention. */
function eyeOf(p: PathSample): Vec3 {
  const cp = Math.cos(p.pitch);
  const dir: Vec3 = [cp * Math.sin(p.yaw), Math.sin(p.pitch), cp * Math.cos(p.yaw)];
  return [
    p.target[0] + p.distance * dir[0],
    p.target[1] + p.distance * dir[1],
    p.target[2] + p.distance * dir[2],
  ];
}

describe('buildPathTrack', () => {
  it('flies the eye from the live camera position to the last waypoint', () => {
    const track = buildPathTrack({
      start: START, // eye sits at target + distance·+Z = [0,0,1]
      startSec: 0,
      over: 4,
      ease: 'linear',
      waypoints: [
        { at: [10, 0, 0], distance: 10 },
        { at: [20, 0, 0], distance: 4 },
      ],
    });

    expect(track.startSec).toBe(0);
    expect(track.endSec).toBe(4);

    const a = eyeOf(track.sample(0));
    expect(a[0]).toBeCloseTo(0, 5);
    expect(a[2]).toBeCloseTo(1, 5); // live eye at [0,0,1]

    // The eye settles framed on the final waypoint: 4 short of the [20,0,0]
    // centre along the +X approach (see the dedicated settle-framed test).
    const b = eyeOf(track.sample(4));
    expect(b[0]).toBeCloseTo(16, 4);
    expect(b[1]).toBeCloseTo(0, 4);
    expect(track.sample(4).distance).toBeCloseTo(4, 4);
  });

  // ── Settle framed: the DESTINATION (final waypoint) is not flown through ──
  //
  // En-route waypoints are pass-points (the eye flies through their centres),
  // but the final waypoint is the destination: the eye stops at the framing
  // distance and looks AT the group centre, so the take ends framed on the
  // target rather than sailing past it.
  it('settles framed on the final waypoint: eye stops at framing distance, looking at the group centre', () => {
    const track = buildPathTrack({
      start: START, // eye at [0,0,1]
      startSec: 0,
      over: 4,
      ease: 'linear',
      waypoints: [
        { at: [10, 0, 0], distance: 3 }, // en-route: flown through
        { at: [20, 0, 0], distance: 4 }, // destination: settled framed
      ],
    });
    const end = track.sample(4);
    // The look-at TARGET lands on the final group centre…
    expect(end.target[0]).toBeCloseTo(20, 3);
    expect(end.target[1]).toBeCloseTo(0, 3);
    expect(end.target[2]).toBeCloseTo(0, 3);
    // …at the framing distance (not flown through to the centre)…
    expect(end.distance).toBeCloseTo(4, 3);
    // …so the eye stops 4 short along the +X approach, at x = 16.
    const eye = eyeOf(end);
    expect(eye[0]).toBeCloseTo(16, 2);
    expect(eye[1]).toBeCloseTo(0, 3);
    expect(eye[2]).toBeCloseTo(0, 3);
  });

  it('moves the eye monotonically outward along a monotone path', () => {
    const track = buildPathTrack({
      start: START,
      startSec: 0,
      over: 4,
      ease: 'linear',
      waypoints: [
        { at: [10, 0, 0], distance: 10 },
        { at: [20, 0, 0], distance: 100 },
      ],
    });

    let prevX = -Infinity;
    let prevDist = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const s = track.sample((i / 100) * 4);
      const eye = eyeOf(s);
      expect(eye[0]).toBeGreaterThanOrEqual(prevX - 1e-6);
      expect(s.distance).toBeGreaterThanOrEqual(prevDist - 1e-6);
      prevX = eye[0];
      prevDist = s.distance;
    }
  });

  it('honours per-leg `over`: a pinned slow leg reaches its waypoint at the scheduled time', () => {
    // Leg 1 (start→wp0) is pinned to 3s, leg 2 (wp0→wp1) to 1s, total 4s.
    // With linear ease, the eye is AT wp0 at t=3.
    const track = buildPathTrack({
      start: START,
      startSec: 0,
      over: 4,
      ease: 'linear',
      waypoints: [
        { at: [10, 0, 0], distance: 10, over: 3 },
        { at: [20, 0, 0], distance: 3, over: 1 },
      ],
    });

    const atWp0 = eyeOf(track.sample(3));
    expect(atWp0[0]).toBeCloseTo(10, 3);
    expect(track.sample(3).distance).toBeCloseTo(10, 3);

    // Halfway through the (short, fast) final leg in time → past wp0, not yet wp1.
    const mid2 = eyeOf(track.sample(3.5));
    expect(mid2[0]).toBeGreaterThan(10);
    expect(mid2[0]).toBeLessThan(20);
  });

  it('throws when pinned legs exceed the total duration', () => {
    expect(() =>
      buildPathTrack({
        start: START,
        startSec: 0,
        over: 4,
        ease: 'linear',
        waypoints: [
          { at: [10, 0, 0], distance: 10, over: 5 }, // 5s pinned into a 4s path
          { at: [20, 0, 0], distance: 100 },
        ],
      }),
    ).toThrow();
  });

  // ── Forward aim: the camera looks DOWN THE PATH (toward where it's going) ──
  //
  // Travel is +X → the camera aims +X. The orbit convention's target→eye dir is
  // `-forward`, so yaw = atan2(-1, 0) = -π/2, pitch = 0.
  it('aims along the direction of travel at the final waypoint (forward-looking)', () => {
    const track = buildPathTrack({
      start: START,
      startSec: 0,
      over: 4,
      ease: 'linear',
      waypoints: [
        { at: [10, 0, 0], distance: 10 },
        { at: [20, 0, 0], distance: 3 },
      ],
    });
    const end = track.sample(4);
    expect(end.yaw).toBeCloseTo(-Math.PI / 2, 2);
    expect(end.pitch).toBeCloseTo(0, 3);
  });

  it('aligns to the forward aim promptly at the start (align-in), not across the whole first leg', () => {
    // A long first leg toward +X. By ALIGN_SEC (~1.2s) the camera should already
    // be looking forward (+X), even though the eye has barely begun the leg.
    const start: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };
    const track = buildPathTrack({
      start, // looking -Z at the start
      startSec: 0,
      over: 12,
      ease: 'linear',
      waypoints: [
        { at: [1000, 0, 0], distance: 10 },
        { at: [2000, 0, 0], distance: 10 },
      ],
    });
    // t=0: still the live orientation (looking -Z → yaw 0).
    expect(track.sample(0).yaw).toBeCloseTo(0, 3);
    // t=1.5s (> align window): already aligned forward (+X → yaw -π/2).
    expect(track.sample(1.5).yaw).toBeCloseTo(-Math.PI / 2, 2);
  });

  it('keeps the live start orientation at t=0 (no aim pop when the clip takes over)', () => {
    const start: CameraPose = { target: [0, 0, 0], yaw: 1.2, pitch: -0.3, distance: 5 };
    const track = buildPathTrack({
      start,
      startSec: 0,
      over: 4,
      ease: 'linear',
      waypoints: [
        { at: [10, 0, 0], distance: 10 },
        { at: [20, 0, 0], distance: 10 },
      ],
    });
    const a = track.sample(0);
    expect(a.yaw).toBeCloseTo(1.2, 6);
    expect(a.pitch).toBeCloseTo(-0.3, 6);
  });

  it('honours an explicit per-waypoint aim override', () => {
    const track = buildPathTrack({
      start: START,
      startSec: 0,
      over: 4,
      ease: 'linear',
      waypoints: [
        { at: [10, 0, 0], distance: 10 },
        { at: [20, 0, 0], distance: 10, yaw: 0.5, pitch: 0.25 }, // pin the final aim
      ],
    });
    const end = track.sample(4);
    expect(end.yaw).toBeCloseTo(0.5, 3);
    expect(end.pitch).toBeCloseTo(0.25, 3);
  });

  // ── No slingshot: a far start + clustered waypoints must not balloon ──
  //
  // The eye rides the centripetal spline, so it stays snug to its knots instead
  // of curling a loop around each waypoint (the old trailing-eye behaviour).
  it('does not slingshot the eye past a waypoint when knot spacing is very uneven', () => {
    const track = buildPathTrack({
      start: { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10 }, // eye at [0,0,10]
      startSec: 0,
      over: 4,
      ease: 'linear',
      waypoints: [
        { at: [100, 0, 0], distance: 10 }, // huge first leg
        { at: [100, 1, 0], distance: 10 }, // then a tight corner
        { at: [99, 1, 0], distance: 10 },
      ],
    });
    let maxX = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const eye = eyeOf(track.sample((i / 200) * 4));
      maxX = Math.max(maxX, eye[0]);
    }
    // Waypoint max x is 100; allow a small honest overshoot, not a slingshot.
    expect(maxX).toBeLessThanOrEqual(103);
  });
});
