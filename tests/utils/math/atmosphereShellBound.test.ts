import { describe, it, expect } from 'vitest';
import { atmosphereShellBound } from '../../../src/utils/math/atmosphereShellBound';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// Every expectation below is hand-computed, independent of the
// implementation, using the same quadratic `raySphereRoots` composes:
//   m = ro - center;  b = dot(m, rd);  c = dot(m, m) - r²
//   discr = b² - c;   roots = -b ∓ sqrt(discr)   (tNear ≤ tFar)
// with the sphere centred at the origin. The fixed shell used throughout
// is topRadius = 1, bottomRadius = 0.5, so the numbers stay clean. Rays go
// down the ±z axis except the limb-graze case, whose derivation is spelled
// out in its comment.
describe('atmosphereShellBound', () => {
  const TOP = 1;
  const BOTTOM = 0.5;

  it('misses the shell entirely', () => {
    // ro=[0,0,3], rd=+y (tangent-away). Top sphere (r=1):
    //   m=[0,0,3]; b=dot(m,[0,1,0])=0; c=9-1=8; discr=0-8=-8 < 0 → top miss.
    const ro: Vec3 = [0, 0, 3];
    const rd: Vec3 = [0, 1, 0];
    expect(atmosphereShellBound(ro, rd, BOTTOM, TOP)).toBeNull();
  });

  it('outside, looking through the planet', () => {
    // ro=[0,0,3], rd=-z. Top (r=1):
    //   m=[0,0,3]; b=dot(m,[0,0,-1])=-3; c=9-1=8; discr=9-8=1; s=1
    //   roots=[3-1, 3+1]=[2,4] → tNear=max(0,2)=2, tFar=4.
    // Ground (r=0.5):
    //   c=9-0.25=8.75; discr=9-8.75=0.25; s=0.5; roots=[2.5,3.5]
    //   ground entry 2.5 > tNear 2 → clamp tFar=min(4,2.5)=2.5.
    const ro: Vec3 = [0, 0, 3];
    const rd: Vec3 = [0, 0, -1];
    expect(atmosphereShellBound(ro, rd, BOTTOM, TOP)).toEqual({
      tNear: 2,
      tFar: 2.5,
    });
  });

  it('outside, grazing the limb (misses ground)', () => {
    // ro=[0,0,3], aimed at [0.75,0,0]. Direction before normalizing:
    //   d = [0.75,0,-3]; |d| = sqrt(0.5625+9) = sqrt(9.5625) = sqrt(153/16).
    // Top (r=1): rd = d/|d|.  m=[0,0,3].
    //   b = 3·rd.z = 3·(-3/|d|) = -9/|d| = -36/sqrt(153)
    //   b² = 1296/153 = 8.470588…;  c = 9-1 = 8;  discr = 72/153 = 8/17
    //   s  = sqrt(8/17) = 0.6859943…;  -b = 36/sqrt(153) = 2.9104290…
    //   tNear = 2.9104290 - 0.6859943 = 2.2244347
    //   tFar  = 2.9104290 + 0.6859943 = 3.5964233
    // Ground (r=0.5): c = 9-0.25 = 8.75; discr = 8.470588-8.75 = -0.279 < 0
    //   → ground miss, no clamp, tFar stays the top far-exit.
    const ro: Vec3 = [0, 0, 3];
    const d: Vec3 = [0.75, 0, -3];
    const len = Math.hypot(d[0], d[1], d[2]);
    const rd: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
    const bound = atmosphereShellBound(ro, rd, BOTTOM, TOP);
    expect(bound).not.toBeNull();
    expect(bound!.tNear).toBeCloseTo(2.2244347, 5);
    expect(bound!.tFar).toBeCloseTo(3.5964233, 5);
  });

  it('inside the shell, looking up', () => {
    // ro=[0,0,0.75] (between ground r=0.5 and top r=1), rd=+z. Top (r=1):
    //   m=[0,0,0.75]; b=0.75; c=0.5625-1=-0.4375; discr=0.5625+0.4375=1; s=1
    //   roots=[-1.75, 0.25] → tNear=max(0,-1.75)=0, tFar=0.25.
    // Ground (r=0.5):
    //   c=0.5625-0.25=0.3125; discr=0.5625-0.3125=0.25; s=0.5
    //   roots=[-1.25,-0.25]; ground entry -1.25 is NOT > tNear 0 → no clamp.
    const ro: Vec3 = [0, 0, 0.75];
    const rd: Vec3 = [0, 0, 1];
    expect(atmosphereShellBound(ro, rd, BOTTOM, TOP)).toEqual({
      tNear: 0,
      tFar: 0.25,
    });
  });

  it('shell entirely behind the origin', () => {
    // ro=[0,0,3], rd=+z. Top (r=1):
    //   m=[0,0,3]; b=3; c=9-1=8; discr=9-8=1; s=1; roots=[-4,-2]
    //   both roots < 0 → the whole shell is behind us → null.
    const ro: Vec3 = [0, 0, 3];
    const rd: Vec3 = [0, 0, 1];
    expect(atmosphereShellBound(ro, rd, BOTTOM, TOP)).toBeNull();
  });
});
