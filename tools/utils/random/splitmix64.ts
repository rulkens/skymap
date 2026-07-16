/**
 * splitmix64 — a stateless integer hash mixing one 64-bit input into a
 * well-distributed 64-bit output.
 *
 * It is used here not as a stream RNG (its usual role) but as a *pure hash of a
 * star's identity*: the GCNS supplement taper needs a keep/drop coin that is a
 * deterministic function of a star's Gaia DR3 `source_id`, never a stateful PRNG.
 * A stateful generator would make the decision depend on iteration order, so a
 * rebuild — or the parallel Rust builder that is compared record-for-record
 * against this one — could disagree on which faint dwarf survives near the 100 pc
 * shell. Hashing the id makes the decision reproducible and order-independent.
 *
 * The constants and shift/xor/multiply schedule are the reference splitmix64
 * (Steele, Lea & Flood, 2014). The TS port masks with `& 0xFFFFFFFFFFFFFFFFn`
 * after every add and multiply because `BigInt` is unbounded — without the mask
 * the intermediate products would grow past 64 bits and diverge from the Rust
 * builder's wrapping `u64` arithmetic. Known answer: `splitmix64(0n)` =
 * `0xE220A8397B1DCDAFn`.
 */
const U64_MASK = 0xffffffffffffffffn;
const GOLDEN_GAMMA = 0x9e3779b97f4a7c15n;

export function splitmix64(x: bigint): bigint {
  let z = (x + GOLDEN_GAMMA) & U64_MASK;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64_MASK;
  return (z ^ (z >> 31n)) & U64_MASK;
}
