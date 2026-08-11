// milkyWay/sprites/generate.wesl — shader-math derivation file (exceeds the usual
// header/comment budget on that basis): the shared GPU galaxy-generation library, a
// stateless hash RNG plus every population's generation math, consumed by the two
// compute entry points (star pass, dust pass). Slot budgets are a caller contract —
// every helper's reserved-slot count is load-bearing, not decorative.
//
// ## Why a STATELESS hash instead of a serial PRNG
//
// A single shared random stream, walked serially one star at a time, can't be
// shared across the millions of parallel invocations a compute dispatch
// runs — advancing shared state is exactly the thing thousands of threads
// cannot do without serialising. So instead each invocation DERIVES its
// random values from a pure hash of (seed, population, invocation index,
// slot). 'genRand(seed, pop, idx, slot)' is a pure function: two calls with
// the same arguments always return the same float, and no thread's draw
// perturbs any sibling's. A neighbour thread that needs the same value just
// recomputes the hash for free — there is no stream to rewind, no state to
// contend on. The cost of that freedom is that a serial draw ORDER (which
// matters, since the sequence of draws is itself part of the visual result)
// is replaced by a fixed SLOT budget per invocation: each helper documents
// how many slots it reserves so successive consumers never alias each
// other's hash inputs.
//
// ## Why galaxy-level values arrive via the UBO, not the hash
//
// A handful of quantities are computed ONCE up front — the bar tilt, the
// per-arm personality, the asymmetry values, the scale constants — and are
// shared by every invocation. Re-deriving them per thread from a hash would
// be both wasteful and wrong (some depend on a serial draw sequence that only
// makes sense computed once). Those are packed into 'GenUniforms' (see
// packGenerationUniforms.ts / generationUboLayout.ts) and read here directly.
// Rule of thumb: per-STAR randomness comes from the hash; per-GALAXY values
// come from the UBO.
//
// ## Why the @group(0) bindings live in THIS lib
//
// WGSL resource bindings are module-scope by design. The 'gen' uniform and
// the stride-8 output storage array are declared here ONCE and shared by
// both entry shaders, so the helper fns below read the module-scope 'gen'
// directly instead of threading a pointer through every call. The two passes
// (stars, dust) bind DIFFERENT buffers to the same @binding declarations at
// dispatch time — same declaration, different backing buffer per pass — which
// is precisely what module-scope bindings are for.

import package::lib::util::hashAvalanche;

// pi, in f32. The f32 rounding is in the ~7th digit — a negligible angular
// error everywhere it is used (Box-Muller phase, arm/bar angles).
const PI: f32 = 3.14159265358979323846;

// 1 / 2^32 — the [0, 2^32) hash output scaled into [0, 1). Exactly
// representable in f32 (a power of two), so this factor introduces no error;
// the precision loss is in the f32(u32) cast of the hash word itself.
const INV_2POW32: f32 = 1.0 / 4294967296.0;

// GenUniforms — mirrors GENERATION_UBO (generationUboLayout.ts) field-for-
// field, declaration order == byte-layout order. Each scalar 'group' packs
// four-per-vec4 with its trailing lanes as explicit '_pad' fields, so the
// WGSL struct's own alignment rules reproduce the packer's byte offsets
// exactly (total 1648 bytes). Never reorder or renumber; append only, to
// match the layout file's own contract.
struct GenUniforms {
  // scale group (6 scalars + 2 pad)
  outerRadius: f32,
  diskScaleLen: f32,
  bulgeRadius: f32,
  diskHeight: f32,
  grainScale: f32,
  starSize: f32,
  _padScale0: f32,
  _padScale1: f32,

  // asymmetry group (8 scalars, no pad)
  flattening: f32,
  asymmetry: f32,
  lopsidedAmp: f32,
  lopsidedAngle: f32,
  bulgeAxisZ: f32,
  cosBulge: f32,
  sinBulge: f32,
  bulgeConcentration: f32,

  // bar group (3 scalars + 1 pad)
  barLength: f32,
  cosBar: f32,
  sinBar: f32,
  _padBar0: f32,

  // warp group (3 scalars + 1 pad)
  warpStrength: f32,
  warpTwist: f32,
  warpStartRadius: f32,
  _padWarp0: f32,

  // dust group (7 scalars + 1 pad)
  dustAmount: f32,
  dustNoiseAmt: f32,
  noiseFreq: f32,
  clumpAmount: f32,
  ringRadius: f32,
  ringWidth: f32,
  ringStrength: f32,
  _padDust0: f32,

  // arms group (7 scalars + 1 pad)
  subArmAmount: f32,
  waveAmount: f32,
  armStartRadius: f32,
  armWidthFactor: f32,
  armFullRadius: f32,
  armInnerRampW: f32,
  weightSum: f32,
  _padArms0: f32,

  // misc group (6 scalars + 2 pad)
  globularSize: f32,
  globularBright: f32,
  youngFraction: f32,
  hiiIntensity: f32,
  irrBarOffset: f32,
  extraScale: f32,
  _padMisc0: f32,
  _padMisc1: f32,

  // palette + transform vec4s
  hiiCore: vec4<f32>,   // (r, g, b, 0)
  hiiHalo: vec4<f32>,   // (r, g, b, 0)
  extraPos: vec4<f32>,  // (x, y, z, 0)
  extraRot: vec4<f32>,  // (cosRotY, sinRotY, cosTiltX, sinTiltX)

  // u32 group (8 u32, no pad)
  seed: u32,
  noiseSeed: u32,
  category: u32,
  numArms: u32,
  starCapacity: u32,
  dustCapacity: u32,
  starRangeCount: u32,
  dustRangeCount: u32,

  // fixed-size arrays. armTable holds 8
  // arms * 4 vec4 each (16 floats/arm, lanes per armTableLayout); the range
  // arrays hold u32 quads (start, iterations, stride, popId — carveLayout).
  armTable: array<vec4<f32>, 32>,
  clumpCenters: array<vec4<f32>, 7>,
  cloudCenters: array<vec4<f32>, 34>,
  starRanges: array<vec4<u32>, 7>,
  dustRanges: array<vec4<u32>, 5>,
}

// The two shared bindings, declared once (see module header). Both entry
// shaders import these and bind their own per-pass buffers to them.
@group(0) @binding(0) var<uniform> gen: GenUniforms;
@group(0) @binding(1) var<storage, read_write> outBuf: array<f32>;

// ---------------------------------------------------------------------------
// Stateless hash RNG
// ---------------------------------------------------------------------------

// pcg4d — the 4D PCG-family hash from Jarzynski & Olano, 'Hash Functions for
// GPU Rendering' (JCGT 2020). WGSL u32 multiply and add both wrap mod 2^32,
// matching the paper's reference GLSL exactly. Only downstream f32 casts of
// the result lose precision.
fn pcg4d(vIn: vec4<u32>) -> vec4<u32> {
  var v = vIn * 1664525u + 1013904223u;
  // cross-feed adds — each lane stirred by two others
  v.x = v.x + v.y * v.w;
  v.y = v.y + v.z * v.x;
  v.z = v.z + v.x * v.y;
  v.w = v.w + v.y * v.z;
  // avalanche: fold the high bits down
  v = v ^ (v >> vec4<u32>(16u));
  // cross-feed adds again
  v.x = v.x + v.y * v.w;
  v.y = v.y + v.z * v.x;
  v.z = v.z + v.x * v.y;
  v.w = v.w + v.y * v.z;
  return v;
}

