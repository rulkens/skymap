/**
 * orbitAnglesLookingAlong tests — the inverse of the orbit-camera convention.
 *
 * `updatePosition` derives the eye from (yaw, pitch) via
 *   dir = [cos p·sin yaw, sin p, cos p·cos yaw]   (target → eye)
 * and the camera looks from eye toward target, i.e. its AIM is `-dir`.
 *
 * `orbitAnglesLookingAlong(forward)` answers the inverse: which yaw/pitch makes
 * the camera AIM along `forward`? It must satisfy `dir(yaw, pitch) = -forward`.
 * The round-trip test pins exactly that.
 */

import { describe, it, expect } from 'vitest';
import { orbitAnglesLookingAlong } from '../../../src/utils/camera/orbitAnglesLookingAlong';
import { yawPitchToDir } from '../../../src/utils/camera/yawPitchToDir';
import { ORIENTATION_FRAMES } from '../../../src/data/orientation/orientationFrames';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { OrientationFrameId } from '../../../src/@types/camera/OrientationFrameId';

/** The orbit convention's target→eye direction for a (yaw, pitch). */
function dirOf(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return [cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw)];
}

function normalize(v: Vec3): Vec3 {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

/**
 * The Task-5 decode: `dir_world = frameBasis · yawPitchToDir(yaw, pitch)`,
 * hand-rolled over the TIGHT column-major `Mat3` exactly as `updatePosition`
 * does (column c of the basis contributes `basis[c*3 + 0..2]`).
 */
function decodeWorld(yaw: number, pitch: number, basis: Mat3): Vec3 {
  const [x, y, z] = yawPitchToDir(yaw, pitch);
  return [
    basis[0] * x + basis[3] * y + basis[6] * z,
    basis[1] * x + basis[4] * y + basis[7] * z,
    basis[2] * x + basis[5] * y + basis[8] * z,
  ];
}

/** Wrap an angle into (−π, π] for a seam-agnostic yaw comparison. */
function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

describe('orbitAnglesLookingAlong', () => {
  it('looking along -Z (toward the default forward) is yaw 0, pitch 0', () => {
    // At yaw 0, pitch 0 the eye sits on +Z and looks toward the target → aim -Z.
    const { yaw, pitch } = orbitAnglesLookingAlong([0, 0, -1]);
    expect(yaw).toBeCloseTo(0, 6);
    expect(pitch).toBeCloseTo(0, 6);
  });

  it('looking straight up (+Y) pitches the camera fully down toward -Y', () => {
    // dir = -forward = -Y → sin(pitch) = -1 → pitch = -π/2.
    const { pitch } = orbitAnglesLookingAlong([0, 1, 0]);
    expect(pitch).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('reconstructs dir = -forward for arbitrary directions (round-trip)', () => {
    const forwards: Vec3[] = [
      [1, 0, 0],
      [0, 0, 1],
      [1, 1, 1],
      [-2, 0.5, 3],
      [0.3, -0.9, -0.1],
    ];
    for (const raw of forwards) {
      const f = normalize(raw);
      const { yaw, pitch } = orbitAnglesLookingAlong(f);
      const d = dirOf(yaw, pitch);
      // dir must equal -forward (eye sits opposite the aim).
      expect(d[0]).toBeCloseTo(-f[0], 6);
      expect(d[1]).toBeCloseTo(-f[1], 6);
      expect(d[2]).toBeCloseTo(-f[2], 6);
    }
  });

  it('normalizes the input — magnitude does not change the angles', () => {
    const a = orbitAnglesLookingAlong([2, 0, 0]);
    const b = orbitAnglesLookingAlong([0.01, 0, 0]);
    expect(a.yaw).toBeCloseTo(b.yaw, 6);
    expect(a.pitch).toBeCloseTo(b.pitch, 6);
  });

  // The load-bearing invariant (spec §10): encode must invert decode through the
  // SAME basis. If the encode's transpose product drifted from the decode's
  // forward product — a swapped column, a missing transpose — a derived pose
  // would no longer decode back to the world direction it was measured from and
  // the flyPath aim would point off-axis under a non-default frame.
  it('encode ∘ decode recovers yaw/pitch under each frame basis', () => {
    const frames = Object.keys(ORIENTATION_FRAMES) as OrientationFrameId[];
    // Non-pole pitches (|pitch| < π/2 by a margin so cos(pitch) never vanishes)
    // crossed with yaws spanning the full circle incl. near the ±π seam.
    const pitches = [-1.2, -0.7, -0.2, 0.15, 0.6, 1.25];
    const yaws = [-3.0, -1.9, -0.4, 0.0, 0.85, 2.3, 3.05];
    for (const frame of frames) {
      const basis = ORIENTATION_FRAMES[frame];
      for (const pitch of pitches) {
        for (const yaw of yaws) {
          const forward: Vec3 = decodeWorld(yaw, pitch, basis).map((c) => -c) as Vec3;
          const got = orbitAnglesLookingAlong(forward, basis);
          // Tolerance 5e-6: the galactic/supergalactic registry bases are stored
          // as 6-digit-truncated literals, so `Bᵀ·B` is only orthonormal to ~1e-6
          // — the round-trip inherits that. A genuine encode/decode basis mismatch
          // is order 0.1+, so this margin still fails loudly on one.
          expect(wrapPi(got.yaw)).toBeCloseTo(wrapPi(yaw), 5);
          expect(got.pitch).toBeCloseTo(pitch, 5);
        }
      }
    }
  });
});
