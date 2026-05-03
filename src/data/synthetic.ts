/**
 * Synthetic point cloud generator.
 *
 * Before real SDSS data is piped through the loader, we need something to
 * render so the GPU pipeline can be built and debugged in isolation. This
 * module generates 100k fictitious galaxies distributed uniformly inside a
 * sphere of radius 1000 Mpc — roughly the depth of the SDSS main galaxy
 * sample — with plausible magnitude and color-index values.
 *
 * Two design decisions worth knowing:
 *
 *   1. DETERMINISTIC PRNG — we use a seeded pseudo-random number generator
 *      (mulberry32) rather than `Math.random()`. `Math.random()` re-seeds
 *      itself from OS entropy each page load, so the cloud would change every
 *      time you refresh, making visual regressions impossible to reproduce.
 *      A fixed seed means the same 100k points appear on every reload, in
 *      every browser, forever — handy for debugging and screenshotting.
 *
 *   2. REJECTION SAMPLING for uniform-in-sphere positions. Distributing
 *      points correctly inside a 3-D ball is subtler than it looks; see the
 *      `generateSyntheticCloud` docs below.
 */

import type { PointCloud } from '../types';

// ─── PRNG ────────────────────────────────────────────────────────────────────

/**
 * Create a mulberry32 pseudo-random number generator seeded at `seed`.
 *
 * Mulberry32 is a tiny (32-bit state) hash-based PRNG designed by Tommy
 * Ettinger. It is *not* cryptographically secure, but it has excellent
 * statistical properties for visual noise — passes the SmallCrush battery —
 * and is fast enough to generate millions of values per second in JS.
 *
 * The returned closure advances the internal state on every call and returns
 * a float in [0, 1). The state is captured in the closure, so two generators
 * with the same seed are completely independent of each other.
 *
 * Reference: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 *
 * @param seed  Any 32-bit integer. `>>> 0` coerces it to an unsigned 32-bit
 *              integer so negative values and floats behave deterministically.
 */
function mulberry32(seed: number): () => number {
  // `>>> 0` forces the seed into the uint32 range [0, 2³²).
  // Without this a caller passing −1 or 42.7 would produce a different
  // sequence than they might expect (JS bitwise ops already do this
  // internally, but being explicit avoids subtle bugs if seed is e.g. NaN).
  let s = seed >>> 0;

  return (): number => {
    // Advance state: add the "golden-ratio-like" increment 0x6d2b79f5 (based
    // on an LCG constant chosen to hit every 32-bit value before repeating).
    // `>>> 0` after every arithmetic op keeps us in uint32 — JS integers are
    // 64-bit floats internally, so unchecked additions would overflow into
    // float territory and break the bit-mixing below.
    s = (s + 0x6d2b79f5) >>> 0;

    // Avalanche the state through a sequence of multiply-xor-shift ("MXS")
    // rounds. Each round spreads a single bit change across the whole word,
    // destroying autocorrelation. `Math.imul` performs true 32-bit
    // multiplication (no 64-bit intermediate), which is what we need here.
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);        // mix high bits down
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);   // mix again with different shift
    t = (t ^ (t >>> 14)) >>> 0;                   // final avalanche; `>>> 0` → uint32

    // Divide by 2³² to map the uint32 onto [0, 1).
    // We never quite reach 1.0 because t ≤ 2³²−1 → t/2³² ≤ 1 − 2⁻³².
    return t / 4294967296;
  };
}

// ─── Cloud generator ─────────────────────────────────────────────────────────

