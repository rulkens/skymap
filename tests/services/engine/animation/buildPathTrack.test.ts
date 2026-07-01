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
import type { PassByConfig } from '../../../../src/@types/animation/PassByConfig';

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
    // A long first leg toward +X. By ALIGN_SEC (~1.35s) the camera should already
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

  // ── Tunable align-in: `align` overrides the built-in ALIGN_SEC window ──
  it('honours an `align` override for how long the start aim takes to settle', () => {
    const start: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };
    const waypoints = [
      { at: [1000, 0, 0] as Vec3, distance: 10 },
      { at: [2000, 0, 0] as Vec3, distance: 10 },
    ];
    // A long 3s align-in is still mid-turn at t=1.0 (not yet looking +X).
    const slow = buildPathTrack({
      start,
      startSec: 0,
      over: 12,
      ease: 'linear',
      waypoints,
      align: 3,
    });
    expect(Math.abs(slow.sample(1.0).yaw - -Math.PI / 2)).toBeGreaterThan(0.1);
    // A short 0.5s align-in has already settled forward (+X → yaw -π/2) by t=0.6.
    const fast = buildPathTrack({
      start,
      startSec: 0,
      over: 12,
      ease: 'linear',
      waypoints,
      align: 0.5,
    });
    expect(fast.sample(0.6).yaw).toBeCloseTo(-Math.PI / 2, 2);
  });

  // ── Tunable envelope: `rampSec` (seconds) shortens the accel/decel ──
  it('uses a trapezoidal envelope when `rampSec` is set: shorter ramp ⇒ further along by quarter-time', () => {
    const waypoints = [
      { at: [10, 0, 0] as Vec3, distance: 10 },
      { at: [20, 0, 0] as Vec3, distance: 10 },
    ];
    // Default cubic inOut is still accelerating at quarter-time; a short ramp
    // (0.4s of a 4s take = 10% each end) is already cruising → further along.
    const inOut = buildPathTrack({ start: START, startSec: 0, over: 4, ease: 'inOut', waypoints });
    const trap = buildPathTrack({
      start: START,
      startSec: 0,
      over: 4,
      ease: 'inOut',
      waypoints,
      rampSec: 0.4,
    });
    expect(eyeOf(trap.sample(1))[0]).toBeGreaterThan(eyeOf(inOut.sample(1))[0]);
    // Both still settle framed on the destination at the end (envelope reaches 1).
    expect(eyeOf(trap.sample(4))[0]).toBeCloseTo(eyeOf(inOut.sample(4))[0], 3);
    // rampSec: 0 is a no-op — falls back to the named ease exactly.
    const off = buildPathTrack({
      start: START,
      startSec: 0,
      over: 4,
      ease: 'inOut',
      waypoints,
      rampSec: 0,
    });
    expect(eyeOf(off.sample(1))[0]).toBeCloseTo(eyeOf(inOut.sample(1))[0], 6);
  });

  // ── Linger: a per-target velocity dip (slow on approach + departure) ──
  //
  // `linger` ∈ [0,1] brakes the camera as it passes a waypoint. It is a pure
  // time pre-warp: identity at 0 (no behaviour change), and at high values the
  // camera crawls THROUGH the target while flying faster between targets — the
  // leg's total time is unchanged, only its distribution. The eye still passes
  // each interior knot at the SAME scheduled time (the warp is identity at leg
  // boundaries), so closest-approach timing is stable.
  it('linger:0 (and absent) is byte-identical to no linger', () => {
    const waypoints = [
      { at: [10, 0, 0] as Vec3, distance: 10 },
      { at: [20, 0, 0] as Vec3, distance: 4 },
    ];
    const base = buildPathTrack({ start: START, startSec: 0, over: 8, ease: 'linear', waypoints });
    const zero = buildPathTrack({
      start: START,
      startSec: 0,
      over: 8,
      ease: 'linear',
      waypoints,
      linger: 0,
    });
    for (let i = 0; i <= 10; i++) {
      const t = (i / 10) * 8;
      const a = eyeOf(base.sample(t));
      const b = eyeOf(zero.sample(t));
      expect(b[0]).toBeCloseTo(a[0], 9);
      expect(b[1]).toBeCloseTo(a[1], 9);
      expect(b[2]).toBeCloseTo(a[2], 9);
    }
  });

  it('path-level linger slows the camera as it passes an interior target', () => {
    const waypoints = [
      { at: [10, 0, 0] as Vec3, distance: 10 }, // interior pass-point
      { at: [20, 0, 0] as Vec3, distance: 4 }, // destination
    ];
    const base = buildPathTrack({ start: START, startSec: 0, over: 8, ease: 'linear', waypoints });
    const slow = buildPathTrack({
      start: START,
      startSec: 0,
      over: 8,
      ease: 'linear',
      waypoints,
      linger: 0.9,
    });
    // Time of closest approach to the interior waypoint [10,0,0] — the SAME in
    // both, since the warp is identity at the knot boundary.
    let tStar = 0;
    let best = Infinity;
    for (let i = 0; i <= 400; i++) {
      const t = (i / 400) * 8;
      const e = eyeOf(base.sample(t));
      const d = Math.hypot(e[0] - 10, e[1], e[2]);
      if (d < best) {
        best = d;
        tStar = t;
      }
    }
    const speedAt = (tr: ReturnType<typeof buildPathTrack>, t: number): number => {
      const dt = 0.02;
      const a = eyeOf(tr.sample(Math.max(0, t - dt)));
      const b = eyeOf(tr.sample(Math.min(8, t + dt)));
      return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    };
    // Markedly slower passing the target with linger on.
    expect(speedAt(slow, tStar)).toBeLessThan(speedAt(base, tStar) * 0.6);
  });

  it('honours a per-waypoint linger (the targeted knot brakes)', () => {
    const base = buildPathTrack({
      start: START,
      startSec: 0,
      over: 8,
      ease: 'linear',
      waypoints: [
        { at: [10, 0, 0], distance: 10 },
        { at: [20, 0, 0], distance: 4 },
      ],
    });
    const slow = buildPathTrack({
      start: START,
      startSec: 0,
      over: 8,
      ease: 'linear',
      waypoints: [
        { at: [10, 0, 0], distance: 10, linger: 0.9 }, // brake at THIS target
        { at: [20, 0, 0], distance: 4 },
      ],
    });
    let tStar = 0;
    let best = Infinity;
    for (let i = 0; i <= 400; i++) {
      const t = (i / 400) * 8;
      const e = eyeOf(base.sample(t));
      const d = Math.hypot(e[0] - 10, e[1], e[2]);
      if (d < best) {
        best = d;
        tStar = t;
      }
    }
    const speedAt = (tr: ReturnType<typeof buildPathTrack>, t: number): number => {
      const dt = 0.02;
      const a = eyeOf(tr.sample(Math.max(0, t - dt)));
      const b = eyeOf(tr.sample(Math.min(8, t + dt)));
      return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    };
    expect(speedAt(slow, tStar)).toBeLessThan(speedAt(base, tStar) * 0.6);
  });

  // ── Spline mode: causal Hermite arrives head-on; centripetal banks early ──
  //
  // The aim looks down the path tangent. Catmull-Rom's central-difference tangent
  // banks toward the NEXT waypoint before arriving; the causal-Hermite tangent is
  // the incoming chord, so the camera reaches an interior waypoint looking
  // straight along its approach and only turns afterwards.
  describe('spline mode', () => {
    // A corner in the XZ plane: fly +Z to the interior corner, then turn +X to
    // the destination. The incoming chord at the corner is +Z; the central
    // difference (toward the destination) banks ~45° off it.
    const start: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };
    const waypoints = [
      { at: [0, 0, 100] as Vec3, distance: 10 }, // interior corner (flown through)
      { at: [100, 0, 100] as Vec3, distance: 10 }, // destination after the turn
    ];

    /** The camera's LOOK direction (target − eye, i.e. −dir) from a pose. */
    const lookOf = (s: PathSample): Vec3 => {
      const cp = Math.cos(s.pitch);
      return [-cp * Math.sin(s.yaw), -Math.sin(s.pitch), -cp * Math.cos(s.yaw)];
    };

    // Angle (radians) between the look direction at the eye's closest approach to
    // the interior corner [0,0,100] and the incoming chord +Z. ~0 = head-on.
    const lookAngleOffApproach = (kind: 'centripetal' | 'causalHermite'): number => {
      const track = buildPathTrack({
        start,
        startSec: 0,
        over: 20,
        ease: 'linear',
        waypoints,
        spline: { kind },
      });
      let best = Infinity;
      let look: Vec3 = [0, 0, 1];
      for (let i = 0; i <= 800; i++) {
        const s = track.sample((i / 800) * 20);
        const e = eyeOf(s);
        const d = Math.hypot(e[0], e[1], e[2] - 100);
        if (d < best) {
          best = d;
          look = lookOf(s);
        }
      }
      const mag = Math.hypot(look[0], look[1], look[2]);
      return Math.acos(Math.max(-1, Math.min(1, look[2] / mag))); // angle to +Z
    };

    it('causal Hermite aims head-on at an interior corner (along the incoming chord)', () => {
      expect(lookAngleOffApproach('causalHermite')).toBeLessThan(0.15);
    });

    it('centripetal banks toward the next waypoint at the same corner', () => {
      expect(lookAngleOffApproach('centripetal')).toBeGreaterThan(0.5);
    });

    it('defaults to centripetal when no spline mode is given', () => {
      const def = buildPathTrack({ start, startSec: 0, over: 20, ease: 'linear', waypoints });
      const cen = buildPathTrack({
        start,
        startSec: 0,
        over: 20,
        ease: 'linear',
        waypoints,
        spline: { kind: 'centripetal' },
      });
      for (let i = 0; i <= 10; i++) {
        const t = (i / 10) * 20;
        expect(def.sample(t).yaw).toBeCloseTo(cen.sample(t).yaw, 9);
        expect(eyeOf(def.sample(t))[0]).toBeCloseTo(eyeOf(cen.sample(t))[0], 9);
      }
    });

    it('turnDelay scales the causal overshoot past a sharp interior corner', () => {
      // A right-angle corner: fly +Z to the corner, then +X. A larger turnDelay
      // lengthens the arrival tangent, so the curve shoots further past the
      // corner (max Z above the corner's Z=100) before banking back.
      const overshootZ = (turnDelay: number): number => {
        const track = buildPathTrack({
          start,
          startSec: 0,
          over: 20,
          ease: 'linear',
          waypoints,
          spline: { kind: 'causalHermite', turnDelay },
        });
        let maxZ = -Infinity;
        for (let i = 0; i <= 800; i++) {
          maxZ = Math.max(maxZ, eyeOf(track.sample((i / 800) * 20))[2]);
        }
        return maxZ;
      };
      expect(overshootZ(2)).toBeGreaterThan(overshootZ(0.5));
    });
  });

  // ── Look-ahead aim: the look LEADS toward the next waypoint after a corner ──
  //
  // With causal geometry the path flies straight into a corner then bends out.
  // Splining the per-knot aim (lookAhead 0) keeps the look head-on along the
  // incoming chord well past the corner — "looking sideways" until it reaches the
  // next knot. Look-ahead derives the look from the eye path a short time Δ ahead:
  // flying straight in, Δ-ahead is still on the approach (head-on preserved); the
  // instant the path bends, Δ-ahead is already on the next leg, so the look leads.
  describe('look-ahead aim', () => {
    const start: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };
    const waypoints = [
      { at: [0, 0, 100] as Vec3, distance: 10 }, // interior corner: fly +Z in, +X out
      { at: [100, 0, 100] as Vec3, distance: 10 }, // destination after the turn
    ];
    const lookOf = (s: PathSample): Vec3 => {
      const cp = Math.cos(s.pitch);
      return [-cp * Math.sin(s.yaw), -Math.sin(s.pitch), -cp * Math.cos(s.yaw)];
    };
    const build = (lookAhead?: number): ReturnType<typeof buildPathTrack> =>
      buildPathTrack({
        start,
        startSec: 0,
        over: 20,
        ease: 'linear',
        waypoints,
        spline: { kind: 'causalHermite', ...(lookAhead !== undefined ? { lookAhead } : {}) },
      });
    // localSec at which the eye is closest to a probe point. Geometry is identical
    // across lookAhead values, so the same localSec frames the same eye position —
    // only the LOOK differs, which is what these tests isolate.
    const timeNearest = (track: ReturnType<typeof buildPathTrack>, probe: Vec3): number => {
      let best = Infinity;
      let tStar = 0;
      for (let i = 0; i <= 1000; i++) {
        const t = (i / 1000) * 20;
        const e = eyeOf(track.sample(t));
        const d = Math.hypot(e[0] - probe[0], e[1] - probe[1], e[2] - probe[2]);
        if (d < best) {
          best = d;
          tStar = t;
        }
      }
      return tStar;
    };

    it('defaults to no look-ahead (absent === 0, byte-identical aim)', () => {
      const def = build();
      const zero = build(0);
      for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * 20;
        expect(def.sample(t).yaw).toBeCloseTo(zero.sample(t).yaw, 9);
        expect(def.sample(t).pitch).toBeCloseTo(zero.sample(t).pitch, 9);
      }
    });

    it('leads toward the next leg sooner after a corner than no look-ahead', () => {
      const base = build(0);
      const lead = build(3);
      // A point just past the corner, on the +X out-leg. Travelling +X ⇒ a look
      // that leads has a large +X component; the per-knot causal aim is still
      // mostly head-on (+Z) there, so its +X component is much smaller.
      const t = timeNearest(base, [20, 0, 100]);
      const baseX = lookOf(base.sample(t))[0];
      const leadX = lookOf(lead.sample(t))[0];
      expect(leadX).toBeGreaterThan(baseX + 0.2);
    });

    it('leads sooner the larger the look-ahead (the knob is monotone)', () => {
      // The instant the look crosses 45° toward the +X out-leg (look.x > √½). A
      // larger Δ reaches that lead earlier in the take; no Δ saturates the metric
      // because it is a TIME, not an angle. 4 < 1.5 < 0 (no look-ahead is latest).
      // Scan from t=3 — past the align-in, whose initial live→forward turn can
      // transiently swing the look through ±X and is unrelated to the leg lead.
      const tCrossX = (d: number): number => {
        const track = build(d);
        for (let i = 0; i <= 2000; i++) {
          const t = (i / 2000) * 20;
          if (t < 3) continue;
          if (lookOf(track.sample(t))[0] > Math.SQRT1_2) return t;
        }
        return Infinity;
      };
      const t0 = tCrossX(0);
      const t1 = tCrossX(1.5);
      const t2 = tCrossX(4);
      expect(t1).toBeLessThan(t0 - 0.1);
      expect(t2).toBeLessThan(t1 - 0.1);
    });

    it('still settles framed on the destination centre (tail look-at preserved)', () => {
      const end = build(3).sample(20);
      expect(end.target[0]).toBeCloseTo(100, 1);
      expect(end.target[1]).toBeCloseTo(0, 1);
      expect(end.target[2]).toBeCloseTo(100, 1);
    });
  });

  // ── Fly-past: offset the eye off interior subject centres, optionally glance ──
  //
  // Without passBy the eye flies THROUGH each interior waypoint centre (closest
  // approach ~0). With passBy the interior knot is displaced `offset · radius`
  // off-centre, so the eye sweeps past; `glance` swings the aim to look AT the
  // subject as it passes.
  describe('fly-past (passBy)', () => {
    const start: CameraPose = { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1 };
    const R = 2; // subject radius (Mpc)
    const waypoints = [
      { at: [0, 0, 100] as Vec3, distance: 10, radius: R }, // interior galaxy
      { at: [100, 0, 100] as Vec3, distance: 10, radius: R }, // destination
    ];
    const build = (passBy?: PassByConfig): ReturnType<typeof buildPathTrack> =>
      buildPathTrack({
        start,
        startSec: 0,
        over: 20,
        ease: 'linear',
        waypoints,
        ...(passBy !== undefined ? { passBy } : {}),
      });
    const lookOf = (s: PathSample): Vec3 => {
      const cp = Math.cos(s.pitch);
      return [-cp * Math.sin(s.yaw), -Math.sin(s.pitch), -cp * Math.cos(s.yaw)];
    };
    // Min distance from the eye path to `centre`, and the sample at that instant.
    const closest = (
      track: ReturnType<typeof buildPathTrack>,
      centre: Vec3,
    ): { dist: number; sample: PathSample } => {
      let best = Infinity;
      let at: PathSample = track.sample(0);
      for (let i = 0; i <= 2000; i++) {
        const s = track.sample((i / 2000) * 20);
        const e = eyeOf(s);
        const d = Math.hypot(e[0] - centre[0], e[1] - centre[1], e[2] - centre[2]);
        if (d < best) {
          best = d;
          at = s;
        }
      }
      return { dist: best, sample: at };
    };

    it('flies through the interior centre when passBy is absent', () => {
      expect(closest(build(), [0, 0, 100]).dist).toBeLessThan(0.5);
    });

    it('passes the interior subject at ~offset·radius off-centre', () => {
      const d = closest(build({ offset: 4, dir: 'above' }), [0, 0, 100]).dist;
      expect(d).toBeGreaterThan(4 * R * 0.7); // ~8 Mpc, slack for spline smoothing
      expect(d).toBeLessThan(4 * R * 1.3);
    });

    it('dir:above passes the eye OVER the top (galaxy sweeps below)', () => {
      const { sample } = closest(build({ offset: 4, dir: 'above' }), [0, 0, 100]);
      expect(eyeOf(sample)[1]).toBeGreaterThan(3); // eye well above the galaxy plane
    });

    it('glance aims at the subject centre at closest approach', () => {
      // Eye passes above the galaxy → framing it means looking DOWN (−y).
      const { sample } = closest(build({ offset: 4, dir: 'above', glance: 1 }), [0, 0, 100]);
      expect(lookOf(sample)[1]).toBeLessThan(-0.5);
    });

    it('glance 0 keeps the look leading down the path, not at the subject', () => {
      const { sample } = closest(build({ offset: 4, dir: 'above', glance: 0 }), [0, 0, 100]);
      expect(lookOf(sample)[1]).toBeGreaterThan(-0.5); // not craning down at the galaxy
    });
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
