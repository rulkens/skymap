/** A plane with a known east-west rise rate is the one shape whose slope is
 *  knowable by hand — it catches a missing or wrong `cos(lat)` factor, which
 *  a curved test surface would mask inside its own derivative. */
import { describe, expect, it } from 'vitest';

import { slopeLatticeFromPosts } from '../../../../tools/utils/textures/slopeLatticeFromPosts';

describe('slopeLatticeFromPosts', () => {
  it('a plane rising 1 m per 100 m east gives sx 0.01, sy 0 at 30°N', () => {
    const stepDeg = 1;
    const radiusM = 3_390_000;
    const latDeg = 30;
    const eastSpacingM = radiusM * Math.cos((latDeg * Math.PI) / 180) * stepDeg * (Math.PI / 180);
    const nx = 3;
    const ny = 3;
    // Row j=1 sits at exactly latDeg; rows 0 and 2 are one step either side,
    // needed so the middle row's sy comes from a true central difference.
    const north = latDeg + stepDeg;
    const posts = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) posts[j * nx + i] = 0.01 * i * eastSpacingM;
    }

    const lattice = slopeLatticeFromPosts(posts, nx, ny, -stepDeg, north, stepDeg, radiusM);
    const mid = 1 * nx + 1;
    expect(lattice.sx[mid]).toBeCloseTo(0.01, 6);
    expect(lattice.sy[mid]).toBeCloseTo(0, 6);
  });
});
