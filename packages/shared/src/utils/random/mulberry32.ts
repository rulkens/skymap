/**
 * Mulberry32 — a tiny, deterministic, seedable pseudo-random number generator.
 *
 * Mulberry32 (Tommy Ettinger) is a 32-bit-state hash-based PRNG. It is *not*
 * cryptographically secure, but it has excellent statistical properties for
 * visual noise — it passes the SmallCrush battery — and is fast enough to
 * generate millions of values per second in JavaScript.
 *
 * Why a custom PRNG instead of `Math.random()`? `Math.random()` re-seeds itself
 * from OS entropy on every page load, so anything driven by it changes every
 * time you refresh — making visual regressions impossible to reproduce. A
 * seeded generator means the same input always produces the same sequence, in
 * every browser, forever.
 *
 * Reference:
 *   https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 */

/**
 * Create a Mulberry32 PRNG seeded at `seed`.
 *
 * The returned closure advances the internal state on every call and returns
 * a float in [0, 1). Two generators with the same seed produce identical
 * sequences but are completely independent of each other (the state lives in
 * the closure, not a shared global).
 *
 * @param seed  Any 32-bit integer. `>>> 0` coerces it to an unsigned 32-bit
 *              integer so negative values, floats, and NaN behave deterministically.
 */
export function mulberry32(seed: number): () => number {
  // `>>> 0` forces the seed into the uint32 range [0, 2³²).
  // Without this a caller passing -1 or 42.7 would produce a different
  // sequence than they might expect (JS bitwise ops already do this
  // internally, but being explicit avoids subtle bugs if seed is e.g. NaN).
  let s = seed >>> 0;

  return (): number => {
    // Advance state: add the "golden-ratio-like" increment 0x6d2b79f5 (an LCG
    // constant chosen to hit every 32-bit value before repeating).
    // `>>> 0` after every arithmetic op keeps us in uint32 — JS integers are
    // 64-bit floats internally, so unchecked additions would overflow into
    // float territory and break the bit-mixing below.
    s = (s + 0x6d2b79f5) >>> 0;

    // Avalanche the state through a sequence of multiply-xor-shift ("MXS")
    // rounds. Each round spreads a single bit change across the whole word,
    // destroying autocorrelation. `Math.imul` performs true 32-bit
    // multiplication (no 64-bit intermediate), which is what we need here.
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); // mix high bits down
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); // mix again with different shift
    t = (t ^ (t >>> 14)) >>> 0; // final avalanche; `>>> 0` → uint32

    // Divide by 2³² to map the uint32 onto [0, 1).
    // We never quite reach 1.0 because t ≤ 2³² − 1 → t/2³² ≤ 1 − 2⁻³².
    return t / 4294967296;
  };
}
