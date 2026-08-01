// lib/valueNoise.wesl — deterministic 1D value noise for per-fragment
// along-lane crinkle (milkyWayField/dustFeature.wesl), so a dust lane reads
// fractal instead of a piped, single-frequency ripple (the M74 requirement,
// design doc N1).
//
// pcgHash1 restates flow.wesl's own pcg mix rather than importing it: that
// module's header scopes pcgHash/rand01 to the flow renderer's own compute
// and render passes (and bundles flow-specific RNG salts alongside them),
// so importing it here would pull an unrelated domain's ownership across a
// module boundary for one hash function. lib/util.wesl's hash21/valueNoise2
// are the closest existing alternative but take a 2D input tuned for
// screen-space dither, not a 1D along-curve coordinate.

// pcgHash1 — u32 -> u32 avalanche (Jarzynski & Olano's PCG family), the
// same mix flow.wesl's own copy uses.
fn pcgHash1(vin: u32) -> u32 {
  var s = vin * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}

// latticeHash1 — deterministic [0,1) value at integer lattice point 'i'.
// bitcast, not a cast: hashing wants the bit pattern, and a negative i's
// two's-complement bits are exactly as well-distributed an input as a
// positive one's.
fn latticeHash1(i: i32) -> f32 {
  return f32(pcgHash1(bitcast<u32>(i))) / 4294967295.0;
}

// valueNoise1D — smoothstep-interpolated 1D value noise, two octaves (unit
// wavelength, then half that at 35% weight) so a single sine-like wobble
// doesn't read as a wallpaper repeat. 'x' carries its own decorrelation
// (the caller folds a per-feature seed additively into it) rather than
// taking a separate seed parameter — one fewer thing for every call site to
// thread through.
fn valueNoise1D(x: f32) -> f32 {
  let i0 = floor(x);
  let f0 = x - i0;
  let t0 = f0 * f0 * (3.0 - 2.0 * f0);
  let base = mix(latticeHash1(i32(i0)), latticeHash1(i32(i0) + 1), t0);

  // Octave 2 lattice offset by a large constant so its small integers never
  // alias octave 1's at small |x| (both would otherwise hash the same cells
  // near the origin).
  let x2 = x * 2.0;
  let i1 = floor(x2);
  let f1 = x2 - i1;
  let t1 = f1 * f1 * (3.0 - 2.0 * f1);
  let detail = mix(latticeHash1(i32(i1) + 4096), latticeHash1(i32(i1) + 4097), t1);

  return base * 0.65 + detail * 0.35;
}
