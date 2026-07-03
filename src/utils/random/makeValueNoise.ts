/**
 * Seeded 3D value noise — a cheap, deterministic scalar field for modulating
 * densities (dust lanes, clumping) across a galaxy model.
 *
 * Why value noise and not Perlin? Perlin noise buys you gradient-continuity
 * (its derivative is smooth, not just its value) and directional isotropy —
 * useful when the *direction* the field varies in matters, e.g. terrain
 * normals or flow fields. Neither property is worth its extra cost here: we
 * only ever read this field as a scalar multiplier on a density or an alpha,
 * so a hashed-lattice-plus-smoothstep interpolation (value noise) gives
 * visually equivalent "clumpy but smooth" output for a fraction of the
 * per-sample work — one hash per lattice corner (8 for a 3D cell) instead of
 * one hash *and* one dot-product per corner.
 *
 * The lattice is an infinite integer grid; `hash(xi, yi, zi)` derives a
 * pseudo-random value in [0, 1) for each corner from its integer coordinates
 * plus the seed (no precomputed permutation table — unlike classic Perlin,
 * this scales to arbitrary coordinate ranges for free). Sampling at a
 * non-integer point trilinearly blends the 8 surrounding corners, with the
 * blend weight run through `smooth` (the cubic smoothstep, same curve used
 * in Perlin noise) so the field has zero slope at every lattice corner —
 * that's what makes neighbouring cells join without a visible seam.
 */

/**
 * Create a seeded 3D value-noise sampler.
 *
 * The returned closure is a pure function of its (x, y, z) arguments — unlike
 * `mulberry32`, there's no advancing internal state, so calling it twice with
 * the same coordinates always returns the same value. Two samplers built from
 * the same seed are therefore identical fields; two samplers built from
 * different seeds are decorrelated (different-looking) fields.
 *
 * @param seed  Any 32-bit integer. `>>> 0` coerces it to an unsigned 32-bit
 *              integer, matching `mulberry32`'s seed handling.
 * @returns     `(x, y, z) => number` — samples the field at a point in space,
 *              returning a float in [0, 1).
 */
export function makeValueNoise(seed: number): (x: number, y: number, z: number) => number {
  const s = seed >>> 0;

  // Hash the integer lattice coordinates (plus the seed) into a pseudo-random
  // corner value. `Math.imul` performs true 32-bit multiplication (JS numbers
  // are otherwise 64-bit floats, which would lose the wraparound bit-mixing
  // this hash depends on). The multipliers are large odd/prime-ish constants
  // chosen (by the source this is ported from) to spread bits well; the `| 0`
  // and `>>> 13` / `>>> 16` shifts are an avalanche step so a one-bit change
  // in any input coordinate flips roughly half the output bits.
  const hash = (xi: number, yi: number, zi: number): number => {
    let h =
      (Math.imul(xi, 374761393) +
        Math.imul(yi, 668265263) +
        Math.imul(zi, 2147483647) +
        Math.imul(s, 974711)) |
      0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // Cubic smoothstep: 3t² − 2t³. Zero slope at t=0 and t=1, so interpolating
  // with this instead of `t` directly gives the field zero slope at every
  // lattice corner — the seam-free joins mentioned in the module header.
  const smooth = (t: number): number => t * t * (3 - 2 * t);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

  return function (x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const zf = smooth(z - zi);

    // Trilinear blend of the 8 corners of the lattice cell containing
    // (x, y, z): interpolate along x first (4 edges → 4 values), then along
    // y (2 values), then along z (1 value).
    const x00 = lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), xf);
    const x10 = lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), xf);
    const x01 = lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), xf);
    const x11 = lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), xf);
    return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
  };
}
