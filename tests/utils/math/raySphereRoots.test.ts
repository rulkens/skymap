import { describe, it, expect } from 'vitest';
import { raySphereRoots } from '../../../src/utils/math/raySphereRoots';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// Every expectation below is hand-computed from the quadratic
//   m = ro - center;  b = dot(m, rd);  c = dot(m, m) - r²;  discr = b² - c
//   roots = -b ∓ sqrt(discr)      (tNear ≤ tFar)
// (the same formulation as lib/util.wesl::raySphere). Derivations are in
// the comments so a future reader can re-check the arithmetic without a
// calculator.
describe('raySphereRoots', () => {
  const ORIGIN: Vec3 = [0, 0, 0];
  const PLUS_X: Vec3 = [1, 0, 0];

  it('hit from outside returns both crossings', () => {
    // ro=[-3,0,0], rd=+x, unit sphere at origin.
    //   m=[-3,0,0]; b=-3; c=9-1=8; discr=9-8=1; s=1
    //   roots = -(-3)-1=2, -(-3)+1=4
    const ro: Vec3 = [-3, 0, 0];
    expect(raySphereRoots(ro, PLUS_X, ORIGIN, 1)).toEqual([2, 4]);
  });

  it('origin inside returns a straddling interval', () => {
    // ro=origin, rd=+x, radius 2 (the shadow-ray case: the surface point
    // sits inside the cloud shell).
    //   m=[0,0,0]; b=0; c=0-4=-4; discr=0-(-4)=4; s=2
    //   roots = -2, +2   →  tNear<0<tFar, tFar toward the sun
    const roots = raySphereRoots(ORIGIN, PLUS_X, ORIGIN, 2);
    expect(roots).not.toBeNull();
    expect(roots![0]).toBeCloseTo(-2, 12);
    expect(roots![1]).toBeCloseTo(2, 12);
  });

  it('surface point along the sun hits the shell', () => {
    // ro=[1,0,0] on the unit sphere, rd=+x, shell radius 1.01.
    //   m=[1,0,0]; b=1; c=1-1.0201=-0.0201; discr=1.0201; s=1.01
    //   roots = -2.01, +0.01   →  tFar≈0.01 is the shell exit toward the sun.
    const ro: Vec3 = [1, 0, 0];
    const roots = raySphereRoots(ro, PLUS_X, ORIGIN, 1.01);
    expect(roots).not.toBeNull();
    expect(roots![1]).toBeCloseTo(0.01, 6);
  });

  it('tangent returns a double root', () => {
    // Ray grazing the unit sphere one unit off-axis: ro=[-3,1,0], rd=+x.
    //   m=[-3,1,0]; b=-3; c=(9+1)-1=9; discr=9-9=0; s=0
    //   roots = 3, 3   →  discr==0, the tangent case collapses to one point.
    const ro: Vec3 = [-3, 1, 0];
    const roots = raySphereRoots(ro, PLUS_X, ORIGIN, 1);
    expect(roots).not.toBeNull();
    expect(roots![0]).toBeCloseTo(roots![1], 12);
    expect(roots![0]).toBeCloseTo(3, 12);
  });

  it('miss returns null', () => {
    // Ray passes two units off-axis, never reaching the unit sphere:
    // ro=[-3,2,0], rd=+x.
    //   m=[-3,2,0]; b=-3; c=(9+4)-1=12; discr=9-12=-3 < 0 → miss
    const ro: Vec3 = [-3, 2, 0];
    expect(raySphereRoots(ro, PLUS_X, ORIGIN, 1)).toBeNull();
  });

  it('resolves a hit when the sphere is a billionth of the ray distance away', () => {
    // Earth (r = 6371 km) seen from 2.4e12 km — the zoomed-out surface camera.
    // `c = |m|² − r²` annihilates r² entirely at this ratio (5.76e24 vs 4.06e7,
    // 17 decades apart), so the b²−c form returns null for a ray that passes
    // half a radius from the centre. Aimed at [0, r/2, 0]: the chord's
    // half-width is r·√3/2, and that is what the cancellation eats.
    const D = 2.4e12;
    const r = 6371;
    const len = Math.hypot(D, r / 2);
    const ro: Vec3 = [D, 0, 0];
    const rd: Vec3 = [-D / len, r / 2 / len, 0];

    const roots = raySphereRoots(ro, rd, ORIGIN, r);
    expect(roots).not.toBeNull();
    expect((roots![1] - roots![0]) / 2 / (r * (Math.sqrt(3) / 2))).toBeCloseTo(1, 6);
  });

  it('sphere fully behind the origin still returns both (negative) roots', () => {
    // ro=[3,0,0] looking +x, unit sphere at origin sits entirely behind us.
    //   m=[3,0,0]; b=3; c=9-1=8; discr=9-8=1; s=1
    //   roots = -3-1=-4, -3+1=-2   →  both negative, NOT null.
    // This pins the documented divergence from the WESL sentinel (which
    // early-outs `c>0 && b>0` to vec2(-1,-1)): this util returns the real
    // roots so a caller — atmosphereShellBound — can test the sign it needs
    // (top roots both < 0 ⇒ shell behind origin ⇒ that caller returns null).
    // If someone "fixes" this util to match the WESL sentinel, this fails.
    const ro: Vec3 = [3, 0, 0];
    expect(raySphereRoots(ro, PLUS_X, ORIGIN, 1)).toEqual([-4, -2]);
  });
});
