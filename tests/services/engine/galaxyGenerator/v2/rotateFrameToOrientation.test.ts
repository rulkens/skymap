/**
 * rotateFrameToOrientation (`clusteredDiscPlacement.ts`) bends a lane frame
 * toward the SF-map automaton's measured filament orientation. None of its
 * four defining properties — identity at a matching angle, a genuine 90deg
 * turn, the mod-pi headless wrap, and the coherence-0 no-op — had a test;
 * a sign flip or a dropped wrap term would pass every other suite untouched
 * since nothing else reads a rotated frame's absolute orientation.
 *
 * Every case passes `frame = warpSurfaceFrame(radius, angle, geometry)` —
 * the SAME call `rotateFrameToOrientation` makes internally for `ref` — so
 * `currentAngle` (frame vs. reference) is exactly 0 by construction,
 * independent of the Milky Way params' own warp curvature.
 */
import { describe, expect, it } from 'vitest';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../../src/data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../../src/services/engine/galaxyGenerator/shared/describeGalaxy';
import {
  rotateFrameToOrientation,
  type OrientationDeltaStats,
} from '../../../../../src/services/engine/galaxyGenerator/v2/clusteredDiscPlacement';
import { warpSurfaceFrame } from '../../../../../src/utils/galaxy/warpSurfaceFrame';
import type { GalaxySfMapOrientation } from '../../../../../src/@types/galaxy/GalaxyIsmMapOrientation';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
const RADIUS = 5;
const ANGLE = 0.3;

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** A single-texel orientation map: every (radius, angle) samples the same texel, so the fixture needs no grid math, only the packed double-angle vector for the desired (angle, coherence). */
function singleTexelOrientation(angle: number, coherence: number): GalaxySfMapOrientation {
  return {
    az: 1,
    rings: 1,
    rMin: 0,
    rMax: 10,
    data: Float32Array.from([coherence * Math.cos(2 * angle), coherence * Math.sin(2 * angle)]),
  };
}

describe('rotateFrameToOrientation', () => {
  it('leaves the frame unchanged when the measured angle equals its own tangential direction', () => {
    const frame = warpSurfaceFrame(RADIUS, ANGLE, geometry);
    const orientation = singleTexelOrientation(0, 0.5); // currentAngle is 0 by construction — see header
    const rotated = rotateFrameToOrientation(
      frame,
      RADIUS,
      ANGLE,
      geometry,
      orientation,
      undefined,
    );
    expect(dot(rotated.along, frame.along)).toBeCloseTo(1, 9);
    expect(dot(rotated.across, frame.across)).toBeCloseTo(1, 9);
    expect(rotated.pole).toEqual(frame.pole);
  });

  it('rotates the frame onto the radial axis for a 90deg-rotated measured angle', () => {
    const frame = warpSurfaceFrame(RADIUS, ANGLE, geometry);
    const orientation = singleTexelOrientation(-Math.PI / 2, 1);
    const rotated = rotateFrameToOrientation(
      frame,
      RADIUS,
      ANGLE,
      geometry,
      orientation,
      undefined,
    );
    // A genuine quarter turn swaps the two in-plane axes (up to sign) rather
    // than leaving `along` anywhere between them — the claim a diluted or
    // missing delta would silently fail.
    expect(Math.abs(dot(rotated.along, frame.across))).toBeCloseTo(1, 9);
    expect(Math.abs(dot(rotated.across, frame.along))).toBeCloseTo(1, 9);
    expect(Math.abs(dot(rotated.along, frame.along))).toBeLessThan(1e-8);
    expect(rotated.pole).toEqual(frame.pole);
  });

  it('treats a measured angle and its +pi twin identically (headless filament wrap)', () => {
    const frame = warpSurfaceFrame(RADIUS, ANGLE, geometry);
    const theta = 0.7;
    const rotatedA = rotateFrameToOrientation(
      frame,
      RADIUS,
      ANGLE,
      geometry,
      singleTexelOrientation(theta, 1),
      undefined,
    );
    const rotatedB = rotateFrameToOrientation(
      frame,
      RADIUS,
      ANGLE,
      geometry,
      singleTexelOrientation(theta + Math.PI, 1),
      undefined,
    );
    expect(rotatedB.along[0]).toBeCloseTo(rotatedA.along[0], 9);
    expect(rotatedB.along[1]).toBeCloseTo(rotatedA.along[1], 9);
    expect(rotatedB.along[2]).toBeCloseTo(rotatedA.along[2], 9);
    expect(rotatedB.across[0]).toBeCloseTo(rotatedA.across[0], 9);
    expect(rotatedB.across[1]).toBeCloseTo(rotatedA.across[1], 9);
    expect(rotatedB.across[2]).toBeCloseTo(rotatedA.across[2], 9);
  });

  it('leaves the frame untouched at coherence 0, and still records the zero delta', () => {
    const frame = warpSurfaceFrame(RADIUS, ANGLE, geometry);
    const orientation = singleTexelOrientation(1.234, 0);
    const stats: OrientationDeltaStats = { count: 0, sumAbsDeltaDeg: 0, maxAbsDeltaDeg: 0 };
    const rotated = rotateFrameToOrientation(frame, RADIUS, ANGLE, geometry, orientation, stats);
    expect(rotated).toBe(frame);
    expect(stats).toEqual({ count: 1, sumAbsDeltaDeg: 0, maxAbsDeltaDeg: 0 });
  });
});
