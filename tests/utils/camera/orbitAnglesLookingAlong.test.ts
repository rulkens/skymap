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
import type { Vec3 } from '../../../src/@types/math/Vec3';

/** The orbit convention's target→eye direction for a (yaw, pitch). */
function dirOf(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return [cp * Math.sin(yaw), Math.sin(pitch), cp * Math.cos(yaw)];
}

function normalize(v: Vec3): Vec3 {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
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
});
