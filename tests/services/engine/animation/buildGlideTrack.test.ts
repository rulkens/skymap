import { describe, it, expect } from 'vitest';
import { buildGlideTrack } from '../../../../src/services/engine/animation/buildGlideTrack';
import { glidePath } from '../../../../src/utils/camera/glidePath';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const FOV_Y = (50 * Math.PI) / 180;
const START: CameraPose = { target: [0, 0, 0], yaw: 0.3, pitch: -0.2, distance: 100 };
const TO: { target: Vec3; distance: number } = { target: [30, 40, 0], distance: 2 };

function relErr(got: number, want: number): number {
  return want === 0 ? Math.abs(got) : Math.abs(got - want) / Math.abs(want);
}

describe('buildGlideTrack', () => {
  it('declares exactly target and distance', () => {
    const track = buildGlideTrack({
      start: START,
      startSec: 0,
      to: TO,
      ease: 'linear',
      fovYRad: FOV_Y,
    });
    // yaw/pitch stay on the base layer, so they must NOT be claimed here — a
    // declared channel is one `validateCompositeExclusivity` forbids others from.
    expect([...track.channels].sort()).toEqual(['distance', 'target']);
  });

  it('endSec − startSec is the derived duration when over is omitted', () => {
    const track = buildGlideTrack({
      start: START,
      startSec: 7,
      to: TO,
      ease: 'linear',
      fovYRad: FOV_Y,
    });
    const derived = glidePath(
      { target: START.target, distance: START.distance },
      TO,
      FOV_Y,
    ).durationSec;
    expect(track.endSec).toBe(track.startSec + derived);
    // Guard against a "derived === some fixed constant" pass: a longer path must
    // take longer. Both moves sit inside the clamp, so this is the arc length
    // talking, not GLIDE_MIN_SEC/GLIDE_MAX_SEC.
    const farther = buildGlideTrack({
      start: START,
      startSec: 0,
      to: { target: [300, 400, 0], distance: TO.distance },
      ease: 'linear',
      fovYRad: FOV_Y,
    });
    expect(farther.endSec).toBeGreaterThan(derived);
  });

  it('an explicit over wins over the derived duration', () => {
    const track = buildGlideTrack({
      start: START,
      startSec: 2,
      to: TO,
      over: 1.25,
      ease: 'linear',
      fovYRad: FOV_Y,
    });
    expect(track.endSec).toBe(3.25);
  });

  it('sample(0) is the start pose and sample(duration) is the destination', () => {
    const over = 1.5;
    const track = buildGlideTrack({
      start: START,
      startSec: 0,
      to: TO,
      over,
      ease: 'linear',
      fovYRad: FOV_Y,
    });

    const first = track.sample(0);
    expect(first.target).toEqual(START.target);
    expect(relErr(first.distance!, START.distance)).toBeLessThanOrEqual(1e-9);
    // The composite writer owns two channels; the other two must be absent so
    // `compositePoseAt` falls through to the base layer for them.
    expect(first.yaw).toBeUndefined();
    expect(first.pitch).toBeUndefined();

    const last = track.sample(over);
    for (let i = 0; i < 3; i++) {
      expect(relErr(last.target![i]!, TO.target[i]!)).toBeLessThanOrEqual(1e-6);
    }
    expect(relErr(last.distance!, TO.distance)).toBeLessThanOrEqual(1e-9);
  });
});
