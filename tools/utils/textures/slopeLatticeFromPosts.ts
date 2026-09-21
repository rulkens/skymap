/**
 * slopeLatticeFromPosts — east/north slopes (m/m) by central difference over
 * a grid of height posts (design §5); one-sided at the grid's own edges,
 * since there is no neighbour beyond them to difference against. A caller
 * that needs true central differences at its region's own edge posts (not
 * one-sided ones) supplies a one-post margin — see `readSlopeLattice`.
 */
import type { SlopeLattice } from '../../textures/SlopeLattice';

const DEG_TO_RAD = Math.PI / 180;

export function slopeLatticeFromPosts(
  posts: Float32Array,
  nx: number,
  ny: number,
  west: number,
  north: number,
  stepDeg: number,
  radiusM: number,
): SlopeLattice {
  // North-south post spacing is a meridian arc, so it does not vary with
  // latitude the way east-west spacing does.
  const northSpacingM = radiusM * stepDeg * DEG_TO_RAD;
  const sx = new Float32Array(nx * ny);
  const sy = new Float32Array(nx * ny);

  for (let j = 0; j < ny; j++) {
    const lat = north - j * stepDeg;
    const cosLat = Math.cos(lat * DEG_TO_RAD);
    const eastSpacingM = radiusM * cosLat * stepDeg * DEG_TO_RAD;
    for (let i = 0; i < nx; i++) {
      const here = j * nx + i;
      // At a pole post, east is undefined and every column sits on the same
      // point: the finite-difference denominator collapses to ~0, so pin the
      // east slope to 0 instead of dividing it out to ~1e13.
      sx[here] =
        cosLat < 1e-9
          ? 0
          : i === 0
            ? (posts[here + 1]! - posts[here]!) / eastSpacingM
            : i === nx - 1
              ? (posts[here]! - posts[here - 1]!) / eastSpacingM
              : (posts[here + 1]! - posts[here - 1]!) / (2 * eastSpacingM);
      sy[here] =
        j === 0
          ? (posts[here]! - posts[here + nx]!) / northSpacingM
          : j === ny - 1
            ? (posts[here - nx]! - posts[here]!) / northSpacingM
            : (posts[here - nx]! - posts[here + nx]!) / (2 * northSpacingM);
    }
  }
  return { west, north, stepDeg, nx, ny, sx, sy };
}
