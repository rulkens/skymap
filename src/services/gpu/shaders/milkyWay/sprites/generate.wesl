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
  var hashState = vIn * 1664525u + 1013904223u;
  // cross-feed adds — each lane stirred by two others
  hashState.x = hashState.x + hashState.y * hashState.w;
  hashState.y = hashState.y + hashState.z * hashState.x;
  hashState.z = hashState.z + hashState.x * hashState.y;
  hashState.w = hashState.w + hashState.y * hashState.z;
  // avalanche: fold the high bits down
  hashState = hashState ^ (hashState >> vec4<u32>(16u));
  // cross-feed adds again
  hashState.x = hashState.x + hashState.y * hashState.w;
  hashState.y = hashState.y + hashState.z * hashState.x;
  hashState.z = hashState.z + hashState.x * hashState.y;
  hashState.w = hashState.w + hashState.y * hashState.z;
  return hashState;
}

// genRand — one uniform draw in [0, 1) for a given slot. The f32(u32) cast
// rounds the 32-bit hash word to f32's 24-bit mantissa before scaling — a
// precision loss inherent to f32 GPU math. The distribution is unaffected.
fn genRand(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 {
  return f32(pcg4d(vec4<u32>(seed, pop, idx, slot)).x) * INV_2POW32;
}

// genNormal — one Box-Muller normal (mean 0, stddev 1) from slots {slot,
// slot+1}. radialDraw is clamped to 1e-38 (f32's smallest positive normal)
// before the log, guarding against log(0).
fn genNormal(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 {
  let radialDraw = max(genRand(seed, pop, idx, slot), 1e-38);
  let angleDraw = genRand(seed, pop, idx, slot + 1u);
  return sqrt(-2.0 * log(radialDraw)) * cos(2.0 * PI * angleDraw);
}

// randomLuminosity — steep-tailed stellar luminosity. Reserves 3 slots:
// luminosityDraw (slot), the flare gate (slot+1), and the flare magnitude
// (slot+2). Slot+2 is ALWAYS drawn regardless of the gate, so the next
// consumer's slot budget stays fixed — the flare value simply goes unused
// (contributes 0) when the gate fails.
fn randomLuminosity(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 {
  let luminosityDraw = genRand(seed, pop, idx, slot);
  let gate = genRand(seed, pop, idx, slot + 1u);
  let flareRand = genRand(seed, pop, idx, slot + 2u);
  var flare = 0.0;
  if (gate < 0.012) {
    flare = 3.2 * flareRand;
  }
  return 0.12 + 0.4 * luminosityDraw * luminosityDraw * luminosityDraw + flare;
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
    let attemptSlot = slot + attempt * 2u;
    let firstDraw = genRand(seed, pop, idx, attemptSlot);
    let secondDraw = genRand(seed, pop, idx, attemptSlot + 1u);
    radius = -gen.diskScaleLen * (log(firstDraw) + log(secondDraw));
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
fn nSmooth(fraction: f32) -> f32 {
  return fraction * fraction * (3.0 - 2.0 * fraction);
}

fn nLerp(low: f32, high: f32, weight: f32) -> f32 {
  return low + (high - low) * weight;
}

// nHash — u32 lattice hash: three large-prime multiplies plus an
// avalanche/xor-shift pair (lib/util.wesl's hashAvalanche, shared with
// integerHash3 there), matching a 32-bit wrap-multiply hash's bit pattern up
// to the final f32 division (which rounds the 32-bit word to f32, a small
// precision loss). The integer lattice coords arrive as i32 (they can be
// negative) and are bitcast to u32 so the wrap-multiply matches
// two's-complement 32-bit truncation semantics.
fn nHash(cellX: i32, cellY: i32, cellZ: i32, seed: u32) -> f32 {
  let cellBitsX = bitcast<u32>(cellX);
  let cellBitsY = bitcast<u32>(cellY);
  let cellBitsZ = bitcast<u32>(cellZ);
  let mixed = cellBitsX * 374761393u + cellBitsY * 668265263u + cellBitsZ * 2147483647u + seed * 974711u;
  return f32(hashAvalanche(mixed)) * INV_2POW32;
}

// valueNoise3 — seeded 3D value noise, [0, 1). floor() BEFORE the i32 cast so
// negative coords floor (not truncate toward zero), matching Math.floor. The
// trilinear blend order is x edges, then y, then z.
fn valueNoise3(position: vec3<f32>, seed: u32) -> f32 {
  let cellX = i32(floor(position.x));
  let cellY = i32(floor(position.y));
  let cellZ = i32(floor(position.z));
  let fadeX = nSmooth(position.x - floor(position.x));
  let fadeY = nSmooth(position.y - floor(position.y));
  let fadeZ = nSmooth(position.z - floor(position.z));

  let x00 = nLerp(nHash(cellX, cellY, cellZ, seed), nHash(cellX + 1, cellY, cellZ, seed), fadeX);
  let x10 = nLerp(nHash(cellX, cellY + 1, cellZ, seed), nHash(cellX + 1, cellY + 1, cellZ, seed), fadeX);
  let x01 = nLerp(nHash(cellX, cellY, cellZ + 1, seed), nHash(cellX + 1, cellY, cellZ + 1, seed), fadeX);
  let x11 = nLerp(nHash(cellX, cellY + 1, cellZ + 1, seed), nHash(cellX + 1, cellY + 1, cellZ + 1, seed), fadeX);
  return nLerp(nLerp(x00, x10, fadeY), nLerp(x01, x11, fadeY), fadeZ);
}

// dustNoiseAt — two-octave dust sample. Base octave runs y at half frequency;
// the 2.3x-frequency detail layer is half-weighted and the sum is normalised
// by 1.5 (1 + 0.5) to stay roughly in [0, 1). Both octaves read
// gen.noiseSeed (the dust field's decorrelated seed) and gen.noiseFreq
// ('nfreq' = 2.4 * dustNoiseScale / outerRadius, per 'packGenerationUniforms').
fn dustNoiseAt(position: vec3<f32>) -> f32 {
  let frequency = gen.noiseFreq;
  let base = valueNoise3(vec3<f32>(position.x * frequency, position.y * frequency * 0.5, position.z * frequency), gen.noiseSeed);
  let detail = valueNoise3(vec3<f32>(position.x * frequency * 2.3, position.y * frequency, position.z * frequency * 2.3), gen.noiseSeed);
  return (base + 0.5 * detail) / 1.5;
}

// ---------------------------------------------------------------------------
// Colour + shaping helpers
// ---------------------------------------------------------------------------

// tempColorRamp — stellar colour ramp. Six hand-picked stops, cool (red) to
// hot (blue). temperature is clamped to [0, 0.999] before scaling by
// (6 stops - 1) = 5 so the index never runs past the final stop. A local var
// array is used (not a module const) so the runtime index is portable across
// every WGSL backend.
fn tempColorRamp(temperature: f32) -> vec3<f32> {
  var stops = array<vec3<f32>, 6>(
    vec3<f32>(1.0, 0.36, 0.16),
    vec3<f32>(1.0, 0.58, 0.28),
    vec3<f32>(1.0, 0.83, 0.55),
    vec3<f32>(1.0, 0.97, 0.9),
    vec3<f32>(0.79, 0.86, 1.0),
    vec3<f32>(0.6, 0.72, 1.0)
  );
  let scaled = clamp(temperature, 0.0, 0.999) * 5.0;  // (stop count - 1)
  let stopIndex = i32(scaled);                       // scaled | 0 (scaled >= 0, so trunc == floor)
  let blend = scaled - f32(stopIndex);
  let lowStop = stops[stopIndex];
  let highStop = stops[stopIndex + 1];
  return lowStop + (highStop - lowStop) * blend;
}

// hiiCorePerturbed — the HII-region core colour: the palette core
// (gen.hiiCore) with its green and blue channels nudged up by 'coreColorNudge' and
// clamped to 1. Red is untouched.
fn hiiCorePerturbed(coreColorNudge: f32) -> vec3<f32> {
  return vec3<f32>(
    gen.hiiCore.x,
    min(1.0, gen.hiiCore.y + coreColorNudge),
    min(1.0, gen.hiiCore.z + coreColorNudge)
  );
}

// warpOffset — the galactic-warp vertical offset. Zero inside
// warpStartRadius (the flat inner disk); beyond it the disk bends
// out of plane as rel^2, with the line of nodes precessing by warpTwist * rel.
// Math.hypot(diskX, diskZ) maps to length(vec2(diskX, diskZ)).
fn warpOffset(diskX: f32, diskZ: f32) -> f32 {
  if (gen.warpStrength <= 0.0) {
    return 0.0;
  }
  let diskRadius = length(vec2<f32>(diskX, diskZ));
  if (diskRadius <= gen.warpStartRadius) {
    return 0.0;
  }
  let rel = (diskRadius - gen.warpStartRadius) / max(1e-4, gen.outerRadius - gen.warpStartRadius);
  let node = gen.warpTwist * rel;  // line of nodes precesses with radius
  return gen.warpStrength * gen.outerRadius * 0.4 * rel * rel * sin(atan2(diskZ, diskX) - node);
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
fn applyExtraTransform(position: vec3<f32>) -> vec3<f32> {
  let scale = gen.extraScale;
  let cosRotY = gen.extraRot.x;
  let sinRotY = gen.extraRot.y;
  let cosTiltX = gen.extraRot.z;
  let sinTiltX = gen.extraRot.w;
  let scaledX = position.x * scale;
  let scaledY = position.y * scale;
  let scaledZ = position.z * scale;
  let spunX = scaledX * cosRotY - scaledZ * sinRotY; // Y spin (disk axis)
  let spunZ = scaledX * sinRotY + scaledZ * cosRotY;
  let tiltedY = scaledY * cosTiltX - spunZ * sinTiltX; // X tilt (inclination), on the already-spun scaledY/spunZ
  let tiltedZ = scaledY * sinTiltX + spunZ * cosTiltX;
  return vec3<f32>(spunX + gen.extraPos.x, tiltedY + gen.extraPos.y, tiltedZ + gen.extraPos.z);
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

  for (var attempt = 0u; attempt < 8u; attempt = attempt + 1u) {
    let base = 64u * attempt;
    // slot 0: radial draw (shared by both radial branches)
    let radialDraw = genRand(seed, pop, iteration, base + 0u);
    var dist: f32;
    var brightnessFalloff: f32;
    if (gen.category == 0u) {
      // elliptical: heavy-tailed profile + soft brightness falloff
      dist = gen.outerRadius * 0.16 * pow(-log(1.0 - radialDraw * 0.997), 1.3);
      if (dist > gen.outerRadius * 1.6) { continue; } // out of range — resample
      brightnessFalloff = exp(-dist / (gen.outerRadius * (0.62 - 0.4 * gen.bulgeConcentration)));
    } else {
      // disk-galaxy bulge: smaller, blends into disk
      dist = gen.bulgeRadius * 0.55 * pow(-log(1.0 - radialDraw * 0.997), 1.25);
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
    let posX = localX * gen.cosBulge - localZ * gen.sinBulge;
    let posZ = localX * gen.sinBulge + localZ * gen.cosBulge;
    let posY = localY;
    // slot 3: warm/old population colour jitter
    let color = tempColorRamp(0.27 + 0.15 * genRand(seed, pop, iteration, base + 3u));
    // slot 4: size jitter
    let size = gen.starSize * (0.8 + 0.5 * genRand(seed, pop, iteration, base + 4u));
    // slots 5-7: randomLuminosity
    let brightness = randomLuminosity(seed, pop, iteration, base + 5u) * 0.85 * brightnessFalloff;

    var rec: StarRec;
    rec.pos = vec3<f32>(posX, posY + warpOffset(posX, posZ), posZ); // warp folded into y
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

  for (var attempt = 0u; attempt < 8u; attempt = attempt + 1u) {
    let base = 64u * attempt;
    // slots 0-1: position along the bar, a clamped gaussian
    let alongBar = genNormal(seed, pop, iteration, base + 0u) * 0.44;
    if (abs(alongBar) > 1.25) { continue; } // out of range — resample
    let localX = alongBar * gen.barLength;
    // slot 2: half-width, narrowing toward the tips
    let barHalfWidth = gen.barLength * (0.14 + 0.09 * genRand(seed, pop, iteration, base + 2u)) * (1.0 - 0.4 * abs(alongBar));
    // slots 3-4: transverse scatter
    let localZ = genNormal(seed, pop, iteration, base + 3u) * barHalfWidth;
    let posX = localX * gen.cosBar - localZ * gen.sinBar;
    let posZ = localX * gen.sinBar + localZ * gen.cosBar;
    // slots 5-6: vertical scatter
    let posY = genNormal(seed, pop, iteration, base + 5u) * gen.diskHeight * 1.4;
    // slot 7: colour jitter
    let color = tempColorRamp(0.29 + 0.17 * genRand(seed, pop, iteration, base + 7u));
    let endFade = exp(-alongBar * alongBar * 1.3);
    // slot 8: size jitter
    let size = gen.starSize * (0.8 + 0.5 * genRand(seed, pop, iteration, base + 8u));
    // slots 9-11: randomLuminosity
    let brightness = randomLuminosity(seed, pop, iteration, base + 9u) * 0.9 * endFade;

    var rec: StarRec;
    rec.pos = vec3<f32>(posX, posY + warpOffset(posX, posZ), posZ); // warp folded into y
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
    let barRadiusFraction = radius / (gen.barLength * 1.15);
    if (genRand(seed, pop, iteration, 12u) > barRadiusFraction * barRadiusFraction) {
      return dead; // skip, not resample: shrinks the count on purpose, per the docblock above
    }
  }
  // slot 13: azimuth
  let angle = 2.0 * PI * genRand(seed, pop, iteration, 13u);
  radius = applyLopsided(radius, angle); // post-lopsided radius used below
  let posX = radius * cos(angle);
  let posZ = radius * sin(angle);
  // slots 14-15: vertical scatter, puffier near the bulge
  let posY = genNormal(seed, pop, iteration, 14u) * gen.diskHeight * (0.6 + gen.bulgeRadius / (radius + gen.bulgeRadius));
  // slot 16: colour — outskirts a little bluer/younger
  let color = tempColorRamp(0.34 + 0.3 * gen.youngFraction * (radius / gen.outerRadius) + 0.12 * genRand(seed, pop, iteration, 16u));
  // slot 17: size jitter
  let size = gen.starSize * (0.75 + 0.5 * genRand(seed, pop, iteration, 17u));
  // slots 18-20: randomLuminosity
  let brightness = randomLuminosity(seed, pop, iteration, 18u) * 1.35 * diskFalloff(radius, 1.7);

  var rec: StarRec;
  rec.pos = vec3<f32>(posX, posY + warpOffset(posX, posZ), posZ); // warp folded into y
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
// buildArmSlot for the same 'iteration'; each recomputes
// armStarSample(iteration) identically (the hash is stateless) and then does
// only its own sub-slot work.
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
fn armStarSample(iteration: u32) -> ArmStarSample {
  let seed = gen.seed;
  let pop = 3u;

  // slots 0-11: smooth-start radius
  var radius = gen.armStartRadius * 0.5 + sampleDiskRadius(seed, pop, iteration, 0u);

  // slot 12: weighted arm pick — scan armTable weights vs gen.weightSum
  var pick = genRand(seed, pop, iteration, 12u) * gen.weightSum;
  var arm = 0u;
  loop {
    if (arm >= gen.numArms - 1u) { break; }
    let armWeight = gen.armTable[arm * 4u + 0u].z; // weight lane
    if (pick <= armWeight) { break; }
    pick = pick - armWeight;
    arm = arm + 1u;
  }
  let rec0 = gen.armTable[arm * 4u + 0u]; // (phase, pitch, weight, fadeRadius)
  let rec1 = gen.armTable[arm * 4u + 1u]; // (meanderAmp, meanderFreq, meanderPhase, _)
  let rec2 = gen.armTable[arm * 4u + 2u]; // (clumpF1, clumpP1, clumpF2, clumpP2)
  let rec3 = gen.armTable[arm * 4u + 3u]; // (waveF1, waveP1, waveF2, waveP2)

  let logRadius = log(radius / gen.armStartRadius);
  // slot 13: sub-arm gate; slots 14-16: sub-arm side/phase/
  // pitch jitter — reserved regardless of the branch.
  let isSubArm = gen.subArmAmount > 0.0 && genRand(seed, pop, iteration, 13u) < gen.subArmAmount * 0.6;
  var phase = rec0.x;
  var pitch = rec0.y;
  var widthMul = 1.0;
  var brightMul = 1.0;
  if (isSubArm) {
    let side = select(-1.0, 1.0, genRand(seed, pop, iteration, 14u) < 0.5);
    phase = rec0.x + side * (PI / f32(gen.numArms)) * (0.45 + 0.5 * genRand(seed, pop, iteration, 15u));
    pitch = rec0.y * (0.82 + 0.42 * genRand(seed, pop, iteration, 16u));
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
    angle = angle + genNormal(seed, pop, iteration, 17u) * 0.14;
  }
  // slots 19-20: angle feather
  angle = angle + genNormal(seed, pop, iteration, 19u) * gen.armWidthFactor * widthMul * (1.0 + gen.armStartRadius / radius);
  // slots 21-22: perpendicular offset
  let perpOffset = genNormal(seed, pop, iteration, 21u) * gen.armWidthFactor * widthMul * radius * 0.5;
  radius = applyLopsided(radius, angle); // post-lopsided from here on
  let posX = radius * cos(angle) - perpOffset * sin(angle);
  let posZ = radius * sin(angle) + perpOffset * cos(angle);
  // slots 23-24: vertical scatter
  let posY = genNormal(seed, pop, iteration, 23u) * gen.diskHeight * 0.8;

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
  let isHii = genRand(seed, pop, iteration, 25u) < 0.011 * gen.hiiIntensity * subFactor;

  // slots 26-29: HII knot geometry. Reserved regardless
  // of the branch so the sub-record composition + newborn block line up.
  let giant = pow(genRand(seed, pop, iteration, 26u), 2.5); // slot 26
  let coreSize = gen.outerRadius * (0.006 + 0.022 * giant);
  let coreBright = (1.4 + 1.2 * genRand(seed, pop, iteration, 27u)) * (0.7 + 2.0 * giant) * gen.hiiIntensity * armFade; // slot 27
  let coreColorNudge = 0.1 * genRand(seed, pop, iteration, 28u); // slot 28
  let newbornCount = 1u + u32(genRand(seed, pop, iteration, 29u) * 3.0); // slot 29

  // slot 30: clump-gap gate (non-HII only). The HII branch
  // never gaps (the 'continue' lives in the else arm).
  var gapSkipped = false;
  if (!isHii) {
    gapSkipped = gen.clumpAmount > 0.0 && genRand(seed, pop, iteration, 30u) > 0.4 + 0.6 * clumpMod;
  }

  // slot 36: dust-seed gate. A gapped non-HII star always fails this gate
  // ('(isHii || !gapSkipped)' is false), so it seeds no dust.
  let seedAccepted = (isHii || !gapSkipped) && genRand(seed, pop, iteration, 36u) < 0.55 * armFade;

  var armSample: ArmStarSample;
  armSample.pos = vec3<f32>(posX, posY, posZ);
  armSample.radius = radius;
  armSample.angle = angle;
  armSample.armFade = armFade;
  armSample.clumpMod = clumpMod;
  armSample.brightMul = brightMul;
  armSample.coreSize = coreSize;
  armSample.coreBright = coreBright;
  armSample.cv = coreColorNudge;
  armSample.newbornCount = newbornCount;
  armSample.isHii = isHii;
  armSample.isSubArm = isSubArm;
  armSample.gapSkipped = gapSkipped;
  armSample.seedAccepted = seedAccepted;
  return armSample;
}

// buildArmSlot — compose the star record for spiralArms output slot
// (iteration, sub), stride 5. Sub-slot mapping:
//   sub 0 : HII halo glow (isHii) OR regular arm star (dead on clump-gap skip)
//   sub 1 : HII core (isHii) OR dead
//   sub 2-4 : newbornIndex = sub - 2 (isHii && newbornIndex < newbornCount) OR dead
// Every record composes the galactic warp onto y with
// 'y + warpOffset(x, z)'.
fn buildArmSlot(iteration: u32, sub: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 3u;
  let armSample = armStarSample(iteration);
  let warped = vec3<f32>(armSample.pos.x, armSample.pos.y + warpOffset(armSample.pos.x, armSample.pos.z), armSample.pos.z);

  if (armSample.isHii) {
    if (sub == 0u) {
      // HII halo glow
      var rec: StarRec;
      rec.pos = warped;
      rec.color = gen.hiiHalo.xyz;
      rec.size = armSample.coreSize * 1.9;
      rec.brightness = armSample.coreBright * 0.22;
      rec.alive = true;
      return rec;
    }
    if (sub == 1u) {
      // HII core
      var rec: StarRec;
      rec.pos = warped;
      rec.color = hiiCorePerturbed(armSample.cv);
      rec.size = armSample.coreSize;
      rec.brightness = armSample.coreBright;
      rec.alive = true;
      return rec;
    }
    // newbornIndex = sub - 2
    let newbornIndex = sub - 2u;
    if (newbornIndex >= armSample.newbornCount) { return dead; }
    let nbase = 40u + 8u * newbornIndex;
    // slot nbase+0: young-star colour
    let color = tempColorRamp(0.86 + 0.12 * genRand(seed, pop, iteration, nbase + 0u));
    // slots nbase+1..2 / +3..4 / +5..6: x / y / z offset
    let newbornX = armSample.pos.x + genNormal(seed, pop, iteration, nbase + 1u) * armSample.coreSize * 0.9;
    let newbornY = armSample.pos.y + genNormal(seed, pop, iteration, nbase + 3u) * 0.05;
    let newbornZ = armSample.pos.z + genNormal(seed, pop, iteration, nbase + 5u) * armSample.coreSize * 0.9;
    // slot nbase+7: brightness
    let brightness = (1.1 + 0.7 * genRand(seed, pop, iteration, nbase + 7u)) * armSample.armFade;
    var rec: StarRec;
    rec.pos = vec3<f32>(newbornX, newbornY + warpOffset(newbornX, newbornZ), newbornZ);
    rec.color = color;
    rec.size = gen.starSize * 0.55;
    rec.brightness = brightness;
    rec.alive = true;
    return rec;
  }

  // non-HII: only sub 0 is a real star; the clump-gap skip kills it entirely.
  if (sub != 0u || armSample.gapSkipped) { return dead; }
  // slot 31: hot blue-white arm colour
  let color = tempColorRamp(0.6 + 0.36 * gen.youngFraction + 0.1 * genRand(seed, pop, iteration, 31u));
  // slot 32: size jitter
  let size = gen.starSize * (0.85 + 0.6 * genRand(seed, pop, iteration, 32u));
  // slots 33-35: randomLuminosity
  let brightness = randomLuminosity(seed, pop, iteration, 33u) * 1.9 * armSample.armFade * armSample.brightMul * armSample.clumpMod;
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

fn irregularSample(iteration: u32) -> IrregularSample {
  let seed = gen.seed;
  let pop = 4u;
  let center = gen.clumpCenters[iteration % 7u]; // NUM_CLUMPS = 7
  let spread = gen.outerRadius * 0.16;
  // slots 0-1 / 2-3 / 4-5: x / y / z scatter
  let posX = center.x + genNormal(seed, pop, iteration, 0u) * spread + gen.irrBarOffset;
  let posY = center.y + genNormal(seed, pop, iteration, 2u) * gen.diskHeight * 2.0;
  let posZ = center.z + genNormal(seed, pop, iteration, 4u) * spread;
  // slot 6: HII gate
  let isHii = genRand(seed, pop, iteration, 6u) < 0.02 * gen.hiiIntensity;
  // slots 7-9: HII knot geometry, reserved regardless.
  let giant = pow(genRand(seed, pop, iteration, 7u), 2.5); // slot 7
  let coreSize = gen.outerRadius * (0.006 + 0.024 * giant); // 0.024, not the arm's 0.022
  let coreBright = (1.6 + 1.4 * genRand(seed, pop, iteration, 8u)) * (0.8 + 1.6 * giant); // slot 8
  let coreColorNudge = 0.1 * genRand(seed, pop, iteration, 9u); // slot 9
  // slot 15: dust-seed gate
  let seedAccepted = genRand(seed, pop, iteration, 15u) < 0.25;

  var clumpSample: IrregularSample;
  clumpSample.pos = vec3<f32>(posX, posY, posZ);
  clumpSample.coreSize = coreSize;
  clumpSample.coreBright = coreBright;
  clumpSample.cv = coreColorNudge;
  clumpSample.isHii = isHii;
  clumpSample.seedAccepted = seedAccepted;
  return clumpSample;
}

// buildIrregularSlot — compose the star record for irregularClumps slot
// (iteration, sub), stride 2. There is no density-gap 'continue' for this
// population: every iteration writes at least one star, so a non-HII sub 0
// is never dead.
fn buildIrregularSlot(iteration: u32, sub: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 4u;
  let clumpSample = irregularSample(iteration);
  let warped = vec3<f32>(clumpSample.pos.x, clumpSample.pos.y + warpOffset(clumpSample.pos.x, clumpSample.pos.z), clumpSample.pos.z);

  if (clumpSample.isHii) {
    if (sub == 0u) {
      // HII halo glow
      var rec: StarRec;
      rec.pos = warped;
      rec.color = gen.hiiHalo.xyz;
      rec.size = clumpSample.coreSize * 1.9;
      rec.brightness = clumpSample.coreBright * 0.22;
      rec.alive = true;
      return rec;
    }
    // sub 1: HII core
    var rec: StarRec;
    rec.pos = warped;
    rec.color = hiiCorePerturbed(clumpSample.cv);
    rec.size = clumpSample.coreSize;
    rec.brightness = clumpSample.coreBright;
    rec.alive = true;
    return rec;
  }

  // non-HII: sub 0 is a real star, sub 1 is dead.
  if (sub != 0u) { return dead; }
  // slot 10: colour
  let color = tempColorRamp(0.66 + 0.3 * genRand(seed, pop, iteration, 10u));
  // slot 11: size jitter
  let size = gen.starSize * (0.9 + 0.7 * genRand(seed, pop, iteration, 11u));
  // slots 12-14: randomLuminosity
  let brightness = randomLuminosity(seed, pop, iteration, 12u);
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

  for (var attempt = 0u; attempt < 8u; attempt = attempt + 1u) {
    let base = 64u * attempt;
    // slot 0: heavy-tailed radial draw
    let radialDraw = genRand(seed, pop, iteration, base + 0u);
    let dist = gen.outerRadius * 0.3 * pow(-log(1.0 - radialDraw * 0.998), 1.35);
    if (dist > gen.outerRadius * 2.4) { continue; } // out of range — resample
    // slot 1: cosLat
    let cosLat = 2.0 * genRand(seed, pop, iteration, base + 1u) - 1.0;
    let sinLat = sqrt(1.0 - cosLat * cosLat);
    // slot 2: lon
    let lon = 2.0 * PI * genRand(seed, pop, iteration, base + 2u);
    let posX = dist * sinLat * cos(lon);
    let posZ = dist * sinLat * sin(lon);
    let posY = dist * cosLat * gen.flattening;
    let haloFalloff = exp(-dist / (gen.outerRadius * (0.85 - 0.45 * gen.bulgeConcentration)));
    // slot 3: colour jitter
    let color = tempColorRamp(0.3 + 0.12 * genRand(seed, pop, iteration, base + 3u));
    // slots 4-6: randomLuminosity
    let brightness = randomLuminosity(seed, pop, iteration, base + 4u) * 0.5 * haloFalloff;

    var rec: StarRec;
    rec.pos = vec3<f32>(posX, posY + warpOffset(posX, posZ), posZ); // warp folded into y
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
// on the cluster index 'clusterIndex' (pop 6 owns no output slots),
// and the member's own position/colour/size/brightness in pop 7 keyed on the
// flat member index. Every member thread of a cluster recomputes that cluster's
// pop-6 draws identically. iteration = clusterIndex*90 + j
// (STARS_PER_CLUSTER = 90).
fn buildGlobularStar(iteration: u32) -> StarRec {
  let seed = gen.seed;
  let clusterIndex = iteration / 90u;

  // --- Cluster-level, pop 6, idx = clusterIndex ---
  let cpop = 6u;
  let dist = gen.outerRadius * (0.35 + 1.0 * pow(genRand(seed, cpop, clusterIndex, 0u), 0.5)); // slot 0
  let cosLat = 2.0 * genRand(seed, cpop, clusterIndex, 1u) - 1.0; // slot 1
  let sinLat = sqrt(1.0 - cosLat * cosLat);
  let lon = 2.0 * PI * genRand(seed, cpop, clusterIndex, 2u); // slot 2
  let centerX = dist * sinLat * cos(lon);
  let centerZ = dist * sinLat * sin(lon);
  let centerY = dist * cosLat * 0.85;
  // slots 3-4: richness = 0.3 + 0.9 * rand() * rand() (two draws)
  let richness = 0.3 + 0.9 * genRand(seed, cpop, clusterIndex, 3u) * genRand(seed, cpop, clusterIndex, 4u);
  // slot 5: cluster radius
  let clusterRadius = gen.outerRadius * (0.003 + 0.01 * pow(genRand(seed, cpop, clusterIndex, 5u), 1.8)) * gen.globularSize * (0.7 + 0.6 * richness);
  let clusterHue = 0.26 + 0.2 * genRand(seed, cpop, clusterIndex, 6u); // slot 6

  // --- Member-level, pop 7, idx = clusterIndex*90 + j == iteration ---
  let mpop = 7u;
  let midx = iteration;
  let memberDistance = clusterRadius * pow(genRand(seed, mpop, midx, 0u), 0.7); // slot 0 (concentrated core)
  let memberCosLat = 2.0 * genRand(seed, mpop, midx, 1u) - 1.0; // slot 1
  let memberSinLat = sqrt(1.0 - memberCosLat * memberCosLat);
  let memberLon = 2.0 * PI * genRand(seed, mpop, midx, 2u); // slot 2
  // slot 3: hue jitter
  let color = tempColorRamp(clusterHue + (genRand(seed, mpop, midx, 3u) - 0.5) * 0.16);
  let size = gen.starSize * (0.5 + 0.22 * genRand(seed, mpop, midx, 4u)); // slot 4
  let brightness = (0.18 + 0.32 * genRand(seed, mpop, midx, 5u)) * gen.globularBright * richness; // slot 5

  let memberX = centerX + memberDistance * memberSinLat * cos(memberLon);
  let memberY = centerY + memberDistance * memberCosLat;
  let memberZ = centerZ + memberDistance * memberSinLat * sin(memberLon);
  var rec: StarRec;
  rec.pos = vec3<f32>(memberX, memberY + warpOffset(memberX, memberZ), memberZ); // warp folded into y
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

fn dustMod(position: vec3<f32>, seed: u32, pop: u32, idx: u32, slot: u32) -> DustMod {
  let noise = dustNoiseAt(position);
  let noiseMix = gen.dustNoiseAmt;
  var modulation: DustMod;
  // The single keep-gate rand — the ONLY draw dustMod makes.
  modulation.keep = genRand(seed, pop, idx, slot) < 1.0 - noiseMix + noiseMix * (0.15 + 1.5 * noise * noise);
  modulation.op = 1.0 - noiseMix + noiseMix * (0.25 + 1.9 * noise);
  modulation.sz = 1.0 - noiseMix + noiseMix * (0.5 + 1.3 * noise);
  return modulation;
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
  for (var rangeIndex = 0u; rangeIndex < gen.starRangeCount; rangeIndex = rangeIndex + 1u) {
    if (gen.starRanges[rangeIndex].w == popId) {
      return gen.starRanges[rangeIndex].y; // iterations lane (start, iterations, stride, popId)
    }
  }
  return 0u;
}

// writeDustParticle — the shared dust write path: compose the galactic warp
// onto y, draw the four reddening factors at the fixed slots 56-59, then bake
// the rigid extra-galaxy transform in at write time (applyExtraTransform, the
// dust twin of writeStar's finalize). posX/posY/posZ arrive PRE-warp.
// Reddened dust reads warm because interstellar dust absorbs blue more than
// red: four rand draws — darkness, then the r/g/b factors, in that order.
fn writeDustParticle(
  seed: u32,
  pop: u32,
  idx: u32,
  posX: f32,
  posY: f32,
  posZ: f32,
  size: f32,
  opacity: f32,
) -> DustRec {
  let warpedY = posY + warpOffset(posX, posZ);
  let darkness = 0.02 + 0.022 * genRand(seed, pop, idx, 56u);      // slot 56
  let dustRed = darkness * (1.05 + 0.55 * genRand(seed, pop, idx, 57u)); // slot 57
  let dustGreen = darkness * (0.6 + 0.22 * genRand(seed, pop, idx, 58u));  // slot 58
  let dustBlue = darkness * (0.32 + 0.26 * genRand(seed, pop, idx, 59u)); // slot 59
  // Position + size baked through the rigid extra transform (identity for a
  // standalone galaxy, where extraScale == 1 and the rotation is zero). Size
  // scales by extraScale separately, the same split writeStar uses.
  var rec: DustRec;
  rec.pos = applyExtraTransform(vec3<f32>(posX, warpedY, posZ));
  rec.size = size * gen.extraScale;
  rec.color = vec3<f32>(dustRed, dustGreen, dustBlue);
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
fn buildArmDust(outputIndex: u32) -> DustRec {
  var dead: DustRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 8u;

  let candidateCount = starRangeIterations(3u); // spiralArms iteration space
  if (candidateCount == 0u) { return dead; }    // no arm seeds -> no dust

  for (var attempt = 0u; attempt < DUST_ATTEMPTS; attempt = attempt + 1u) {
    let base = attempt * ATTEMPT_STRIDE;
    let pick = genRand(seed, pop, outputIndex, base + PICK_SLOT);
    let candidateIndex = min(u32(pick * f32(candidateCount)), candidateCount - 1u);
    let armSample = armStarSample(candidateIndex); // recompute the arm seed — pop 3, bit-identical
    if (!armSample.seedAccepted) { continue; }     // gapped/un-seeded candidate — try another

    let inX = -cos(armSample.angle) * gen.outerRadius * 0.018;
    let inZ = -sin(armSample.angle) * gen.outerRadius * 0.018;
    let dense = genRand(seed, pop, outputIndex, base + 0u) < 0.28;      // slot 0
    let posX = armSample.pos.x + inX + genNormal(seed, pop, outputIndex, base + 1u) * gen.outerRadius * 0.022; // slots 1-2
    let posY = armSample.pos.y * 0.4 + genNormal(seed, pop, outputIndex, base + 3u) * gen.diskHeight * 0.28;   // slots 3-4
    let posZ = armSample.pos.z + inZ + genNormal(seed, pop, outputIndex, base + 5u) * gen.outerRadius * 0.022; // slots 5-6
    let modulation = dustMod(vec3<f32>(posX, posY, posZ), seed, pop, outputIndex, base + 7u); // slot 7 keep gate
    if (!modulation.keep) { continue; }                                                       // reject, try another

    // slot 8: opacity jitter. Only ONE rand is drawn regardless of the dense
    // branch (the select() picks one side), so 'opacityDraw' is reused in both
    // select arms rather than drawing twice.
    let opacityDraw = genRand(seed, pop, outputIndex, base + 8u);
    let opJitter = select(0.05 + 0.11 * opacityDraw, 0.22 + 0.3 * opacityDraw, dense);
    let opacity = opJitter * gen.dustAmount * armSample.armFade * (0.4 + 1.4 * diskFalloff(armSample.radius, 1.5)) * modulation.op;
    // slot 9: size jitter. Dense knots are 1.25x, wisps 0.8x.
    let sizeJitter = 0.007 + 0.015 * genRand(seed, pop, outputIndex, base + 9u);
    let size = gen.outerRadius * sizeJitter * gen.grainScale * select(0.8, 1.25, dense) * modulation.sz;
    return writeDustParticle(seed, pop, outputIndex, posX, posY, posZ, size, opacity);
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
fn buildBarDust(iteration: u32) -> DustRec {
  var dead: DustRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 9u;

  let alongBar = genRand(seed, pop, iteration, 0u) * 2.0 - 1.0; // slot 0 — position along bar
  let lane = select(-1.0, 1.0, genRand(seed, pop, iteration, 1u) < 0.5); // slot 1 — which of the two lanes
  let offAmp = gen.barLength * (0.06 + 0.05 * genRand(seed, pop, iteration, 2u)); // slot 2 — lane offset amplitude
  let sCurve = tanh(alongBar * BAR_LANE_S_STEEP); // lanes swap sides through the nucleus
  let bow = BAR_LANE_BOW * gen.barLength * alongBar * alongBar * alongBar; // antisymmetric cubic: ends peel outward toward the arm roots
  let localX = alongBar * gen.barLength * 0.92;
  let localZ = lane * offAmp * sCurve + bow + genNormal(seed, pop, iteration, 3u) * gen.barLength * 0.045; // slots 3-4
  let posX = localX * gen.cosBar - localZ * gen.sinBar;
  let posZ = localX * gen.sinBar + localZ * gen.cosBar;
  let posY = genNormal(seed, pop, iteration, 5u) * gen.diskHeight * 0.4; // slots 5-6
  let modulation = dustMod(vec3<f32>(posX, posY, posZ), seed, pop, iteration, 7u); // slot 7 keep gate
  if (!modulation.keep) { return dead; }

  let size = gen.outerRadius * (0.008 + 0.013 * genRand(seed, pop, iteration, 8u)) * gen.grainScale * modulation.sz; // slot 8
  let opacity = (0.06 + 0.1 * genRand(seed, pop, iteration, 9u)) * gen.dustAmount * exp(-alongBar * alongBar * 1.2) * modulation.op; // slot 9 — end-fade
  return writeDustParticle(seed, pop, iteration, posX, posY, posZ, size, opacity);
}

// buildLenticularNucDust — S0's dust-poor nuclear disk: cloudy scatter around
// 34 cloud centres. The cloud centres come from gen.cloudCenters (packed as
// (cos*rr, sin*rr, rr, 0) — the .z lane is the cloud's own radius, fed to
// diskFalloff). No seed reuse.
fn buildLenticularNucDust(iteration: u32) -> DustRec {
  var dead: DustRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 10u;

  let center = gen.cloudCenters[iteration % 34u]; // CLOUD_COUNT = 34
  let spread = gen.bulgeRadius * 0.22;
  let posX = center.x + genNormal(seed, pop, iteration, 0u) * spread; // slots 0-1
  let posZ = center.y + genNormal(seed, pop, iteration, 2u) * spread; // slots 2-3
  let posY = genNormal(seed, pop, iteration, 4u) * gen.diskHeight * 0.5; // slots 4-5
  let modulation = dustMod(vec3<f32>(posX, posY, posZ), seed, pop, iteration, 6u); // slot 6 keep gate
  if (!modulation.keep) { return dead; }
  let size = gen.outerRadius * (0.007 + 0.012 * genRand(seed, pop, iteration, 7u)) * gen.grainScale * modulation.sz; // slot 7
  let opacity = (0.05 + 0.15 * genRand(seed, pop, iteration, 8u)) * gen.dustAmount * (0.3 + diskFalloff(center.z, 1.5)) * modulation.op; // slot 8
  return writeDustParticle(seed, pop, iteration, posX, posY, posZ, size, opacity);
}

// buildLenticularRingDust — the Sombrero 'hat-brim': a thin patchy in-plane
// annulus. Carved only when dustRingStrength > 0; its budget and opacity
// ride gen.ringStrength alone, independent of dustAmount. gen.ringRadius /
// gen.ringWidth already carry the outerRadius factor, so they are used
// directly.
fn buildLenticularRingDust(iteration: u32) -> DustRec {
  var dead: DustRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 11u;

  let ringAngle = 2.0 * PI * genRand(seed, pop, iteration, 0u); // slot 0
  let radius = gen.ringRadius + genNormal(seed, pop, iteration, 1u) * gen.ringWidth; // slots 1-2
  let posX = radius * cos(ringAngle);
  let posZ = radius * sin(ringAngle);
  let posY = genNormal(seed, pop, iteration, 3u) * gen.diskHeight * 0.3; // slots 3-4
  let modulation = dustMod(vec3<f32>(posX, posY, posZ), seed, pop, iteration, 5u); // slot 5 keep gate
  if (!modulation.keep) { return dead; }
  let size = gen.outerRadius * (0.008 + 0.014 * genRand(seed, pop, iteration, 6u)) * gen.grainScale * modulation.sz; // slot 6
  let opacity = (0.2 + 0.3 * genRand(seed, pop, iteration, 7u)) * gen.ringStrength * modulation.op; // slot 7 (ringAmt, not dustAmount)
  return writeDustParticle(seed, pop, iteration, posX, posY, posZ, size, opacity);
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
fn buildIrregularDust(outputIndex: u32) -> DustRec {
  var dead: DustRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 12u;

  let candidateCount = starRangeIterations(4u); // irregularClumps iteration space
  if (candidateCount == 0u) { return dead; }     // no clump seeds -> no dust

  for (var attempt = 0u; attempt < DUST_ATTEMPTS; attempt = attempt + 1u) {
    let base = attempt * ATTEMPT_STRIDE;
    let pick = genRand(seed, pop, outputIndex, base + PICK_SLOT);
    let candidateIndex = min(u32(pick * f32(candidateCount)), candidateCount - 1u);
    let clumpSample = irregularSample(candidateIndex); // recompute the clump seed — pop 4, bit-identical
    if (!clumpSample.seedAccepted) { continue; }       // slot-15 seed gate failed — try another

    let dense = genRand(seed, pop, outputIndex, base + 0u) < 0.3; // slot 0
    let posX = clumpSample.pos.x + genNormal(seed, pop, outputIndex, base + 1u) * gen.outerRadius * 0.03; // slots 1-2
    let posY = clumpSample.pos.y + genNormal(seed, pop, outputIndex, base + 3u) * gen.diskHeight * 0.6;   // slots 3-4
    let posZ = clumpSample.pos.z + genNormal(seed, pop, outputIndex, base + 5u) * gen.outerRadius * 0.03; // slots 5-6
    let modulation = dustMod(vec3<f32>(posX, posY, posZ), seed, pop, outputIndex, base + 7u); // slot 7 keep gate
    if (!modulation.keep) { continue; } // reject, try another

    // slot 8: size jitter (dense knots 1.2x, wisps 0.8x).
    let size = gen.outerRadius * (0.008 + 0.016 * genRand(seed, pop, outputIndex, base + 8u)) * gen.grainScale * select(0.8, 1.2, dense) * modulation.sz;
    // slot 9: opacity jitter — one rand reused across the dense branch.
    let opacityDraw = genRand(seed, pop, outputIndex, base + 9u);
    let opJitter = select(0.05 + 0.11 * opacityDraw, 0.16 + 0.22 * opacityDraw, dense);
    let opacity = opJitter * gen.dustAmount * modulation.op;
    return writeDustParticle(seed, pop, outputIndex, posX, posY, posZ, size, opacity);
  }
  return dead; // all attempts missed — the <0.3% shortfall
}
