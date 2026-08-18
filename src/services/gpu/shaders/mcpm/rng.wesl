// mcpm/rng.wesl — Polyphorm's two-word Marsaglia MWC generator and its wang_hash
// seeding, ported bit-for-bit from cs_agents_propagate.hlsl:34-70 (which cs_field_decay
// and cs_density_histo copy verbatim).
//
// Every constant, shift and evaluation order is the fork's, and the number and ORDER of
// draws in a kernel is part of the simulation's identity — a "better" generator, or a
// draw hoisted out of a branch, is a different simulation. The seed guard carries an
// upstream typo behind QUIRK_RNG_SEED_GUARD_TYPO. Fork spellings: wang_hash, set_seed,
// random_uint, random_float -> wangHash, rngSetSeed, rngNextUint, rngNextFloat.

import package::mcpm::constants::QUIRK_RNG_SEED_GUARD_TYPO;

const RNG_BAD_W: u32 = 0x464fffffu;
const RNG_BAD_Z: u32 = 0x9068ffffu;

struct Rng {
  mW: u32,
  mZ: u32,
};

fn wangHash(seedIn: u32) -> u32 {
  var seed = seedIn;
  seed = (seed ^ 61u) ^ (seed >> 16u);
  seed = seed * 9u;
  seed = seed ^ (seed >> 4u);
  seed = seed * 0x27d4eb2du;
  seed = seed ^ (seed >> 15u);
  return seed;
}

fn rngSetSeed(rng: ptr<function, Rng>, seed1: u32, seed2: u32) {
  (*rng).mW = seed1;
  (*rng).mZ = seed2;
  if ((*rng).mW == 0u || (*rng).mW == RNG_BAD_W) { (*rng).mW = (*rng).mW + 1u; }
  if (QUIRK_RNG_SEED_GUARD_TYPO) {
    // HLSL:44 verbatim: it tests mW where it plainly means mZ, so a zero mZ is never
    // repaired and the mW half is dead — the guard above already made mW non-zero.
    if ((*rng).mW == 0u || (*rng).mZ == RNG_BAD_Z) { (*rng).mZ = (*rng).mZ + 1u; }
  } else {
    if ((*rng).mZ == 0u || (*rng).mZ == RNG_BAD_Z) { (*rng).mZ = (*rng).mZ + 1u; }
  }
}

fn rngNextUint(rng: ptr<function, Rng>) -> u32 {
  (*rng).mZ = 36969u * ((*rng).mZ & 65535u) + ((*rng).mZ >> 16u);
  (*rng).mW = 18000u * ((*rng).mW & 65535u) + ((*rng).mW >> 16u);
  return ((*rng).mZ << 16u) + (*rng).mW;
}

// f32(0xFFFFFFFFu) rounds to 4294967296.0 in HLSL and WGSL alike, so the [0,1) mapping
// is bit-identical to the fork's.
fn rngNextFloat(rng: ptr<function, Rng>) -> f32 {
  return f32(rngNextUint(rng)) / f32(0xFFFFFFFFu);
}