/**
 * Generate a synthetic `PointCloud` of `count` fictitious galaxies distributed
 * uniformly inside a sphere of radius 1000 Mpc.
 *
 * ---
 * ### Why rejection sampling?
 *
 * A beginner's first instinct is to draw a random direction on the unit sphere
 * and scale it by a random radius:
 *
 *     r = rand()^(1/3) * radius   // so density ∝ r² cancels the volume element
 *     point = unitVector * r
 *
 * That formula *does* give uniform-in-sphere points but requires a cube-root
 * and a unit-vector normalisation (which itself needs a square root and a
 * guard against division by zero).
 *
 * An even simpler mistake is just `rand() * radius` — that over-populates the
 * centre because the volume of a thin shell grows as r², so the PDF of r alone
 * should be ∝ r², not uniform.
 *
 * Rejection sampling avoids both problems with only arithmetic:
 *
 *  1. Draw (x, y, z) uniformly in the cube [−1, +1]³.
 *  2. If the point lands *outside* the unit sphere (x²+y²+z² > 1), discard it
 *     and try again.
 *  3. Scale the accepted point by `radius`.
 *
 * Because the cube is the same box regardless of sphere radius, every accepted
 * point is uniformly distributed inside the unit ball by construction — no
 * transcendental functions needed.
 *
 * **Acceptance rate**: the volume of the unit sphere is (4/3)π ≈ 4.189, while
 * the enclosing cube has volume 2³ = 8. The ratio is π/6 ≈ 52.4 %, so roughly
 * 1 in 2 cube samples is accepted. That means we draw ≈ 1.91 × count random
 * triples on average — acceptable for a one-time initialisation.
 *
 * ---
 * ### Magnitude and color-index ranges
 *
 * `magnitudes[i]` is drawn uniformly from [14, 22].
 *   - 14 is about the brightest SDSS main-sample galaxy (roughly L* galaxies
 *     at z ≈ 0.01).
 *   - 22 is near the faint limit of the SDSS spectroscopic survey.
 *   - Recall that magnitude is *inverted*: 14 is ~250× brighter than 22.
 *
 * `colorIndex[i]` (proxy for SDSS u−g) is drawn uniformly from [0, 2].
 *   - u−g ≈ 0.8–1.2 for star-forming ("blue cloud") galaxies.
 *   - u−g ≈ 1.6–2.2 for quiescent ("red sequence") ellipticals.
 *   - The [0, 2] range covers both populations with a little headroom.
 *
 * @param count  Number of points to generate. 100_000 is the default for the
 *               stand-in cloud; reduce during development if you need faster
 *               page loads.
 * @param seed   Integer seed for the mulberry32 PRNG. Changing this gives a
 *               different (but equally deterministic) cloud layout.
 */
export function generateSyntheticCloud(count: number, seed = 42): PointCloud {
  const rand = mulberry32(seed);

  // Allocate all three arrays up front. Typed arrays are cheap to allocate
  // but expensive to grow, so size them exactly once rather than push()-ing.
  const positions = new Float32Array(count * 3);  // (x, y, z) per point, Mpc
  const magnitudes = new Float32Array(count);     // apparent magnitude, ~[14, 22]
  const colorIndex = new Float32Array(count);     // u−g proxy, ~[0, 2]

  // Sphere radius in Mpc. 1000 Mpc corresponds to a redshift of roughly
  // z ≈ 0.23 under Hubble's law (c·z/H₀, H₀=70), which is well inside the
  // SDSS main galaxy sample depth.
  const radius = 1000; // Mpc

  for (let i = 0; i < count; i++) {
    // ── Rejection-sample a uniform-in-sphere position ──────────────────────
    let x: number, y: number, z: number, r2: number;

    do {
      // Map three [0,1) samples to the cube [−1, +1]³.
      x = rand() * 2 - 1;
      y = rand() * 2 - 1;
      z = rand() * 2 - 1;

      // Squared distance from origin. We compare against 1 (not sqrt against
      // 1.0) to avoid a square root in the hot loop — squaring the threshold
      // is equivalent and cheaper.
      r2 = x * x + y * y + z * z;
    } while (r2 > 1); // reject points outside the unit sphere

    // Scale from the unit ball to the desired physical radius.
    positions[i * 3 + 0] = x * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = z * radius;

    // ── Apparent magnitude in [14, 22] ─────────────────────────────────────
    // 14 + rand()*8 spans [14, 22). A finer model would correlate magnitude
    // with distance (closer = brighter), but uniform is fine for a stand-in.
    magnitudes[i] = 14 + rand() * 8;

    // ── Color index (u−g proxy) in [0, 2] ──────────────────────────────────
    // rand()*2 spans [0, 2). This deliberately mixes blue-cloud and red-
    // sequence galaxies without any spatial clustering — again, fine for
    // testing the shader color ramp before real data arrives.
    colorIndex[i] = rand() * 2;
  }

  return { count, positions, magnitudes, colorIndex };
}