// genRand — one uniform draw in [0, 1) for a given slot. The f32(u32) cast
// rounds the 32-bit hash word to f32's 24-bit mantissa before scaling — a
// precision loss inherent to f32 GPU math. The distribution is unaffected.
fn genRand(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 {
  return f32(pcg4d(vec4<u32>(seed, pop, idx, slot)).x) * INV_2POW32;
}

// genNormal — one Box-Muller normal (mean 0, stddev 1) from slots {slot,
// slot+1}. u1 is clamped to 1e-38 (f32's smallest positive normal) before the
// log, guarding against log(0).
fn genNormal(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 {
  let u1 = max(genRand(seed, pop, idx, slot), 1e-38);
  let u2 = genRand(seed, pop, idx, slot + 1u);
  return sqrt(-2.0 * log(u1)) * cos(2.0 * PI * u2);
}

// randomLuminosity — steep-tailed stellar luminosity. Reserves 3 slots: u
// (slot), the flare gate (slot+1), and the flare magnitude (slot+2). Slot+2
// is ALWAYS drawn regardless of the gate, so the next consumer's slot budget
// stays fixed — the flare value simply goes unused (contributes 0) when the
// gate fails.
fn randomLuminosity(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 {
  let u = genRand(seed, pop, idx, slot);
  let gate = genRand(seed, pop, idx, slot + 1u);
  let flareRand = genRand(seed, pop, idx, slot + 2u);
  var flare = 0.0;
  if (gate < 0.012) {
    flare = 3.2 * flareRand;
  }
  return 0.12 + 0.4 * u * u * u + flare;
}

// sampleDiskRadius — rejection-sampled exponential disk radius. Reserves 12
// slots: up to 6 attempts, each drawing a pair {2k, 2k+1}. Tries up to 6
// times, accepting the first radius within outerRadius*1.5; the 6th attempt
// is CLAMPED rather than rejected (never dead). Early acceptance leaves later
// slots unhashed, but the 12-slot reservation is a caller contract so
// successive consumers still line up.
fn sampleDiskRadius(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 {
  let limit = gen.outerRadius * 1.5;
  var radius = limit;
  for (var attempt = 0u; attempt < 6u; attempt = attempt + 1u) {
    let s = slot + attempt * 2u;
    let a = genRand(seed, pop, idx, s);
    let b = genRand(seed, pop, idx, s + 1u);
    radius = -gen.diskScaleLen * (log(a) + log(b));
    if (radius <= limit) {
      break;
    }
  }
  return min(radius, limit);
}

// ---------------------------------------------------------------------------
// Value noise — a seeded 3D lattice noise for dust density modulation
// ---------------------------------------------------------------------------

// Cubic smoothstep 3t^2 - 2t^3: zero slope at t=0 and t=1 so trilinear-blended
// cells join seamlessly.
fn nSmooth(t: f32) -> f32 {
  return t * t * (3.0 - 2.0 * t);
}

fn nLerp(a: f32, b: f32, t: f32) -> f32 {
  return a + (b - a) * t;
}

// nHash — u32 lattice hash: three large-prime multiplies plus an
// avalanche/xor-shift pair (lib/util.wesl's hashAvalanche, shared with
// integerHash3 there), matching a 32-bit wrap-multiply hash's bit pattern up
// to the final f32 division (which rounds the 32-bit word to f32, a small
// precision loss). The integer lattice coords arrive as i32 (they can be
// negative) and are bitcast to u32 so the wrap-multiply matches
// two's-complement 32-bit truncation semantics.
fn nHash(xi: i32, yi: i32, zi: i32, s: u32) -> f32 {
  let xu = bitcast<u32>(xi);
  let yu = bitcast<u32>(yi);
  let zu = bitcast<u32>(zi);
  let h = xu * 374761393u + yu * 668265263u + zu * 2147483647u + s * 974711u;
  return f32(hashAvalanche(h)) * INV_2POW32;
}

// valueNoise3 — seeded 3D value noise, [0, 1). floor() BEFORE the i32 cast so
// negative coords floor (not truncate toward zero), matching Math.floor. The
// trilinear blend order is x edges, then y, then z.
fn valueNoise3(p: vec3<f32>, seed: u32) -> f32 {
  let xi = i32(floor(p.x));
  let yi = i32(floor(p.y));
  let zi = i32(floor(p.z));
  let xf = nSmooth(p.x - floor(p.x));
  let yf = nSmooth(p.y - floor(p.y));
  let zf = nSmooth(p.z - floor(p.z));

  let x00 = nLerp(nHash(xi, yi, zi, seed), nHash(xi + 1, yi, zi, seed), xf);
  let x10 = nLerp(nHash(xi, yi + 1, zi, seed), nHash(xi + 1, yi + 1, zi, seed), xf);
  let x01 = nLerp(nHash(xi, yi, zi + 1, seed), nHash(xi + 1, yi, zi + 1, seed), xf);
  let x11 = nLerp(nHash(xi, yi + 1, zi + 1, seed), nHash(xi + 1, yi + 1, zi + 1, seed), xf);
  return nLerp(nLerp(x00, x10, yf), nLerp(x01, x11, yf), zf);
}

// dustNoiseAt — two-octave dust sample. Base octave runs y at half frequency;
// the 2.3x-frequency detail layer is half-weighted and the sum is normalised
// by 1.5 (1 + 0.5) to stay roughly in [0, 1). Both octaves read
// gen.noiseSeed (the dust field's decorrelated seed) and gen.noiseFreq
// ('nfreq' = 2.4 * dustNoiseScale / outerRadius, per 'packGenerationUniforms').
fn dustNoiseAt(p: vec3<f32>) -> f32 {
  let f = gen.noiseFreq;
  let base = valueNoise3(vec3<f32>(p.x * f, p.y * f * 0.5, p.z * f), gen.noiseSeed);
  let detail = valueNoise3(vec3<f32>(p.x * f * 2.3, p.y * f, p.z * f * 2.3), gen.noiseSeed);
  return (base + 0.5 * detail) / 1.5;
}

// ---------------------------------------------------------------------------
// Colour + shaping helpers
// ---------------------------------------------------------------------------

// tempColorRamp — stellar colour ramp. Six hand-picked stops, cool (red) to
// hot (blue). t is clamped to [0, 0.999] before scaling by (6 stops - 1) = 5
// so the index never runs past the final stop. A local var array is used
// (not a module const) so the runtime index is portable across every WGSL
// backend.
fn tempColorRamp(t: f32) -> vec3<f32> {
  var stops = array<vec3<f32>, 6>(
    vec3<f32>(1.0, 0.36, 0.16),
    vec3<f32>(1.0, 0.58, 0.28),
    vec3<f32>(1.0, 0.83, 0.55),
    vec3<f32>(1.0, 0.97, 0.9),
    vec3<f32>(0.79, 0.86, 1.0),
    vec3<f32>(0.6, 0.72, 1.0)
  );
  let scaled = clamp(t, 0.0, 0.999) * 5.0;  // (stop count - 1)
  let i = i32(scaled);                       // scaled | 0 (scaled >= 0, so trunc == floor)
  let f = scaled - f32(i);
  let a = stops[i];
  let b = stops[i + 1];
  return a + (b - a) * f;
}

// hiiCorePerturbed — the HII-region core colour: the palette core
// (gen.hiiCore) with its green and blue channels nudged up by 'cv' and
// clamped to 1. Red is untouched.
fn hiiCorePerturbed(cv: f32) -> vec3<f32> {
  return vec3<f32>(
    gen.hiiCore.x,
    min(1.0, gen.hiiCore.y + cv),
    min(1.0, gen.hiiCore.z + cv)
  );
}

// warpOffset — the galactic-warp vertical offset. Zero inside
// warpStartRadius (the flat inner disk); beyond it the disk bends
// out of plane as rel^2, with the line of nodes precessing by warpTwist * rel.
// Math.hypot(x, z) maps to length(vec2(x, z)).
fn warpOffset(x: f32, z: f32) -> f32 {
  if (gen.warpStrength <= 0.0) {
    return 0.0;
  }
  let rr = length(vec2<f32>(x, z));
  if (rr <= gen.warpStartRadius) {
    return 0.0;
  }
  let rel = (rr - gen.warpStartRadius) / max(1e-4, gen.outerRadius - gen.warpStartRadius);
  let node = gen.warpTwist * rel;  // line of nodes precesses with radius
  return gen.warpStrength * gen.outerRadius * 0.4 * rel * rel * sin(atan2(z, x) - node);
}

// applyLopsided — large-scale one-sided radius modulation.
fn applyLopsided(radius: f32, angle: f32) -> f32 {
  return radius * (1.0 + gen.lopsidedAmp * cos(angle - gen.lopsidedAngle));
}

// diskFalloff — exponential disk density falloff.
fn diskFalloff(radius: f32, softness: f32) -> f32 {
  return exp(-radius / (gen.diskScaleLen * softness));
}

// applyExtraTransform — the rigid background-galaxy transform: scale, then Y
// spin (disk), then X tilt (inclination), then translate. gen.extraRot packs
// (cosRotY, sinRotY, cosTiltX, sinTiltX); gen.extraScale and gen.extraPos
// supply the scale and translation. POSITION only — the record's size is
// scaled by gen.extraScale at the write site (writeStar / writeDustParticle),
// so builders stay transform-free. Identity for a standalone galaxy, where the
// packer writes scale 1, zero rotation, zero translation into the extra lanes.
// The step ORDER (Y spin before X tilt) is not a general rotation a reader can
// reorder: swapping them changes the tilt axis relative to the already-spun
// disk, producing a visibly different galaxy.
fn applyExtraTransform(p: vec3<f32>) -> vec3<f32> {
  let s = gen.extraScale;
  let cy = gen.extraRot.x;
  let sy = gen.extraRot.y;
  let cx = gen.extraRot.z;
  let sx = gen.extraRot.w;
  let x = p.x * s;
  let y = p.y * s;
  let z = p.z * s;
  let x1 = x * cy - z * sy;   // Y spin (disk axis)
  let z1 = x * sy + z * cy;
  let y2 = y * cx - z1 * sx;  // X tilt (inclination), on the already-spun y/z1
  let z2 = y * sx + z1 * cx;
  return vec3<f32>(x1 + gen.extraPos.x, y2 + gen.extraPos.y, z2 + gen.extraPos.z);
}

// ---------------------------------------------------------------------------
// Record write helpers — the stride-8 output layout
// ---------------------------------------------------------------------------

// One generated star / dust particle, in value form. 'alive' is consulted by
// the entry-shader compaction (later tasks), not by the low-level writers
// below — a record is only handed to writeStar/writeDust once its slot is
// decided. These are function-local value types only; they are never placed
// in a host-shared buffer, so the 'bool' field is fine.
struct StarRec {
  pos: vec3<f32>,
  color: vec3<f32>,
  size: f32,
  brightness: f32,
  alive: bool,
}

struct DustRec {
  pos: vec3<f32>,
  size: f32,
  color: vec3<f32>,
  opacity: f32,
  alive: bool,
}

// writeStar — the shared star finalize + write path: bake the rigid extra-
// galaxy transform onto the record, then interleave into the stride-8 output
// at record 'index', field order x,y,z,r,g,b,size,brightness. Every star
// builder returns a StarRec in the galaxy's own local space; this ONE choke
// point (every builder's result flows through here via the entry shader)
// places it in world space — position through
// applyExtraTransform, size scaled by gen.extraScale — exactly as
// writeDustParticle does for dust. For a standalone galaxy the transform is
// identity (extraScale == 1, zero rotation, zero translation), so the local
// record writes through byte-unchanged; a background 'extra' rides its own
// UBO transform lanes so its stars land pre-placed in the scene without any
// per-draw model matrix (see applyExtraTransform's docblock for why baking at
// generation time dodges the writeBuffer-vs-submit race a per-draw uniform
// would reopen).
fn writeStar(index: u32, rec: StarRec) {
  let base = index * 8u;
  let pos = applyExtraTransform(rec.pos);
  outBuf[base + 0u] = pos.x;
  outBuf[base + 1u] = pos.y;
  outBuf[base + 2u] = pos.z;
  outBuf[base + 3u] = rec.color.x;
  outBuf[base + 4u] = rec.color.y;
  outBuf[base + 5u] = rec.color.z;
  outBuf[base + 6u] = rec.size * gen.extraScale;
  outBuf[base + 7u] = rec.brightness;
}

// writeDust — interleave one dust particle into the stride-8 output at record
// 'index', field order x,y,z,size,r,g,b,opacity. Size precedes colour here —
// the opposite of stars — matching the GPU dust-quad vertex layout; it is
// carried as-is, not 'fixed'.
fn writeDust(index: u32, rec: DustRec) {
  let base = index * 8u;
  outBuf[base + 0u] = rec.pos.x;
  outBuf[base + 1u] = rec.pos.y;
  outBuf[base + 2u] = rec.pos.z;
  outBuf[base + 3u] = rec.size;
  outBuf[base + 4u] = rec.color.x;
  outBuf[base + 5u] = rec.color.y;
  outBuf[base + 6u] = rec.color.z;
  outBuf[base + 7u] = rec.opacity;
}

// ---------------------------------------------------------------------------
// Population builders — batch A (bulge, bar, disk)
// ---------------------------------------------------------------------------
//
// Each builder returns the StarRec for the given 'iteration'. Every draw
// reads a fixed SLOT so the hash inputs never alias; the numbered comments
// below map each draw to its slot.
//
// ## The rejection-retry convention (bulge, bar)
//
// An out-of-range draw is rejected and resampled — the population's record
// count stays unchanged (the loop keeps trying until it lands in range). A
// stateless hash cannot 'redraw' from a stream, so a rejected attempt k
// re-hashes the WHOLE iteration at slot + 64*k: each retry gets its own
// disjoint 64-slot window so its draws never alias the previous attempt's.
// After 8 attempts the record is declared dead — a finite budget standing in
// for an unbounded resample, with negligible probability of ever biting.
// Every galaxy-level value (bulge axes, bar geometry, flattening...) comes
// from 'gen' — never re-derived per invocation; only the per-STAR draws come
// from the hash.
//
// Every builder composes the galactic-warp vertical offset onto y with
// 'y + warpOffset(x, z)' so the returned record already carries the warp.

// buildBulge — old, warm stars in a triaxial spheroid. Radial rejection
// loop; retry at +64*k, dead after 8. Two radial branches (elliptical
// falloff vs disk-bulge) share the single radial draw at slot 0.
fn buildBulge(iteration: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 0u;

  for (var k = 0u; k < 8u; k = k + 1u) {
    let base = 64u * k;
    // slot 0: radial draw (shared by both radial branches)
    let u = genRand(seed, pop, iteration, base + 0u);
    var dist: f32;
    var brightnessFalloff: f32;
    if (gen.category == 0u) {
      // elliptical: heavy-tailed profile + soft brightness falloff
      dist = gen.outerRadius * 0.16 * pow(-log(1.0 - u * 0.997), 1.3);
      if (dist > gen.outerRadius * 1.6) { continue; } // out of range — resample
      brightnessFalloff = exp(-dist / (gen.outerRadius * (0.62 - 0.4 * gen.bulgeConcentration)));
    } else {
      // disk-galaxy bulge: smaller, blends into disk
      dist = gen.bulgeRadius * 0.55 * pow(-log(1.0 - u * 0.997), 1.25);
      if (dist > gen.bulgeRadius * 2.8) { continue; } // out of range — resample
      brightnessFalloff = exp(-dist / (gen.bulgeRadius * (1.5 - 1.0 * gen.bulgeConcentration)));
    }
    // Uniform direction on a sphere, squashed/rotated into a triaxial ellipsoid.
    let cosLat = 2.0 * genRand(seed, pop, iteration, base + 1u) - 1.0; // slot 1
    let sinLat = sqrt(1.0 - cosLat * cosLat);
    let lon = 2.0 * PI * genRand(seed, pop, iteration, base + 2u);     // slot 2
    let bulgeAxisX = 1.0;                                              // fixed axis, not in UBO
    let localX = dist * sinLat * cos(lon) * bulgeAxisX;
    let localY = dist * cosLat * gen.flattening;                      // bulgeAxisY = flattening
    let localZ = dist * sinLat * sin(lon) * gen.bulgeAxisZ;
    let x = localX * gen.cosBulge - localZ * gen.sinBulge;
    let z = localX * gen.sinBulge + localZ * gen.cosBulge;
    let y = localY;
    // slot 3: warm/old population colour jitter
    let color = tempColorRamp(0.27 + 0.15 * genRand(seed, pop, iteration, base + 3u));
    // slot 4: size jitter
    let size = gen.starSize * (0.8 + 0.5 * genRand(seed, pop, iteration, base + 4u));
    // slots 5-7: randomLuminosity
    let brightness = randomLuminosity(seed, pop, iteration, base + 5u) * 0.85 * brightnessFalloff;

    var rec: StarRec;
    rec.pos = vec3<f32>(x, y + warpOffset(x, z), z); // warp folded into y
    rec.color = color;
    rec.size = size;
    rec.brightness = brightness;
    rec.alive = true;
    return rec;
  }
  return dead;
}

// buildBar — for barred spirals, an elongated stellar bar. |alongBar| > 1.25
// rejection; retry at +64*k, dead after 8. Only reachable when the bar range
// exists (carveStarLayout omits it for non-barred), so no category test is
// needed inside the builder — the range table already enforces it upstream.
fn buildBar(iteration: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 1u;

  for (var k = 0u; k < 8u; k = k + 1u) {
    let base = 64u * k;
    // slots 0-1: position along the bar, a clamped gaussian
    let alongBar = genNormal(seed, pop, iteration, base + 0u) * 0.44;
    if (abs(alongBar) > 1.25) { continue; } // out of range — resample
    let localX = alongBar * gen.barLength;
    // slot 2: half-width, narrowing toward the tips
    let barHalfWidth = gen.barLength * (0.14 + 0.09 * genRand(seed, pop, iteration, base + 2u)) * (1.0 - 0.4 * abs(alongBar));
    // slots 3-4: transverse scatter
    let localZ = genNormal(seed, pop, iteration, base + 3u) * barHalfWidth;
    let x = localX * gen.cosBar - localZ * gen.sinBar;
    let z = localX * gen.sinBar + localZ * gen.cosBar;
    // slots 5-6: vertical scatter
    let y = genNormal(seed, pop, iteration, base + 5u) * gen.diskHeight * 1.4;
    // slot 7: colour jitter
    let color = tempColorRamp(0.29 + 0.17 * genRand(seed, pop, iteration, base + 7u));
    let endFade = exp(-alongBar * alongBar * 1.3);
    // slot 8: size jitter
    let size = gen.starSize * (0.8 + 0.5 * genRand(seed, pop, iteration, base + 8u));
    // slots 9-11: randomLuminosity
    let brightness = randomLuminosity(seed, pop, iteration, base + 9u) * 0.9 * endFade;

    var rec: StarRec;
    rec.pos = vec3<f32>(x, y + warpOffset(x, z), z); // warp folded into y
    rec.color = color;
    rec.size = size;
    rec.brightness = brightness;
    rec.alive = true;
    return rec;
  }
  return dead;
}

// buildDisk — the smooth inter-arm stellar background.
// No retry loop: sampleDiskRadius CLAMPS rather than rejects (slots 0-11), and
// the barred centre-fade at slot 12 is a SKIP (return dead, NO retry). The
// skip is deliberate — conflating it with a resample would pad the barred disk
// back up to diskCount stars and erase the centre fade the bar fills in. Slot
// 12 is reserved for EVERY category so the downstream slots line up
// regardless of the branch; a non-barred galaxy just leaves it unhashed.
fn buildDisk(iteration: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 2u;

  // slots 0-11: rejection-sampled exponential radius, clamped
  var radius = sampleDiskRadius(seed, pop, iteration, 0u);
  // slot 12: barred centre-fade gate — SKIP on reject
  if (gen.category == 3u) {
    let t = radius / (gen.barLength * 1.15);
    if (genRand(seed, pop, iteration, 12u) > t * t) {
      return dead; // skip, not resample: shrinks the count on purpose, per the docblock above
    }
  }
  // slot 13: azimuth
  let angle = 2.0 * PI * genRand(seed, pop, iteration, 13u);
  radius = applyLopsided(radius, angle); // post-lopsided radius used below
  let x = radius * cos(angle);
  let z = radius * sin(angle);
  // slots 14-15: vertical scatter, puffier near the bulge
  let y = genNormal(seed, pop, iteration, 14u) * gen.diskHeight * (0.6 + gen.bulgeRadius / (radius + gen.bulgeRadius));
  // slot 16: colour — outskirts a little bluer/younger
  let color = tempColorRamp(0.34 + 0.3 * gen.youngFraction * (radius / gen.outerRadius) + 0.12 * genRand(seed, pop, iteration, 16u));
  // slot 17: size jitter
  let size = gen.starSize * (0.75 + 0.5 * genRand(seed, pop, iteration, 17u));
  // slots 18-20: randomLuminosity
  let brightness = randomLuminosity(seed, pop, iteration, 18u) * 1.35 * diskFalloff(radius, 1.7);

  var rec: StarRec;
  rec.pos = vec3<f32>(x, y + warpOffset(x, z), z); // warp folded into y
  rec.color = color;
  rec.size = size;
  rec.brightness = brightness;
  rec.alive = true;
  return rec;
}

// ---------------------------------------------------------------------------
// Population builders — batch B (spiral arms, irregular clumps, halo, globulars)
// ---------------------------------------------------------------------------

// ArmStarSample — the shared per-iteration state of one spiralArms draw. The
// arm builder is the one population that spawns BOTH stars (arm star, HII
// halo/core/newborns) AND dust, so the slots drawn once per loop iteration
// (0-29, plus the gap gate 30 and dust gate 36) are computed ONCE here and
// consumed by every sibling. The stride-5 record means five threads run
// buildArmSlot for the same 'i'; each recomputes armStarSample(i) identically
// (the hash is stateless) and then does only its own sub-slot work.
//
// ## The dust seam
//
// The dust pass reads EXACTLY these five fields: 'pos' (pre-warp x/y/z), plus
// 'radius', 'angle', 'armFade' and 'seedAccepted' — the dust-seed values,
// gated by 'seedAccepted' (the slot-36 draw, which a clump-gapped star also
// fails). The remaining fields are STAR-only shared state (HII knot geometry,
// sub-arm brightness/clump modulation, the non-HII gap skip) that
// buildArmSlot consumes to compose its per-sub records; the dust builder
// ignores them.
struct ArmStarSample {
  pos: vec3<f32>,      // pre-warp base position (arm star + HII knot origin)
  radius: f32,         // post-lopsided radius — dust seed
  angle: f32,          // final arm angle      — dust seed
  armFade: f32,        // brightness envelope  — dust seed weight
  clumpMod: f32,       // along-arm bright/faint modulation (non-HII star)
  brightMul: f32,      // 1.0, or 0.62 for a sub-arm/spur star
  coreSize: f32,       // HII core radius
  coreBright: f32,     // HII core brightness
  cv: f32,             // HII core colour nudge
  newbornCount: u32,   // 1..3 newborn stars in an HII knot
  isHii: bool,
  isSubArm: bool,
  gapSkipped: bool,    // non-HII clump-gap 'continue' (real density gap)
  seedAccepted: bool,  // dust-seed gate — the dust seam
}

// armStarSample — recompute one spiralArms iteration's shared state. Every
// galaxy-level value (per-arm phase/pitch/weight/meander/clump/wave/fadeRadius)
// comes from gen.armTable, packed as 4 vec4 per arm: [phase, pitch, weight,
// fadeRadius][meanderAmp, meanderFreq, meanderPhase, _][clumpF1, clumpP1,
// clumpF2, clumpP2][waveF1, waveP1, waveF2, waveP2].
fn armStarSample(i: u32) -> ArmStarSample {
  let seed = gen.seed;
  let pop = 3u;

  // slots 0-11: smooth-start radius
  var radius = gen.armStartRadius * 0.5 + sampleDiskRadius(seed, pop, i, 0u);

  // slot 12: weighted arm pick — scan armTable weights vs gen.weightSum
  var pick = genRand(seed, pop, i, 12u) * gen.weightSum;
  var arm = 0u;
  loop {
    if (arm >= gen.numArms - 1u) { break; }
    let w = gen.armTable[arm * 4u + 0u].z; // weight lane
    if (pick <= w) { break; }
    pick = pick - w;
    arm = arm + 1u;
  }
  let rec0 = gen.armTable[arm * 4u + 0u]; // (phase, pitch, weight, fadeRadius)
  let rec1 = gen.armTable[arm * 4u + 1u]; // (meanderAmp, meanderFreq, meanderPhase, _)
  let rec2 = gen.armTable[arm * 4u + 2u]; // (clumpF1, clumpP1, clumpF2, clumpP2)
  let rec3 = gen.armTable[arm * 4u + 3u]; // (waveF1, waveP1, waveF2, waveP2)

  let logRadius = log(radius / gen.armStartRadius);
  // slot 13: sub-arm gate; slots 14-16: sub-arm side/phase/
  // pitch jitter — reserved regardless of the branch.
  let isSubArm = gen.subArmAmount > 0.0 && genRand(seed, pop, i, 13u) < gen.subArmAmount * 0.6;
  var phase = rec0.x;
  var pitch = rec0.y;
  var widthMul = 1.0;
  var brightMul = 1.0;
  if (isSubArm) {
    let side = select(-1.0, 1.0, genRand(seed, pop, i, 14u) < 0.5);
    phase = rec0.x + side * (PI / f32(gen.numArms)) * (0.45 + 0.5 * genRand(seed, pop, i, 15u));
    pitch = rec0.y * (0.82 + 0.42 * genRand(seed, pop, i, 16u));
    widthMul = 1.8;
    brightMul = 0.62;
  }

  // Base log-spiral angle + meander + high-frequency wave
  var angle = phase + pitch * logRadius
    + rec1.x * sin(rec1.y * logRadius * 2.0 + rec1.z);
  if (gen.waveAmount > 0.0) {
    angle = angle + gen.waveAmount * (
      sin(rec3.x * logRadius + rec3.y) * 0.16 +
      sin(rec3.z * logRadius + rec3.w) * 0.09);
  }
  // slots 17-18: spur feather (sub-arm only)
  if (isSubArm) {
    angle = angle + genNormal(seed, pop, i, 17u) * 0.14;
  }
  // slots 19-20: angle feather
  angle = angle + genNormal(seed, pop, i, 19u) * gen.armWidthFactor * widthMul * (1.0 + gen.armStartRadius / radius);
  // slots 21-22: perpendicular offset
  let perpOffset = genNormal(seed, pop, i, 21u) * gen.armWidthFactor * widthMul * radius * 0.5;
  radius = applyLopsided(radius, angle); // post-lopsided from here on
  let x = radius * cos(angle) - perpOffset * sin(angle);
  let z = radius * sin(angle) + perpOffset * cos(angle);
  // slots 23-24: vertical scatter
  let y = genNormal(seed, pop, i, 23u) * gen.diskHeight * 0.8;

  // Brightness envelope: fade in near arm start, fade out at this arm's own
  // edge radius (fadeRadius = rec0.w) — both smoothstep.
  var innerT = (radius - gen.armStartRadius) / gen.armInnerRampW;
  innerT = clamp(innerT, 0.0, 1.0);
  var outerT = (radius - gen.armFullRadius) / max(0.001, rec0.w - gen.armFullRadius);
  outerT = clamp(outerT, 0.0, 1.0);
  let armFade = innerT * innerT * (3.0 - 2.0 * innerT) * (1.0 - outerT * outerT * (3.0 - 2.0 * outerT));

  // Low-frequency along-arm modulation
  var clumpMod = 1.0;
  if (gen.clumpAmount > 0.0) {
    let noise = sin(logRadius * rec2.x + rec2.y) * 0.6 + sin(logRadius * rec2.z + rec2.w) * 0.4;
    clumpMod = 1.0 - gen.clumpAmount * (0.5 - 0.5 * noise);
  }

  // slot 25: HII gate
  let subFactor = select(1.0, 0.4, isSubArm);
  let isHii = genRand(seed, pop, i, 25u) < 0.011 * gen.hiiIntensity * subFactor;

  // slots 26-29: HII knot geometry. Reserved regardless
  // of the branch so the sub-record composition + newborn block line up.
  let giant = pow(genRand(seed, pop, i, 26u), 2.5); // slot 26
  let coreSize = gen.outerRadius * (0.006 + 0.022 * giant);
  let coreBright = (1.4 + 1.2 * genRand(seed, pop, i, 27u)) * (0.7 + 2.0 * giant) * gen.hiiIntensity * armFade; // slot 27
  let cv = 0.1 * genRand(seed, pop, i, 28u); // slot 28
  let newbornCount = 1u + u32(genRand(seed, pop, i, 29u) * 3.0); // slot 29

  // slot 30: clump-gap gate (non-HII only). The HII branch
  // never gaps (the 'continue' lives in the else arm).
  var gapSkipped = false;
  if (!isHii) {
    gapSkipped = gen.clumpAmount > 0.0 && genRand(seed, pop, i, 30u) > 0.4 + 0.6 * clumpMod;
  }

  // slot 36: dust-seed gate. A gapped non-HII star always fails this gate
  // ('(isHii || !gapSkipped)' is false), so it seeds no dust.
  let seedAccepted = (isHii || !gapSkipped) && genRand(seed, pop, i, 36u) < 0.55 * armFade;

  var s: ArmStarSample;
  s.pos = vec3<f32>(x, y, z);
  s.radius = radius;
  s.angle = angle;
  s.armFade = armFade;
  s.clumpMod = clumpMod;
  s.brightMul = brightMul;
  s.coreSize = coreSize;
  s.coreBright = coreBright;
  s.cv = cv;
  s.newbornCount = newbornCount;
  s.isHii = isHii;
  s.isSubArm = isSubArm;
  s.gapSkipped = gapSkipped;
  s.seedAccepted = seedAccepted;
  return s;
}

// buildArmSlot — compose the star record for spiralArms output slot (i, sub),
// stride 5. Sub-slot mapping:
//   sub 0 : HII halo glow (isHii) OR regular arm star (dead on clump-gap skip)
//   sub 1 : HII core (isHii) OR dead
//   sub 2-4 : newborn b = sub - 2 (isHii && b < newbornCount) OR dead
// Every record composes the galactic warp onto y with
// 'y + warpOffset(x, z)'.
fn buildArmSlot(i: u32, sub: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 3u;
  let s = armStarSample(i);
  let warped = vec3<f32>(s.pos.x, s.pos.y + warpOffset(s.pos.x, s.pos.z), s.pos.z);

  if (s.isHii) {
    if (sub == 0u) {
      // HII halo glow
      var rec: StarRec;
      rec.pos = warped;
      rec.color = gen.hiiHalo.xyz;
      rec.size = s.coreSize * 1.9;
      rec.brightness = s.coreBright * 0.22;
      rec.alive = true;
      return rec;
    }
    if (sub == 1u) {
      // HII core
      var rec: StarRec;
      rec.pos = warped;
      rec.color = hiiCorePerturbed(s.cv);
      rec.size = s.coreSize;
      rec.brightness = s.coreBright;
      rec.alive = true;
      return rec;
    }
    // newborn b = sub - 2
    let b = sub - 2u;
    if (b >= s.newbornCount) { return dead; }
    let nbase = 40u + 8u * b;
    // slot nbase+0: young-star colour
    let color = tempColorRamp(0.86 + 0.12 * genRand(seed, pop, i, nbase + 0u));
    // slots nbase+1..2 / +3..4 / +5..6: x / y / z offset
    let nx = s.pos.x + genNormal(seed, pop, i, nbase + 1u) * s.coreSize * 0.9;
    let ny = s.pos.y + genNormal(seed, pop, i, nbase + 3u) * 0.05;
    let nz = s.pos.z + genNormal(seed, pop, i, nbase + 5u) * s.coreSize * 0.9;
    // slot nbase+7: brightness
    let brightness = (1.1 + 0.7 * genRand(seed, pop, i, nbase + 7u)) * s.armFade;
    var rec: StarRec;
    rec.pos = vec3<f32>(nx, ny + warpOffset(nx, nz), nz);
    rec.color = color;
    rec.size = gen.starSize * 0.55;
    rec.brightness = brightness;
    rec.alive = true;
    return rec;
  }

  // non-HII: only sub 0 is a real star; the clump-gap skip kills it entirely.
  if (sub != 0u || s.gapSkipped) { return dead; }
  // slot 31: hot blue-white arm colour
  let color = tempColorRamp(0.6 + 0.36 * gen.youngFraction + 0.1 * genRand(seed, pop, i, 31u));
  // slot 32: size jitter
  let size = gen.starSize * (0.85 + 0.6 * genRand(seed, pop, i, 32u));
  // slots 33-35: randomLuminosity
  let brightness = randomLuminosity(seed, pop, i, 33u) * 1.9 * s.armFade * s.brightMul * s.clumpMod;
  var rec: StarRec;
  rec.pos = warped;
  rec.color = color;
  rec.size = size;
  rec.brightness = brightness;
  rec.alive = true;
  return rec;
}

// IrregularSample — the shared per-iteration state of one irregularClumps
// draw. Stride 2: sub 0 = regular star or HII halo, sub 1 = HII core or dead.
// Clump centres come from gen.clumpCenters; the LMC-style bar offset is
// gen.irrBarOffset.
//
// ## The dust seam
//
// The dust pass reads 'pos' (pre-warp x/y/z) and 'seedAccepted' (the slot-15
// gate, rand < 0.25); the HII fields are star-only.
struct IrregularSample {
  pos: vec3<f32>,     // pre-warp x/y/z
  coreSize: f32,      // HII core radius
  coreBright: f32,    // HII core brightness
  cv: f32,            // HII core colour nudge
  isHii: bool,
  seedAccepted: bool, // dust-seed gate
}

fn irregularSample(i: u32) -> IrregularSample {
  let seed = gen.seed;
  let pop = 4u;
  let center = gen.clumpCenters[i % 7u]; // NUM_CLUMPS = 7
  let spread = gen.outerRadius * 0.16;
  // slots 0-1 / 2-3 / 4-5: x / y / z scatter
  let x = center.x + genNormal(seed, pop, i, 0u) * spread + gen.irrBarOffset;
  let y = center.y + genNormal(seed, pop, i, 2u) * gen.diskHeight * 2.0;
  let z = center.z + genNormal(seed, pop, i, 4u) * spread;
  // slot 6: HII gate
  let isHii = genRand(seed, pop, i, 6u) < 0.02 * gen.hiiIntensity;
  // slots 7-9: HII knot geometry, reserved regardless.
  let giant = pow(genRand(seed, pop, i, 7u), 2.5); // slot 7
  let coreSize = gen.outerRadius * (0.006 + 0.024 * giant); // 0.024, not the arm's 0.022
  let coreBright = (1.6 + 1.4 * genRand(seed, pop, i, 8u)) * (0.8 + 1.6 * giant); // slot 8
  let cv = 0.1 * genRand(seed, pop, i, 9u); // slot 9
  // slot 15: dust-seed gate
  let seedAccepted = genRand(seed, pop, i, 15u) < 0.25;

  var s: IrregularSample;
  s.pos = vec3<f32>(x, y, z);
  s.coreSize = coreSize;
  s.coreBright = coreBright;
  s.cv = cv;
  s.isHii = isHii;
  s.seedAccepted = seedAccepted;
  return s;
}

// buildIrregularSlot — compose the star record for irregularClumps slot
// (i, sub), stride 2. There is no density-gap 'continue' for this
// population: every iteration writes at least one star, so a non-HII sub 0
// is never dead.
fn buildIrregularSlot(i: u32, sub: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 4u;
  let s = irregularSample(i);
  let warped = vec3<f32>(s.pos.x, s.pos.y + warpOffset(s.pos.x, s.pos.z), s.pos.z);

  if (s.isHii) {
    if (sub == 0u) {
      // HII halo glow
      var rec: StarRec;
      rec.pos = warped;
      rec.color = gen.hiiHalo.xyz;
      rec.size = s.coreSize * 1.9;
      rec.brightness = s.coreBright * 0.22;
      rec.alive = true;
      return rec;
    }
    // sub 1: HII core
    var rec: StarRec;
    rec.pos = warped;
    rec.color = hiiCorePerturbed(s.cv);
    rec.size = s.coreSize;
    rec.brightness = s.coreBright;
    rec.alive = true;
    return rec;
  }

  // non-HII: sub 0 is a real star, sub 1 is dead.
  if (sub != 0u) { return dead; }
  // slot 10: colour
  let color = tempColorRamp(0.66 + 0.3 * genRand(seed, pop, i, 10u));
  // slot 11: size jitter
  let size = gen.starSize * (0.9 + 0.7 * genRand(seed, pop, i, 11u));
  // slots 12-14: randomLuminosity
  let brightness = randomLuminosity(seed, pop, i, 12u);
  var rec: StarRec;
  rec.pos = warped;
  rec.color = color;
  rec.size = size;
  rec.brightness = brightness;
  rec.alive = true;
  return rec;
}

// buildHalo — the faint extended envelope of old stars. Stride 1 (sub always
// 0). Radial rejection retries at +64*k like the bulge/bar; dead after 8
// attempts (the same finite budget standing in for an unbounded resample).
// Size is the FIXED starSize*0.7 — no size draw.
fn buildHalo(iteration: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 5u;

  for (var k = 0u; k < 8u; k = k + 1u) {
    let base = 64u * k;
    // slot 0: heavy-tailed radial draw
    let u = genRand(seed, pop, iteration, base + 0u);
    let dist = gen.outerRadius * 0.3 * pow(-log(1.0 - u * 0.998), 1.35);
    if (dist > gen.outerRadius * 2.4) { continue; } // out of range — resample
    // slot 1: cosLat
    let cosLat = 2.0 * genRand(seed, pop, iteration, base + 1u) - 1.0;
    let sinLat = sqrt(1.0 - cosLat * cosLat);
    // slot 2: lon
    let lon = 2.0 * PI * genRand(seed, pop, iteration, base + 2u);
    let x = dist * sinLat * cos(lon);
    let z = dist * sinLat * sin(lon);
    let y = dist * cosLat * gen.flattening;
    let haloFalloff = exp(-dist / (gen.outerRadius * (0.85 - 0.45 * gen.bulgeConcentration)));
    // slot 3: colour jitter
    let color = tempColorRamp(0.3 + 0.12 * genRand(seed, pop, iteration, base + 3u));
    // slots 4-6: randomLuminosity
    let brightness = randomLuminosity(seed, pop, iteration, base + 4u) * 0.5 * haloFalloff;

    var rec: StarRec;
    rec.pos = vec3<f32>(x, y + warpOffset(x, z), z); // warp folded into y
    rec.color = color;
    rec.size = gen.starSize * 0.7; // FIXED
    rec.brightness = brightness;
    rec.alive = true;
    return rec;
  }
  return dead;
}

// buildGlobularStar — one star of one globular cluster.
// Two disjoint hash ID spaces keep cluster-level and member-level draws from
// colliding: the cluster's centre/richness/radius/hue are drawn in pop 6 keyed
// on the cluster index 'c' (pop 6 owns no output slots),
// and the member's own position/colour/size/brightness in pop 7 keyed on the
// flat member index. Every member thread of a cluster recomputes that cluster's
// pop-6 draws identically. iteration = c*90 + j (STARS_PER_CLUSTER = 90).
fn buildGlobularStar(iteration: u32) -> StarRec {
  let seed = gen.seed;
  let c = iteration / 90u;

  // --- Cluster-level, pop 6, idx = c ---
  let cpop = 6u;
  let dist = gen.outerRadius * (0.35 + 1.0 * pow(genRand(seed, cpop, c, 0u), 0.5)); // slot 0
  let cosLat = 2.0 * genRand(seed, cpop, c, 1u) - 1.0; // slot 1
  let sinLat = sqrt(1.0 - cosLat * cosLat);
  let lon = 2.0 * PI * genRand(seed, cpop, c, 2u); // slot 2
  let centerX = dist * sinLat * cos(lon);
  let centerZ = dist * sinLat * sin(lon);
  let centerY = dist * cosLat * 0.85;
  // slots 3-4: richness = 0.3 + 0.9 * rand() * rand() (two draws)
  let richness = 0.3 + 0.9 * genRand(seed, cpop, c, 3u) * genRand(seed, cpop, c, 4u);
  // slot 5: cluster radius
  let clusterRadius = gen.outerRadius * (0.003 + 0.01 * pow(genRand(seed, cpop, c, 5u), 1.8)) * gen.globularSize * (0.7 + 0.6 * richness);
  let clusterHue = 0.26 + 0.2 * genRand(seed, cpop, c, 6u); // slot 6

  // --- Member-level, pop 7, idx = c*90 + j == iteration ---
  let mpop = 7u;
  let midx = iteration;
  let d = clusterRadius * pow(genRand(seed, mpop, midx, 0u), 0.7); // slot 0 (concentrated core)
  let cl = 2.0 * genRand(seed, mpop, midx, 1u) - 1.0; // slot 1
  let sl = sqrt(1.0 - cl * cl);
  let ln = 2.0 * PI * genRand(seed, mpop, midx, 2u); // slot 2
  // slot 3: hue jitter
  let color = tempColorRamp(clusterHue + (genRand(seed, mpop, midx, 3u) - 0.5) * 0.16);
  let size = gen.starSize * (0.5 + 0.22 * genRand(seed, mpop, midx, 4u)); // slot 4
  let brightness = (0.18 + 0.32 * genRand(seed, mpop, midx, 5u)) * gen.globularBright * richness; // slot 5

  let px = centerX + d * sl * cos(ln);
  let py = centerY + d * cl;
  let pz = centerZ + d * sl * sin(ln);
  var rec: StarRec;
  rec.pos = vec3<f32>(px, py + warpOffset(px, pz), pz); // warp folded into y
  rec.color = color;
  rec.size = size;
  rec.brightness = brightness;
  rec.alive = true;
  return rec;
}

// ---------------------------------------------------------------------------
// Dust builders — batch C (arm, bar, lenticular nuclear + ring, irregular)
// ---------------------------------------------------------------------------
//
// The five dust populations mirror the star builders' shape: each returns
// the DustRec for the given output slot. Every per-particle draw reads a
// fixed SLOT out of the population's own hash id (armDust 8, barDust 9,
// lenticularNucDust 10, lenticularRingDust 11, irregularDust 12), so a
// builder's draws never alias its own reddening draws (slots 56-59) nor
// another population's — same stateless-hash contract the star builders use.
// Galaxy-level dust knobs (dustAmount, dustNoiseAmt, noiseFreq, ring
// geometry, cloudCenters) come from the UBO, never re-derived per invocation.
//
// ## Resample-to-budget (armDust, irregularDust)
//
// The intended output for armDust/irregularDust is min(budget,
// seedsPassingKeep) particles, where budget = floor(30000*dust/g^2) for arm
// dust and floor(16000*dust/g^2) for irregular dust, and seedsPassingKeep is
// the count of star-pass candidates that both accepted a dust seed
// ('seedAccepted') AND clear the dense/keep gate. Reaching exactly that count
// with a serial 'push while count < budget' loop needs a shared counter —
// something no stateless GPU pass has: there is no shared state thousands of
// threads can advance without serialising.
//
// So the loop is INVERTED to one thread per OUTPUT particle (iterations =
// budget), and each thread RESAMPLES until it lands an accepted candidate.
// Thread j tries up to 32 attempts; attempt k hash-picks a candidate index c
// in [0, candidateCount) (candidateCount = the arm / clump star-loop
// iteration count, read from the shared starRanges table — see
// starRangeIterations), recomputes that candidate's star sample
// ('armStarSample(c)' / 'irregularSample(c)', pop 3/4, bit-identical to the
// star pass because the hash is stateless), and runs it through the full
// dust pipeline in the attempt's own disjoint 64-slot hash block. The FIRST
// attempt whose candidate clears every gate (seedAccepted AND dustMod keep)
// emits and returns; if all 32 miss, the thread writes a dead point.
//
// Why this is budget-exact WITHOUT a counter: hash-picking c uniformly and
// then gating on 'seedAccepted' reproduces the intended distribution exactly
// — the accepted-candidate set IS the uniform candidate population filtered
// by 'seedAccepted' — and dispatching exactly 'budget' threads pins the live
// total at ~budget, as long as the candidate pool can actually supply that
// many (see the seed-limited regime below).
//
// Two accepted statistical artifacts remain:
//  - Candidate DUPLICATION: two output threads can hash-pick the same
//    candidate seed. Their recomputed star sample is identical, but their own
//    dust jitter — keyed on the OUTPUT index j, not the candidate — differs,
//    so the two grains sit at slightly different positions (~6% of particles
//    at default params; visually indistinguishable from a single copy).
//  - SHORTFALL: a thread whose 32 attempts all miss emits nothing. With per-
//    attempt acceptance p ~= 0.17 the miss rate is (1-p)^32 < 0.3%.
//
// ## The seed-limited regime (KNOWN over-emission, barred spirals)
//
// 'Budget-exact' holds only while the candidate pool can actually supply the
// budget: the intended output is min(budget, seedsPassingKeep), matching
// ~budget ONLY when seedsPassingKeep >= budget. When the arm dust-seed supply
// is scarce (seed-limited), this resample loop keeps trying and fills the
// budget anyway — so it OVER-emits relative to the intended count. Measured:
// default Sc has ~12,970 arm seeds and hits budget 6,614 (~budget, as
// intended); SBb has only ~7,200 seeds (the bar starves the arms of
// dust-seeding stars) of which ~4,440 pass the keep gate, so the intended
// output is ~4,440 arm-dust grains while this loop writes ~6,320 — a ~+30%
// arm-dust surplus. For barred spirals the crossover (seedsPassingKeep >=
// budget) only lands above ~650k total stars at dust 0.35, so a barred
// galaxy over-emits arm dust at every realistic star count. A stateless pass
// with no atomics/compaction cannot compute min(budget, seedsPassingKeep)
// exactly, so it must approximate one regime wrong — resample-to-budget
// chooses to be exact where the common case is budget-limited (the spiral
// case) and over-emit where it is seed-limited.
//
// Why 32 attempts, not the rejection builders' 8: those (bulge/bar/halo) reject
// only an out-of-range radial draw, so each attempt almost always lands; here
// the per-attempt success probability is the far lower seed*keep acceptance
// (~17%), so the retry budget has to be larger to drive the shortfall below a
// fraction of a percent. The star sample MUST NOT be widened for the dust seam:
// it is shared with the star pass and has to stay bit-identical across both.

// DustMod — the noise-driven keep/opacity/size modulation. 'keep' is one rand
// draw at 'slot' gated against a noise-shaped probability; 'op'/'sz' are
// draw-free multipliers off the same noise sample. dustNoiseAt reads
// gen.noiseSeed + gen.noiseFreq; gen.dustNoiseAmt is the mix.
struct DustMod {
  keep: bool,
  op: f32,
  sz: f32,
}

fn dustMod(p: vec3<f32>, seed: u32, pop: u32, idx: u32, slot: u32) -> DustMod {
  let f = dustNoiseAt(p);
  let a = gen.dustNoiseAmt;
  var m: DustMod;
  // The single keep-gate rand — the ONLY draw dustMod makes.
  m.keep = genRand(seed, pop, idx, slot) < 1.0 - a + a * (0.15 + 1.5 * f * f);
  m.op = 1.0 - a + a * (0.25 + 1.9 * f);
  m.sz = 1.0 - a + a * (0.5 + 1.3 * f);
  return m;
}

// Resample tuning for the budget-exact dust builders (armDust, irregularDust —
// see the batch-C header). A thread makes at most DUST_ATTEMPTS tries; each try
// owns a disjoint ATTEMPT_STRIDE-slot hash block, its candidate pick drawn at
// PICK_SLOT within the block and its pipeline draws at block-relative slots
// 0..9. 32 * 64 = 2048 slots, comfortably inside the u32 hash space. The shared
// reddening window (writeDustParticle slots 56-59) sits above every block's
// pipeline slots, so it never aliases a pick or a pipeline draw.
const DUST_ATTEMPTS: u32 = 32u;
const ATTEMPT_STRIDE: u32 = 64u;
const PICK_SLOT: u32 = 10u;

// starRangeIterations — look up a star population's loop-iteration count in the
// shared starRanges table. The dust pass binds the SAME 'gen' UBO the star pass
// does (see the module header — one declaration, one buffer), so this table is
// live here too. The resample builders use it to size their candidate space:
// armDust picks over the spiralArms iterations (pop 3), irregularDust over the
// irregularClumps iterations (pop 4) — exactly the index range the star pass
// evaluated, so a recomputed sample at that index is the star that seeded it.
// Returns 0 when the population is absent (e.g. an arm-less spiral), which the
// callers read as 'no candidates -> dead point'.
fn starRangeIterations(popId: u32) -> u32 {
  for (var i = 0u; i < gen.starRangeCount; i = i + 1u) {
    if (gen.starRanges[i].w == popId) {
      return gen.starRanges[i].y; // iterations lane (start, iterations, stride, popId)
    }
  }
  return 0u;
}

// writeDustParticle — the shared dust write path: compose the galactic warp
// onto y, draw the four reddening factors at the fixed slots 56-59, then bake
// the rigid extra-galaxy transform in at write time (applyExtraTransform, the
// dust twin of writeStar's finalize). x/y/z arrive PRE-warp. Reddened dust
// reads warm because interstellar dust absorbs blue more than red: four rand
// draws — darkness, then the r/g/b factors, in that order.
fn writeDustParticle(
  seed: u32,
  pop: u32,
  idx: u32,
  x: f32,
  y: f32,
  z: f32,
  size: f32,
  opacity: f32,
) -> DustRec {
  let warpedY = y + warpOffset(x, z);
  let darkness = 0.02 + 0.022 * genRand(seed, pop, idx, 56u);      // slot 56
  let dr = darkness * (1.05 + 0.55 * genRand(seed, pop, idx, 57u)); // slot 57
  let dg = darkness * (0.6 + 0.22 * genRand(seed, pop, idx, 58u));  // slot 58
  let db = darkness * (0.32 + 0.26 * genRand(seed, pop, idx, 59u)); // slot 59
  // Position + size baked through the rigid extra transform (identity for a
  // standalone galaxy, where extraScale == 1 and the rotation is zero). Size
  // scales by extraScale separately, the same split writeStar uses.
  var rec: DustRec;
  rec.pos = applyExtraTransform(vec3<f32>(x, warpedY, z));
  rec.size = size * gen.extraScale;
  rec.color = vec3<f32>(dr, dg, db);
  rec.opacity = opacity;
  rec.alive = true;
  return rec;
}

// buildArmDust — patchy dust lanes nudged onto the inner (concave) edge of
// the spiral arms, dense-knot/thin-wisp split, INVERTED to one thread per
// OUTPUT particle (the resample-to-budget model — see the batch-C header).
// Thread j resamples: each attempt hash-picks an arm candidate c over the
// spiralArms iteration space, recomputes armStarSample(c) (pop 3,
// bit-identical to the star pass) as the dust seed (pos, radius, angle,
// armFade), and emits on the first candidate that both accepted a dust seed
// AND clears the keep gate. The inner-edge nudge inX/inZ is draw-free. Draw
// ORDER is opacity-before-size. The pipeline draws key on the OUTPUT index j
// (not the candidate c), so two threads that pick the same seed still jitter
// to distinct positions — the accepted candidate-duplication artifact.
fn buildArmDust(j: u32) -> DustRec {
  var dead: DustRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 8u;

  let candidateCount = starRangeIterations(3u); // spiralArms iteration space
  if (candidateCount == 0u) { return dead; }    // no arm seeds -> no dust

  for (var k = 0u; k < DUST_ATTEMPTS; k = k + 1u) {
    let base = k * ATTEMPT_STRIDE;
    let pick = genRand(seed, pop, j, base + PICK_SLOT);
    let c = min(u32(pick * f32(candidateCount)), candidateCount - 1u);
    let s = armStarSample(c);          // recompute the arm seed — pop 3, bit-identical
    if (!s.seedAccepted) { continue; } // gapped/un-seeded candidate — try another

    let inX = -cos(s.angle) * gen.outerRadius * 0.018;
    let inZ = -sin(s.angle) * gen.outerRadius * 0.018;
    let dense = genRand(seed, pop, j, base + 0u) < 0.28;      // slot 0
    let x = s.pos.x + inX + genNormal(seed, pop, j, base + 1u) * gen.outerRadius * 0.022; // slots 1-2
    let y = s.pos.y * 0.4 + genNormal(seed, pop, j, base + 3u) * gen.diskHeight * 0.28;   // slots 3-4
    let z = s.pos.z + inZ + genNormal(seed, pop, j, base + 5u) * gen.outerRadius * 0.022; // slots 5-6
    let m = dustMod(vec3<f32>(x, y, z), seed, pop, j, base + 7u); // slot 7 keep gate
    if (!m.keep) { continue; }                                   // reject, try another

    // slot 8: opacity jitter. Only ONE rand is drawn regardless of the dense
    // branch (the select() picks one side), so 'r8' is reused in both select
    // arms rather than drawing twice.
    let r8 = genRand(seed, pop, j, base + 8u);
    let opJitter = select(0.05 + 0.11 * r8, 0.22 + 0.3 * r8, dense);
    let opacity = opJitter * gen.dustAmount * s.armFade * (0.4 + 1.4 * diskFalloff(s.radius, 1.5)) * m.op;
    // slot 9: size jitter. Dense knots are 1.25x, wisps 0.8x.
    let sizeJitter = 0.007 + 0.015 * genRand(seed, pop, j, base + 9u);
    let size = gen.outerRadius * sizeJitter * gen.grainScale * select(0.8, 1.25, dense) * m.sz;
    return writeDustParticle(seed, pop, j, x, y, z, size, opacity);
  }
  return dead; // all attempts missed — the <0.3% shortfall
}

// S-curve dust-lane tuning knobs. BAR_LANE_S_STEEP sets how sharply the two
// lanes cross sides at the nucleus (higher = tighter crossover); BAR_LANE_BOW
// sets how far the lane ends peel outward toward the arm roots. Live-tuned.
const BAR_LANE_S_STEEP: f32 = 2.2;
const BAR_LANE_BOW: f32 = 0.18;

// buildBarDust — the two offset dust lanes of a barred spiral, shaped after
// NGC 1300 / NGC 1365 rather than as straight rails. Each lane hugs its bar
// half's leading edge, then the pair swaps sides through the nucleus via a
// tanh S-curve (BAR_LANE_S_STEEP) — a gentle point-symmetric crossover — while
// an antisymmetric cubic bow (BAR_LANE_BOW) peels the lane ends outward toward
// the arm roots, in the same rotational sense as the spiral. A straight-lane
// bar reads as two artificial parallel rails through the centre; the S-plus-
// bow morphology is what makes it look grown. No seed reuse — a pure count
// loop, carved only when the barred bar has nonzero length. NOTE the SIZE-
// BEFORE-OPACITY draw order (slot 8 size, slot 9 opacity): size is drawn
// before opacity, the opposite of armDust — the slot tables are per-builder
// and NOT normalised.
fn buildBarDust(i: u32) -> DustRec {
  var dead: DustRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 9u;

  let t = genRand(seed, pop, i, 0u) * 2.0 - 1.0; // slot 0 — position along bar
  let lane = select(-1.0, 1.0, genRand(seed, pop, i, 1u) < 0.5); // slot 1 — which of the two lanes
  let offAmp = gen.barLength * (0.06 + 0.05 * genRand(seed, pop, i, 2u)); // slot 2 — lane offset amplitude
  let sCurve = tanh(t * BAR_LANE_S_STEEP); // lanes swap sides through the nucleus
  let bow = BAR_LANE_BOW * gen.barLength * t * t * t; // antisymmetric cubic: ends peel outward toward the arm roots
  let localX = t * gen.barLength * 0.92;
  let localZ = lane * offAmp * sCurve + bow + genNormal(seed, pop, i, 3u) * gen.barLength * 0.045; // slots 3-4
  let x = localX * gen.cosBar - localZ * gen.sinBar;
  let z = localX * gen.sinBar + localZ * gen.cosBar;
  let y = genNormal(seed, pop, i, 5u) * gen.diskHeight * 0.4; // slots 5-6
  let m = dustMod(vec3<f32>(x, y, z), seed, pop, i, 7u); // slot 7 keep gate
  if (!m.keep) { return dead; }

  let size = gen.outerRadius * (0.008 + 0.013 * genRand(seed, pop, i, 8u)) * gen.grainScale * m.sz; // slot 8
  let opacity = (0.06 + 0.1 * genRand(seed, pop, i, 9u)) * gen.dustAmount * exp(-t * t * 1.2) * m.op; // slot 9 — end-fade
  return writeDustParticle(seed, pop, i, x, y, z, size, opacity);
}

// buildLenticularNucDust — S0's dust-poor nuclear disk: cloudy scatter around
// 34 cloud centres. The cloud centres come from gen.cloudCenters (packed as
// (cos*rr, sin*rr, rr, 0) — the .z lane is the cloud's own radius, fed to
// diskFalloff). No seed reuse.
fn buildLenticularNucDust(i: u32) -> DustRec {
  var dead: DustRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 10u;

  let center = gen.cloudCenters[i % 34u]; // CLOUD_COUNT = 34
  let spread = gen.bulgeRadius * 0.22;
  let x = center.x + genNormal(seed, pop, i, 0u) * spread; // slots 0-1
  let z = center.y + genNormal(seed, pop, i, 2u) * spread; // slots 2-3
  let y = genNormal(seed, pop, i, 4u) * gen.diskHeight * 0.5; // slots 4-5
  let m = dustMod(vec3<f32>(x, y, z), seed, pop, i, 6u); // slot 6 keep gate
  if (!m.keep) { return dead; }
  let size = gen.outerRadius * (0.007 + 0.012 * genRand(seed, pop, i, 7u)) * gen.grainScale * m.sz; // slot 7
  let opacity = (0.05 + 0.15 * genRand(seed, pop, i, 8u)) * gen.dustAmount * (0.3 + diskFalloff(center.z, 1.5)) * m.op; // slot 8
  return writeDustParticle(seed, pop, i, x, y, z, size, opacity);
}

// buildLenticularRingDust — the Sombrero 'hat-brim': a thin patchy in-plane
// annulus. Carved only when dustRingStrength > 0; its budget and opacity
// ride gen.ringStrength alone, independent of dustAmount. gen.ringRadius /
// gen.ringWidth already carry the outerRadius factor, so they are used
// directly.
fn buildLenticularRingDust(i: u32) -> DustRec {
  var dead: DustRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 11u;

  let th = 2.0 * PI * genRand(seed, pop, i, 0u); // slot 0
  let r = gen.ringRadius + genNormal(seed, pop, i, 1u) * gen.ringWidth; // slots 1-2
  let x = r * cos(th);
  let z = r * sin(th);
  let y = genNormal(seed, pop, i, 3u) * gen.diskHeight * 0.3; // slots 3-4
  let m = dustMod(vec3<f32>(x, y, z), seed, pop, i, 5u); // slot 5 keep gate
  if (!m.keep) { return dead; }
  let size = gen.outerRadius * (0.008 + 0.014 * genRand(seed, pop, i, 6u)) * gen.grainScale * m.sz; // slot 6
  let opacity = (0.2 + 0.3 * genRand(seed, pop, i, 7u)) * gen.ringStrength * m.op; // slot 7 (ringAmt, not dustAmount)
  return writeDustParticle(seed, pop, i, x, y, z, size, opacity);
}

// buildIrregularDust — dust patches on the star-forming clump seeds, same
// dense/wisp split as armDust but wider spreads (no ordered disk), INVERTED
// to one thread per OUTPUT particle (the same resample-to-budget model as
// buildArmDust — see the batch-C header). Thread j resamples: each attempt
// hash-picks a clump candidate c over the irregularClumps iteration space,
// recomputes irregularSample(c) (pop 4, bit-identical to the star pass) as
// its seed, and emits on the first candidate that both passed its slot-15
// seed gate AND clears the keep gate. Only the seed position is used (the
// seed's radius/angle are unused by this builder). SIZE-BEFORE-OPACITY, like
// barDust (slot 8 size, slot 9 opacity). Pipeline draws key on the OUTPUT
// index j, so same-seed threads still jitter apart (the candidate-
// duplication artifact).
fn buildIrregularDust(j: u32) -> DustRec {
  var dead: DustRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 12u;

  let candidateCount = starRangeIterations(4u); // irregularClumps iteration space
  if (candidateCount == 0u) { return dead; }     // no clump seeds -> no dust

  for (var k = 0u; k < DUST_ATTEMPTS; k = k + 1u) {
    let base = k * ATTEMPT_STRIDE;
    let pick = genRand(seed, pop, j, base + PICK_SLOT);
    let c = min(u32(pick * f32(candidateCount)), candidateCount - 1u);
    let s = irregularSample(c);        // recompute the clump seed — pop 4, bit-identical
    if (!s.seedAccepted) { continue; } // slot-15 seed gate failed — try another

    let dense = genRand(seed, pop, j, base + 0u) < 0.3; // slot 0
    let x = s.pos.x + genNormal(seed, pop, j, base + 1u) * gen.outerRadius * 0.03; // slots 1-2
    let y = s.pos.y + genNormal(seed, pop, j, base + 3u) * gen.diskHeight * 0.6;   // slots 3-4
    let z = s.pos.z + genNormal(seed, pop, j, base + 5u) * gen.outerRadius * 0.03; // slots 5-6
    let m = dustMod(vec3<f32>(x, y, z), seed, pop, j, base + 7u); // slot 7 keep gate
    if (!m.keep) { continue; } // reject, try another

    // slot 8: size jitter (dense knots 1.2x, wisps 0.8x).
    let size = gen.outerRadius * (0.008 + 0.016 * genRand(seed, pop, j, base + 8u)) * gen.grainScale * select(0.8, 1.2, dense) * m.sz;
    // slot 9: opacity jitter — one rand reused across the dense branch.
    let r9 = genRand(seed, pop, j, base + 9u);
    let opJitter = select(0.05 + 0.11 * r9, 0.16 + 0.22 * r9, dense);
    let opacity = opJitter * gen.dustAmount * m.op;
    return writeDustParticle(seed, pop, j, x, y, z, size, opacity);
  }
  return dead; // all attempts missed — the <0.3% shortfall
}
