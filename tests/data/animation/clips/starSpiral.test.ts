/**
 * starSpiral tests — the baked outward-spiral clip: open on Earth's LIVE
 * position, then one `flyPath` through the pre-snapped neighbourhood stars.
 *
 * The flyPath resolve→compile→evaluate machinery is proven end-to-end elsewhere
 * (`flyPathDemo.test.ts`); what is unique here is the AUTHORED clip — the
 * instant-dependent Earth start, the baked star itinerary, the pinned opening
 * leg, and the famous-vs-anonymous brake split. All waypoints are already in
 * `at`-form (the offline build resolved them), so `compileClip` runs directly
 * with no `resolveClipFoci` fixture — and compiling IS the structural proof: it
 * throws on a single-writer clash, a path-exclusivity overlap, or an over-pinned
 * leg. If it returns a duration, the clip is valid.
 */

import { describe, it, expect } from 'vitest';
import { starSpiral, DURATION_SEC } from '../../../../src/data/animation/clips/starSpiral';
import { STAR_SPIRAL_WAYPOINTS } from '../../../../src/data/animation/clips/starSpiralWaypoints.generated';
import { compileClip } from '../../../../src/services/engine/animation/compileClip';
import { deriveBodyStates } from '../../../../src/services/engine/frame/deriveBodyStates';
import { CONST_J2000 } from '../../../../src/data/time/constJ2000';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';

describe('starSpiral clip', () => {
  it('opens on the frozen-clock Earth (the instant it is built at)', () => {
    // Build at a clearly non-J2000 instant: the start target must be Earth's
    // snapshot position at THAT instant, not at the epoch.
    const LATER = CONST_J2000 + 200;
    const start = starSpiral(LATER).data.start as CameraPose;
    const earthLater = deriveBodyStates(LATER).get('earth')!.positionMpc;
    expect(start.target).toEqual([...earthLater]);

    const earthJ2000 = deriveBodyStates(CONST_J2000).get('earth')!.positionMpc;
    expect(start.target).not.toEqual([...earthJ2000]);
  });

  it('is a single flyPath through every baked star, opening by hiding orbit trails', () => {
    const clip = starSpiral(CONST_J2000);
    expect(clip.id).toBe('starSpiral');
    expect(clip.label.length).toBeGreaterThan(0);

    const [openCue, fly] = clip.data.timeline;
    // The orbit trails are clutter once the camera leaves the planets — hidden
    // as the flight begins.
    expect(openCue!.kind).toBe('hide');
    if (openCue!.kind !== 'hide') throw new Error('expected a hide cue');
    expect(openCue.layers).toContain('orbitTrails');

    expect(fly!.kind).toBe('flyPath');
    if (fly!.kind !== 'flyPath') throw new Error('expected a flyPath effect');
    // Every baked waypoint is flown — a dropped/duplicated leg would desync this.
    expect(fly.waypoints).toHaveLength(STAR_SPIRAL_WAYPOINTS.length);
    // The first leg's seconds are pinned (the powers-of-ten opening); without the
    // pin its ~20-decade scale-space arc would swallow the whole budget.
    expect(fly.waypoints[0]!.over).toBeGreaterThan(0);
  });

  it('brakes harder on famous stars than on anonymous ones', () => {
    const fly = starSpiral(CONST_J2000).data.timeline[1]!;
    if (fly.kind !== 'flyPath') throw new Error('expected a flyPath effect');

    const famousLingers = new Set<number | undefined>();
    const plainLingers = new Set<number | undefined>();
    STAR_SPIRAL_WAYPOINTS.forEach((w, i) => {
      const linger = fly.waypoints[i]!.linger;
      (w.famousId !== undefined ? famousLingers : plainLingers).add(linger);
    });

    // Each class carries exactly one brake depth, and the famous stars' is the
    // deeper (slower) one — the clip's famous-vs-anonymous split.
    expect(famousLingers.size).toBe(1);
    expect(plainLingers.size).toBe(1);
    expect([...famousLingers][0]!).toBeGreaterThan([...plainLingers][0]!);
  });

  it('compiles and runs the authored cruise length plus dwell', () => {
    // compileClip throws on any single-writer / path-exclusivity / over-pinned
    // fault, so a clean duration is the structural proof. Per-waypoint dwell
    // (linger) ADDS wall-clock time on top of the DURATION_SEC cruise, so the
    // compiled take sits above the cruise floor — assert the band, not a literal.
    const duration = compileClip(starSpiral(CONST_J2000).data).durationSec;
    expect(duration).toBeGreaterThanOrEqual(DURATION_SEC);
    expect(duration).toBeLessThan(DURATION_SEC * 1.2);
  });
});
