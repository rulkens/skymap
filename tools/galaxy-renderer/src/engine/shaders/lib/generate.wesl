// lib/generate.wesl — the shared GPU galaxy-generation library: a stateless
// hash RNG plus every piece of ported CPU model math the two compute entry
// points (star pass, dust pass — later tasks) consume. Nothing imports this
// file yet; the link + compile gate is Task 5, so correctness here rides on
// a faithful, line-cited port of the CPU sources rather than a test.
//
// ## Why a STATELESS hash instead of a serial PRNG
//
// The CPU model draws one shared 'mulberry32' stream and walks it serially,
// one star at a time (galaxy-model.js). A single serial stream can't be
// shared across the millions of parallel invocations a compute dispatch
// runs — advancing shared state is exactly the thing thousands of threads
// cannot do without serialising. So instead each invocation DERIVES its
// random values from a pure hash of (seed, population, invocation index,
// slot). 'genRand(seed, pop, idx, slot)' is a pure function: two calls with
// the same arguments always return the same float, and no thread's draw
// perturbs any sibling's. A neighbour thread that needs the same value just
// recomputes the hash for free — there is no stream to rewind, no state to
// contend on. The cost of that freedom is that a serial draw ORDER (which
// the CPU port cares about, since a sequence of Math.random() calls is part
// of the visual result) is replaced by a fixed SLOT budget per invocation:
// each helper documents how many slots it reserves so successive consumers
// never alias each other's hash inputs.
//
// ## Why galaxy-level values arrive via the UBO, not the hash
//
// A handful of quantities the CPU computes ONCE up front — the bar tilt, the
// per-arm personality, the asymmetry values, the scale constants — are shared
// by every invocation. Re-deriving them per thread from a hash would be both
// wasteful and wrong (some depend on a serial draw sequence that only makes
// sense computed once). Those are packed CPU-side into 'GenUniforms' (see
// packGenerationUniforms.ts / generationUboLayout.ts) and read here directly.
// Rule of thumb: per-STAR randomness comes from the hash; per-GALAXY values
// come from the UBO.
//
// ## Why the @group(0) bindings live in THIS lib
//
// WGSL resource bindings are module-scope by design. The 'gen' uniform and
// the stride-8 output storage array are declared here ONCE and imported by
// both entry shaders, so the helper fns below read the module-scope 'gen'
// directly instead of threading a pointer through every call. The two passes
// (stars, dust) bind DIFFERENT buffers to the same @binding declarations at
// dispatch time — same declaration, different backing buffer per pass — which
// is precisely what module-scope bindings are for.

// pi, in f32. The CPU uses Math.PI (f64); f32 rounds it in the ~7th digit, a
// negligible angular error everywhere it is used (Box-Muller phase, arm/bar
// angles). Documented here so the divergence is a known quantity, not a bug.
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
  // scale group — generationUboLayout.ts:92-99 (6 scalars + 2 pad)
  outerRadius: f32,
  diskScaleLen: f32,
  bulgeRadius: f32,
  diskHeight: f32,
  grainScale: f32,
  starSize: f32,
  _padScale0: f32,
  _padScale1: f32,

  // asymmetry group — generationUboLayout.ts:101-110 (8 scalars, no pad)
  flattening: f32,
  asymmetry: f32,
  lopsidedAmp: f32,
  lopsidedAngle: f32,
  bulgeAxisZ: f32,
  cosBulge: f32,
  sinBulge: f32,
  bulgeConcentration: f32,

  // bar group — generationUboLayout.ts:112 (3 scalars + 1 pad)
  barLength: f32,
  cosBar: f32,
  sinBar: f32,
  _padBar0: f32,

  // warp group — generationUboLayout.ts:114 (3 scalars + 1 pad)
  warpStrength: f32,
  warpTwist: f32,
  warpStartRadius: f32,
  _padWarp0: f32,

  // dust group — generationUboLayout.ts:116-124 (7 scalars + 1 pad)
  dustAmount: f32,
  dustNoiseAmt: f32,
  noiseFreq: f32,
  clumpAmount: f32,
  ringRadius: f32,
  ringWidth: f32,
  ringStrength: f32,
  _padDust0: f32,

  // arms group — generationUboLayout.ts:126-134 (7 scalars + 1 pad)
  subArmAmount: f32,
  waveAmount: f32,
  armStartRadius: f32,
  armWidthFactor: f32,
  armFullRadius: f32,
  armInnerRampW: f32,
  weightSum: f32,
  _padArms0: f32,

  // misc group — generationUboLayout.ts:136-143 (6 scalars + 2 pad)
  globularSize: f32,
  globularBright: f32,
  youngFraction: f32,
  hiiIntensity: f32,
  irrBarOffset: f32,
  extraScale: f32,
  _padMisc0: f32,
  _padMisc1: f32,

  // palette + transform vec4s — generationUboLayout.ts:145-148
  hiiCore: vec4<f32>,   // (r, g, b, 0) — packGenerationUniforms.ts:293
  hiiHalo: vec4<f32>,   // (r, g, b, 0) — packGenerationUniforms.ts:294
  extraPos: vec4<f32>,  // (x, y, z, 0) — packGenerationUniforms.ts:297
  extraRot: vec4<f32>,  // (cosRotY, sinRotY, cosTiltX, sinTiltX) — packGenerationUniforms.ts:300-307

  // u32 group — generationUboLayout.ts:150-159 (8 u32, no pad)
  seed: u32,
  noiseSeed: u32,
  category: u32,
  numArms: u32,
  starCapacity: u32,
  dustCapacity: u32,
  starRangeCount: u32,
  dustRangeCount: u32,

  // fixed-size arrays — generationUboLayout.ts:161-165. armTable holds 8
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
// GPU Rendering' (JCGT 2020). The integer math is bit-exact vs a CPU u32
// port: WGSL u32 multiply and add both wrap mod 2^32, matching the paper's
// reference GLSL. Only downstream f32 casts of the result diverge.
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
// rounds the 32-bit hash word to f32's 24-bit mantissa before scaling, so
// this loses low-order bits relative to the CPU's f64 division (mulberry32).
// That is inherent to f32 GPU math and is the primary numeric divergence the
// parity harness must tolerate; the distribution is unaffected.
fn genRand(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 {
  return f32(pcg4d(vec4<u32>(seed, pop, idx, slot)).x) * INV_2POW32;
}

// genNormal — one Box-Muller normal (mean 0, stddev 1) from slots {slot,
// slot+1}. Ports gaussian.ts:13-16. The CPU floor-clamps u1 to
// Number.MIN_VALUE (~5e-324); f32 cannot represent that, so we clamp to
// 1e-38 (f32's smallest normal) per the brief — a deliberate divergence
// forced by the type, guarding log(0) exactly as the CPU does.
fn genNormal(seed: u32, pop: u32, idx: u32, slot: u32) -> f32 {
  let u1 = max(genRand(seed, pop, idx, slot), 1e-38);
  let u2 = genRand(seed, pop, idx, slot + 1u);
  return sqrt(-2.0 * log(u1)) * cos(2.0 * PI * u2);
}

// randomLuminosity — steep-tailed stellar luminosity, createGalaxyBuild
// Context.ts:89-92. Reserves 3 slots: u (slot), the flare gate (slot+1) and
// the flare magnitude (slot+2). The CPU short-circuits and only draws the
// third rand() when the gate passes; here slot+2 is ALWAYS reserved so the
// next consumer's slot budget is fixed regardless of the branch — the flare
// value simply goes unused (contributes 0) when the gate fails, matching the
// CPU result exactly.
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

// sampleDiskRadius — rejection-sampled exponential disk radius, createGalaxy
// BuildContext.ts:79-86. Reserves 12 slots: up to 6 attempts, each drawing a
// pair {2k, 2k+1}. Mirrors the CPU do-while: try, accept the first radius
// within outerRadius*1.5, otherwise take the 6th attempt and CLAMP (never
// dead). Early acceptance leaves later slots unhashed, but the 12-slot
// reservation is a caller contract so successive consumers still line up.
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
// Value noise — port of makeValueNoise.ts:49-81
// ---------------------------------------------------------------------------

// Cubic smoothstep 3t^2 - 2t^3 (makeValueNoise.ts:63): zero slope at t=0 and
// t=1 so trilinear-blended cells join seamlessly.
fn nSmooth(t: f32) -> f32 {
  return t * t * (3.0 - 2.0 * t);
}

fn nLerp(a: f32, b: f32, t: f32) -> f32 {
  return a + (b - a) * t;
}

// nHash — the u32 lattice hash from makeValueNoise.ts:49-58. The CPU uses
// Math.imul (true 32-bit wrap multiply) and | 0 / >>> avalanche steps; WGSL
// u32 arithmetic reproduces the identical bit pattern up to the final f32
// division (which rounds the 32-bit word to f32, a small precision loss). The
// integer lattice coords arrive as i32 (they can be negative) and are
// bitcast to u32 so the wrap-multiply matches ToInt32 semantics.
fn nHash(xi: i32, yi: i32, zi: i32, s: u32) -> f32 {
  let xu = bitcast<u32>(xi);
  let yu = bitcast<u32>(yi);
  let zu = bitcast<u32>(zi);
  var h = xu * 374761393u + yu * 668265263u + zu * 2147483647u + s * 974711u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  return f32(h ^ (h >> 16u)) * INV_2POW32;
}

// valueNoise3 — seeded 3D value noise, [0, 1). floor() BEFORE the i32 cast so
// negative coords floor (not truncate toward zero), matching Math.floor. The
// trilinear blend order (x edges, then y, then z) is verbatim from
// makeValueNoise.ts:77-81.
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

// dustNoiseAt — two-octave dust sample, createDustField.ts:27-30. Base octave
// runs y at half frequency; the 2.3x-frequency detail layer is half-weighted
// and the sum is normalised by 1.5 (1 + 0.5) to stay roughly in [0, 1). Both
// octaves read gen.noiseSeed (the dust field's decorrelated seed) and
// gen.noiseFreq (the CPU 'nfreq' = 2.4 * dustNoiseScale / outerRadius).
fn dustNoiseAt(p: vec3<f32>) -> f32 {
  let f = gen.noiseFreq;
  let base = valueNoise3(vec3<f32>(p.x * f, p.y * f * 0.5, p.z * f), gen.noiseSeed);
  let detail = valueNoise3(vec3<f32>(p.x * f * 2.3, p.y * f, p.z * f * 2.3), gen.noiseSeed);
  return (base + 0.5 * detail) / 1.5;
}

// ---------------------------------------------------------------------------
// Colour + shaping helpers
// ---------------------------------------------------------------------------

// tempColorRamp — stellar colour ramp, tempColor.ts:18-25 + :37-44. Six hand-
// picked stops, cool (red) to hot (blue). t is clamped to [0, 0.999] before
// scaling by (6 stops - 1) = 5 so the index never runs past the final stop.
// A local var array is used (not a module const) so the runtime index is
// portable across every WGSL backend.
fn tempColorRamp(t: f32) -> vec3<f32> {
  var stops = array<vec3<f32>, 6>(
    vec3<f32>(1.0, 0.36, 0.16),  // tempColor.ts:19
    vec3<f32>(1.0, 0.58, 0.28),  // tempColor.ts:20
    vec3<f32>(1.0, 0.83, 0.55),  // tempColor.ts:21
    vec3<f32>(1.0, 0.97, 0.9),   // tempColor.ts:22
    vec3<f32>(0.79, 0.86, 1.0),  // tempColor.ts:23
    vec3<f32>(0.6, 0.72, 1.0)    // tempColor.ts:24
  );
  let scaled = clamp(t, 0.0, 0.999) * 5.0;  // (COLOR_STOPS.length - 1) — tempColor.ts:37
  let i = i32(scaled);                       // scaled | 0 — tempColor.ts:38 (scaled >= 0, so trunc == floor)
  let f = scaled - f32(i);
  let a = stops[i];
  let b = stops[i + 1];
  return a + (b - a) * f;
}

// hiiCorePerturbed — the HII-region core colour, spiralArms.ts:196-205: the
// palette core (gen.hiiCore) with its green and blue channels nudged up by
// 'cv' and clamped to 1. Red is untouched.
fn hiiCorePerturbed(cv: f32) -> vec3<f32> {
  return vec3<f32>(
    gen.hiiCore.x,
    min(1.0, gen.hiiCore.y + cv),
    min(1.0, gen.hiiCore.z + cv)
  );
}

// warpOffset — the galactic-warp vertical offset, makeWarpOffset.ts:35-42.
// Zero inside warpStartRadius (the flat inner disk); beyond it the disk bends
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

// applyLopsided — large-scale one-sided radius modulation, createGalaxyBuild
// Context.ts:62-63.
fn applyLopsided(radius: f32, angle: f32) -> f32 {
  return radius * (1.0 + gen.lopsidedAmp * cos(angle - gen.lopsidedAngle));
}

// diskFalloff — exponential disk density falloff, createGalaxyBuildContext.ts:75-76.
fn diskFalloff(radius: f32, softness: f32) -> f32 {
  return exp(-radius / (gen.diskScaleLen * softness));
}

// applyExtraTransform — the rigid background-galaxy transform, bakeExtra
// Transform.ts:56-78: scale, then Y spin (disk), then X tilt (inclination),
// then translate. gen.extraRot packs (cosRotY, sinRotY, cosTiltX, sinTiltX);
// gen.extraScale and gen.extraPos supply the scale and translation. POSITION
// only — the caller scales the record's size by gen.extraScale separately
// (bakeExtraTransform.ts:79), so builders stay transform-free.
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

// writeStar — interleave one star into the stride-8 output at record 'index',
// field order x,y,z,r,g,b,size,brightness (starWriter.ts:34-42).
fn writeStar(index: u32, rec: StarRec) {
  let base = index * 8u;
  outBuf[base + 0u] = rec.pos.x;
  outBuf[base + 1u] = rec.pos.y;
  outBuf[base + 2u] = rec.pos.z;
  outBuf[base + 3u] = rec.color.x;
  outBuf[base + 4u] = rec.color.y;
  outBuf[base + 5u] = rec.color.z;
  outBuf[base + 6u] = rec.size;
  outBuf[base + 7u] = rec.brightness;
}

// writeDust — interleave one dust particle into the stride-8 output at record
// 'index', field order x,y,z,size,r,g,b,opacity (dustWriter.ts:23-25). Size
// precedes colour here — the opposite of stars — matching the GPU dust-quad
// vertex layout; it is carried as-is, not 'fixed'.
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
// Each builder ports one CPU population loop body verbatim and returns the
// StarRec for the given 'iteration'. The CPU loop is serial (one shared rand
// stream, drawn in source order); here every draw reads a fixed SLOT so the
// hash inputs never alias. The slot budget per builder is the enumeration the
// Task-6 brief fixes; the numbered comments below map each draw to its slot.
//
// ## The rejection-retry convention (bulge, bar)
//
// The CPU rejects an out-of-range draw with 'i--; continue' — a *resample*
// that leaves the population's record count unchanged (the loop keeps trying
// until it lands in range). A stateless hash cannot 'redraw' from a stream,
// so a rejected attempt k re-hashes the WHOLE iteration at slot + 64*k: each
// retry gets its own disjoint 64-slot window so its draws never alias the
// previous attempt's. After 8 attempts the record is declared dead — a
// deliberate, negligible-probability divergence from the CPU's unbounded
// resample, forced by the finite slot budget. Every galaxy-level value
// (bulge axes, bar geometry, flattening...) comes from 'gen' — never
// re-derived per invocation; only the per-STAR draws come from the hash.
//
// The CPU addStar composes the galactic-warp vertical offset onto y
// (createGalaxyBuildContext.ts:110-121); each builder reproduces that with
// 'y + warpOffset(x, z)' so the returned record already carries the warp.

// buildBulge — old, warm stars in a triaxial spheroid. Ports bulge.ts:39-80.
// Radial rejection loop; retry at +64*k, dead after 8. Two radial branches
// (elliptical falloff pair bulge.ts:45-50 vs disk-bulge :52-57) share the
// single radial draw at slot 0.
fn buildBulge(iteration: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 0u;

  for (var k = 0u; k < 8u; k = k + 1u) {
    let base = 64u * k;
    // slot 0: radial draw (shared by both radial branches — bulge.ts:45 / :52)
    let u = genRand(seed, pop, iteration, base + 0u);
    var dist: f32;
    var brightnessFalloff: f32;
    if (gen.category == 0u) {
      // elliptical: heavy-tailed profile + soft brightness falloff (bulge.ts:45-50)
      dist = gen.outerRadius * 0.16 * pow(-log(1.0 - u * 0.997), 1.3);
      if (dist > gen.outerRadius * 1.6) { continue; } // bulge.ts:46-49 resample
      brightnessFalloff = exp(-dist / (gen.outerRadius * (0.62 - 0.4 * gen.bulgeConcentration))); // bulge.ts:50
    } else {
      // disk-galaxy bulge: smaller, blends into disk (bulge.ts:52-57)
      dist = gen.bulgeRadius * 0.55 * pow(-log(1.0 - u * 0.997), 1.25);
      if (dist > gen.bulgeRadius * 2.8) { continue; } // bulge.ts:53-56 resample
      brightnessFalloff = exp(-dist / (gen.bulgeRadius * (1.5 - 1.0 * gen.bulgeConcentration))); // bulge.ts:57
    }
    // Uniform direction on a sphere, squashed/rotated into a triaxial ellipsoid.
    let cosLat = 2.0 * genRand(seed, pop, iteration, base + 1u) - 1.0; // slot 1 — bulge.ts:60
    let sinLat = sqrt(1.0 - cosLat * cosLat);                          // bulge.ts:61
    let lon = 2.0 * PI * genRand(seed, pop, iteration, base + 2u);     // slot 2 — bulge.ts:62
    let bulgeAxisX = 1.0;                                              // createGalaxyBuildContext.ts:65 (constant, not in UBO)
    let localX = dist * sinLat * cos(lon) * bulgeAxisX;                // bulge.ts:63
    let localY = dist * cosLat * gen.flattening;                      // bulge.ts:64 (bulgeAxisY = flattening, ctx.ts:66)
    let localZ = dist * sinLat * sin(lon) * gen.bulgeAxisZ;            // bulge.ts:65
    let x = localX * gen.cosBulge - localZ * gen.sinBulge;             // bulge.ts:66
    let z = localX * gen.sinBulge + localZ * gen.cosBulge;            // bulge.ts:67
    let y = localY;                                                    // bulge.ts:68
    // slot 3: warm/old population colour jitter (bulge.ts:69)
    let color = tempColorRamp(0.27 + 0.15 * genRand(seed, pop, iteration, base + 3u));
    // slot 4: size jitter (bulge.ts:77)
    let size = gen.starSize * (0.8 + 0.5 * genRand(seed, pop, iteration, base + 4u));
    // slots 5-7: randomLuminosity (bulge.ts:78)
    let brightness = randomLuminosity(seed, pop, iteration, base + 5u) * 0.85 * brightnessFalloff;

    var rec: StarRec;
    rec.pos = vec3<f32>(x, y + warpOffset(x, z), z); // addStar warp — ctx.ts:120
    rec.color = color;
    rec.size = size;
    rec.brightness = brightness;
    rec.alive = true;
    return rec;
  }
  return dead;
}

// buildBar — for barred spirals, an elongated stellar bar. Ports bar.ts:28-52.
// |alongBar| > 1.25 rejection; retry at +64*k, dead after 8. Only reachable
// when the bar range exists (carveStarLayout omits it for non-barred), so no
// category test is needed inside the builder — bar.ts:22's guard is enforced
// upstream by the range table.
fn buildBar(iteration: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 1u;

  for (var k = 0u; k < 8u; k = k + 1u) {
    let base = 64u * k;
    // slots 0-1: position along the bar, a clamped gaussian (bar.ts:29)
    let alongBar = genNormal(seed, pop, iteration, base + 0u) * 0.44;
    if (abs(alongBar) > 1.25) { continue; } // bar.ts:30-33 resample
    let localX = alongBar * gen.barLength; // bar.ts:34
    // slot 2: half-width, narrowing toward the tips (bar.ts:35)
    let barHalfWidth = gen.barLength * (0.14 + 0.09 * genRand(seed, pop, iteration, base + 2u)) * (1.0 - 0.4 * abs(alongBar));
    // slots 3-4: transverse scatter (bar.ts:36)
    let localZ = genNormal(seed, pop, iteration, base + 3u) * barHalfWidth;
    let x = localX * gen.cosBar - localZ * gen.sinBar; // bar.ts:37
    let z = localX * gen.sinBar + localZ * gen.cosBar; // bar.ts:38
    // slots 5-6: vertical scatter (bar.ts:39)
    let y = genNormal(seed, pop, iteration, base + 5u) * gen.diskHeight * 1.4;
    // slot 7: colour jitter (bar.ts:40)
    let color = tempColorRamp(0.29 + 0.17 * genRand(seed, pop, iteration, base + 7u));
    let endFade = exp(-alongBar * alongBar * 1.3); // bar.ts:41
    // slot 8: size jitter (bar.ts:49)
    let size = gen.starSize * (0.8 + 0.5 * genRand(seed, pop, iteration, base + 8u));
    // slots 9-11: randomLuminosity (bar.ts:50)
    let brightness = randomLuminosity(seed, pop, iteration, base + 9u) * 0.9 * endFade;

    var rec: StarRec;
    rec.pos = vec3<f32>(x, y + warpOffset(x, z), z); // addStar warp — ctx.ts:120
    rec.color = color;
    rec.size = size;
    rec.brightness = brightness;
    rec.alive = true;
    return rec;
  }
  return dead;
}

// buildDisk — the smooth inter-arm stellar background. Ports disk.ts:47-73.
// No retry loop: sampleDiskRadius CLAMPS rather than rejects (slots 0-11), and
// the barred centre-fade at slot 12 is a SKIP (return dead, NO retry). The
// skip is deliberate — conflating it with a resample would pad the barred disk
// back up to diskCount stars and erase the centre fade the bar fills in
// (disk.ts module header). Slot 12 is reserved for EVERY category so the
// downstream slots line up regardless of the branch; a non-barred galaxy just
// leaves it unhashed.
fn buildDisk(iteration: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 2u;

  // slots 0-11: rejection-sampled exponential radius, clamped (disk.ts:48)
  var radius = sampleDiskRadius(seed, pop, iteration, 0u);
  // slot 12: barred centre-fade gate — SKIP on reject (disk.ts:51-54)
  if (gen.category == 3u) {
    let t = radius / (gen.barLength * 1.15);
    if (genRand(seed, pop, iteration, 12u) > t * t) {
      return dead; // skip, not resample: shrinks the count on purpose (module header)
    }
  }
  // slot 13: azimuth (disk.ts:55)
  let angle = 2.0 * PI * genRand(seed, pop, iteration, 13u);
  radius = applyLopsided(radius, angle); // disk.ts:56 — post-lopsided radius used below
  let x = radius * cos(angle); // disk.ts:57
  let z = radius * sin(angle); // disk.ts:58
  // slots 14-15: vertical scatter, puffier near the bulge (disk.ts:60)
  let y = genNormal(seed, pop, iteration, 14u) * gen.diskHeight * (0.6 + gen.bulgeRadius / (radius + gen.bulgeRadius));
  // slot 16: colour — outskirts a little bluer/younger (disk.ts:62)
  let color = tempColorRamp(0.34 + 0.3 * gen.youngFraction * (radius / gen.outerRadius) + 0.12 * genRand(seed, pop, iteration, 16u));
  // slot 17: size jitter (disk.ts:70)
  let size = gen.starSize * (0.75 + 0.5 * genRand(seed, pop, iteration, 17u));
  // slots 18-20: randomLuminosity (disk.ts:71)
  let brightness = randomLuminosity(seed, pop, iteration, 18u) * 1.35 * diskFalloff(radius, 1.7);

  var rec: StarRec;
  rec.pos = vec3<f32>(x, y + warpOffset(x, z), z); // addStar warp — ctx.ts:120
  rec.color = color;
  rec.size = size;
  rec.brightness = brightness;
  rec.alive = true;
  return rec;
}

// ---------------------------------------------------------------------------
// Population builders — batch B (spiral arms, irregular clumps, halo, globulars)
// ---------------------------------------------------------------------------

// ArmStarSample — the shared per-iteration state of one spiralArms draw
// (spiralArms.ts:123-236). The arm builder is the one population that spawns
// BOTH stars (arm star, HII halo/core/newborns) AND dust, so the slots the CPU
// draws once per loop iteration (0-29, plus the gap gate 30 and dust gate 36 —
// see the slot table in the Task-7 brief) are computed ONCE here and consumed
// by every sibling. The stride-5 record means five threads run buildArmSlot for
// the same 'i'; each recomputes armStarSample(i) identically (the hash is
// stateless) and then does only its own sub-slot work.
//
// ## The Task-8 (dust) seam
//
// The dust pass reads EXACTLY these five fields: 'pos' (pre-warp x/y/z), plus
// 'radius', 'angle', 'armFade' and 'seedAccepted' — the {x,y,z,radius,angle,
// armFade} the CPU pushes onto dustSeeds, gated by 'seedAccepted' (the slot-36
// draw, which the CPU's clump-gap 'continue' also skips — spiralArms.ts:221 vs
// :235). The remaining fields are STAR-only shared state (HII knot geometry,
// sub-arm brightness/clump modulation, the non-HII gap skip) that buildArmSlot
// consumes to compose its per-sub records; the dust builder ignores them.
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
  seedAccepted: bool,  // dust-seed gate — the Task-8 dust seam
}

// armStarSample — recompute one spiralArms iteration's shared state. Every
// galaxy-level value (per-arm phase/pitch/weight/meander/clump/wave/fadeRadius)
// comes from gen.armTable, packed by packGenerationUniforms.ts:176-193 as 4
// vec4 per arm: [phase, pitch, weight, fadeRadius][meanderAmp, meanderFreq,
// meanderPhase, _][clumpF1, clumpP1, clumpF2, clumpP2][waveF1, waveP1, waveF2,
// waveP2] (armTableLayout in generationUboLayout.ts:182-187).
fn armStarSample(i: u32) -> ArmStarSample {
  let seed = gen.seed;
  let pop = 3u;

  // slots 0-11: smooth-start radius (spiralArms.ts:124)
  var radius = gen.armStartRadius * 0.5 + sampleDiskRadius(seed, pop, i, 0u);

  // slot 12: weighted arm pick — scan armTable weights vs gen.weightSum
  // (spiralArms.ts:126-131)
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

  let logRadius = log(radius / gen.armStartRadius); // spiralArms.ts:132

  // slot 13: sub-arm gate (spiralArms.ts:136); slots 14-16: sub-arm side/phase/
  // pitch jitter (spiralArms.ts:142-146) — reserved regardless of the branch.
  let isSubArm = gen.subArmAmount > 0.0 && genRand(seed, pop, i, 13u) < gen.subArmAmount * 0.6;
  var phase = rec0.x;
  var pitch = rec0.y;
  var widthMul = 1.0;
  var brightMul = 1.0;
  if (isSubArm) {
    let side = select(-1.0, 1.0, genRand(seed, pop, i, 14u) < 0.5); // spiralArms.ts:142
    phase = rec0.x + side * (PI / f32(gen.numArms)) * (0.45 + 0.5 * genRand(seed, pop, i, 15u)); // :143
    pitch = rec0.y * (0.82 + 0.42 * genRand(seed, pop, i, 16u)); // :144
    widthMul = 1.8;
    brightMul = 0.62;
  }

  // Base log-spiral angle + meander + high-frequency wave (spiralArms.ts:151-160)
  var angle = phase + pitch * logRadius
    + rec1.x * sin(rec1.y * logRadius * 2.0 + rec1.z);
  if (gen.waveAmount > 0.0) {
    angle = angle + gen.waveAmount * (
      sin(rec3.x * logRadius + rec3.y) * 0.16 +
      sin(rec3.z * logRadius + rec3.w) * 0.09);
  }
  // slots 17-18: spur feather (sub-arm only — spiralArms.ts:161)
  if (isSubArm) {
    angle = angle + genNormal(seed, pop, i, 17u) * 0.14;
  }
  // slots 19-20: angle feather (spiralArms.ts:162)
  angle = angle + genNormal(seed, pop, i, 19u) * gen.armWidthFactor * widthMul * (1.0 + gen.armStartRadius / radius);
  // slots 21-22: perpendicular offset (spiralArms.ts:163)
  let perpOffset = genNormal(seed, pop, i, 21u) * gen.armWidthFactor * widthMul * radius * 0.5;
  radius = applyLopsided(radius, angle); // spiralArms.ts:164 — post-lopsided from here on
  let x = radius * cos(angle) - perpOffset * sin(angle); // spiralArms.ts:165
  let z = radius * sin(angle) + perpOffset * cos(angle); // spiralArms.ts:166
  // slots 23-24: vertical scatter (spiralArms.ts:167)
  let y = genNormal(seed, pop, i, 23u) * gen.diskHeight * 0.8;

  // Brightness envelope: fade in near arm start, fade out at this arm's own
  // edge radius (fadeRadius = rec0.w) — both smoothstep (spiralArms.ts:171-175).
  var innerT = (radius - gen.armStartRadius) / gen.armInnerRampW;
  innerT = clamp(innerT, 0.0, 1.0);
  var outerT = (radius - gen.armFullRadius) / max(0.001, rec0.w - gen.armFullRadius);
  outerT = clamp(outerT, 0.0, 1.0);
  let armFade = innerT * innerT * (3.0 - 2.0 * innerT) * (1.0 - outerT * outerT * (3.0 - 2.0 * outerT));

  // Low-frequency along-arm modulation (spiralArms.ts:178-184)
  var clumpMod = 1.0;
  if (gen.clumpAmount > 0.0) {
    let noise = sin(logRadius * rec2.x + rec2.y) * 0.6 + sin(logRadius * rec2.z + rec2.w) * 0.4;
    clumpMod = 1.0 - gen.clumpAmount * (0.5 - 0.5 * noise);
  }

  // slot 25: HII gate (spiralArms.ts:186)
  let subFactor = select(1.0, 0.4, isSubArm);
  let isHii = genRand(seed, pop, i, 25u) < 0.011 * gen.hiiIntensity * subFactor;

  // slots 26-29: HII knot geometry (spiralArms.ts:191-206). Reserved regardless
  // of the branch so the sub-record composition + newborn block line up.
  let giant = pow(genRand(seed, pop, i, 26u), 2.5); // slot 26 — spiralArms.ts:191
  let coreSize = gen.outerRadius * (0.006 + 0.022 * giant); // :192
  let coreBright = (1.4 + 1.2 * genRand(seed, pop, i, 27u)) * (0.7 + 2.0 * giant) * gen.hiiIntensity * armFade; // slot 27 — :193
  let cv = 0.1 * genRand(seed, pop, i, 28u); // slot 28 — :195
  let newbornCount = 1u + u32(genRand(seed, pop, i, 29u) * 3.0); // slot 29 — :206

  // slot 30: clump-gap gate (non-HII only — spiralArms.ts:221). The HII branch
  // never gaps (the 'continue' lives in the else arm).
  var gapSkipped = false;
  if (!isHii) {
    gapSkipped = gen.clumpAmount > 0.0 && genRand(seed, pop, i, 30u) > 0.4 + 0.6 * clumpMod;
  }

  // slot 36: dust-seed gate (spiralArms.ts:235). A gapped non-HII star hits the
  // CPU 'continue' before the seed push, so it seeds no dust.
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
// stride 5 (carveStarLayout.ts:19-23). Sub-slot mapping (spiralArms.ts:187-233):
//   sub 0 : HII halo glow (isHii) OR regular arm star (dead on clump-gap skip)
//   sub 1 : HII core (isHii) OR dead
//   sub 2-4 : newborn b = sub - 2 (isHii && b < newbornCount) OR dead
// addStar composes the galactic warp onto y (createGalaxyBuildContext.ts:120),
// reproduced per record with 'y + warpOffset(x, z)'.
fn buildArmSlot(i: u32, sub: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 3u;
  let s = armStarSample(i);
  let warped = vec3<f32>(s.pos.x, s.pos.y + warpOffset(s.pos.x, s.pos.z), s.pos.z);

  if (s.isHii) {
    if (sub == 0u) {
      // HII halo glow (spiralArms.ts:194)
      var rec: StarRec;
      rec.pos = warped;
      rec.color = gen.hiiHalo.xyz;
      rec.size = s.coreSize * 1.9;
      rec.brightness = s.coreBright * 0.22;
      rec.alive = true;
      return rec;
    }
    if (sub == 1u) {
      // HII core (spiralArms.ts:196-205)
      var rec: StarRec;
      rec.pos = warped;
      rec.color = hiiCorePerturbed(s.cv);
      rec.size = s.coreSize;
      rec.brightness = s.coreBright;
      rec.alive = true;
      return rec;
    }
    // newborn b = sub - 2 (spiralArms.ts:207-218)
    let b = sub - 2u;
    if (b >= s.newbornCount) { return dead; }
    let nbase = 40u + 8u * b;
    // slot nbase+0: young-star colour (spiralArms.ts:208)
    let color = tempColorRamp(0.86 + 0.12 * genRand(seed, pop, i, nbase + 0u));
    // slots nbase+1..2 / +3..4 / +5..6: x / y / z offset (spiralArms.ts:210-215)
    let nx = s.pos.x + genNormal(seed, pop, i, nbase + 1u) * s.coreSize * 0.9;
    let ny = s.pos.y + genNormal(seed, pop, i, nbase + 3u) * 0.05;
    let nz = s.pos.z + genNormal(seed, pop, i, nbase + 5u) * s.coreSize * 0.9;
    // slot nbase+7: brightness (spiralArms.ts:217)
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
  // slot 31: hot blue-white arm colour (spiralArms.ts:222)
  let color = tempColorRamp(0.6 + 0.36 * gen.youngFraction + 0.1 * genRand(seed, pop, i, 31u));
  // slot 32: size jitter (spiralArms.ts:230)
  let size = gen.starSize * (0.85 + 0.6 * genRand(seed, pop, i, 32u));
  // slots 33-35: randomLuminosity (spiralArms.ts:231)
  let brightness = randomLuminosity(seed, pop, i, 33u) * 1.9 * s.armFade * s.brightMul * s.clumpMod;
  var rec: StarRec;
  rec.pos = warped;
  rec.color = color;
  rec.size = size;
  rec.brightness = brightness;
  rec.alive = true;
  return rec;
}

// IrregularSample — the shared per-iteration state of one irregularClumps draw
// (irregularClumps.ts:60-90). Stride 2: sub 0 = regular star or HII halo, sub 1
// = HII core or dead. Clump centres come from gen.clumpCenters (packed by
// packGenerationUniforms.ts:120-127); the LMC-style bar offset is gen.irrBarOffset.
//
// ## The Task-8 (dust) seam
//
// The dust pass reads 'pos' (pre-warp x/y/z) and 'seedAccepted' (the slot-15
// gate, rand < 0.25 — irregularClumps.ts:87); the HII fields are star-only.
struct IrregularSample {
  pos: vec3<f32>,     // pre-warp x/y/z
  coreSize: f32,      // HII core radius
  coreBright: f32,    // HII core brightness
  cv: f32,            // HII core colour nudge
  isHii: bool,
  seedAccepted: bool, // dust-seed gate — the Task-8 dust seam
}

fn irregularSample(i: u32) -> IrregularSample {
  let seed = gen.seed;
  let pop = 4u;
  let center = gen.clumpCenters[i % 7u]; // NUM_CLUMPS = 7 (irregularClumps.ts:26)
  let spread = gen.outerRadius * 0.16;   // irregularClumps.ts:62
  // slots 0-1 / 2-3 / 4-5: x / y / z scatter (irregularClumps.ts:63-65)
  let x = center.x + genNormal(seed, pop, i, 0u) * spread + gen.irrBarOffset;
  let y = center.y + genNormal(seed, pop, i, 2u) * gen.diskHeight * 2.0;
  let z = center.z + genNormal(seed, pop, i, 4u) * spread;
  // slot 6: HII gate (irregularClumps.ts:66)
  let isHii = genRand(seed, pop, i, 6u) < 0.02 * gen.hiiIntensity;
  // slots 7-9: HII knot geometry (irregularClumps.ts:68-72), reserved regardless.
  let giant = pow(genRand(seed, pop, i, 7u), 2.5); // slot 7 — :68
  let coreSize = gen.outerRadius * (0.006 + 0.024 * giant); // :69 (0.024, not the arm's 0.022)
  let coreBright = (1.6 + 1.4 * genRand(seed, pop, i, 8u)) * (0.8 + 1.6 * giant); // slot 8 — :70
  let cv = 0.1 * genRand(seed, pop, i, 9u); // slot 9 — :72
  // slot 15: dust-seed gate (irregularClumps.ts:87)
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
// (i, sub), stride 2 (carveStarLayout.ts:24-26). No density-gap 'continue' here
// (module header): every iteration writes at least one star, so a non-HII sub 0
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
      // HII halo glow (irregularClumps.ts:71)
      var rec: StarRec;
      rec.pos = warped;
      rec.color = gen.hiiHalo.xyz;
      rec.size = s.coreSize * 1.9;
      rec.brightness = s.coreBright * 0.22;
      rec.alive = true;
      return rec;
    }
    // sub 1: HII core (irregularClumps.ts:73-82)
    var rec: StarRec;
    rec.pos = warped;
    rec.color = hiiCorePerturbed(s.cv);
    rec.size = s.coreSize;
    rec.brightness = s.coreBright;
    rec.alive = true;
    return rec;
  }

  // non-HII: sub 0 is a real star, sub 1 is dead (irregularClumps.ts:84-85).
  if (sub != 0u) { return dead; }
  // slot 10: colour (irregularClumps.ts:84)
  let color = tempColorRamp(0.66 + 0.3 * genRand(seed, pop, i, 10u));
  // slot 11: size jitter (irregularClumps.ts:85)
  let size = gen.starSize * (0.9 + 0.7 * genRand(seed, pop, i, 11u));
  // slots 12-14: randomLuminosity (irregularClumps.ts:85)
  let brightness = randomLuminosity(seed, pop, i, 12u);
  var rec: StarRec;
  rec.pos = warped;
  rec.color = color;
  rec.size = size;
  rec.brightness = brightness;
  rec.alive = true;
  return rec;
}

// buildHalo — the faint extended envelope of old stars (halo.ts:30-54). Stride
// 1 (sub always 0). Radial rejection retries at +64*k like the bulge/bar; dead
// after 8 attempts (finite slot budget vs the CPU's unbounded resample). Size
// is the FIXED starSize*0.7 — no size draw (halo.ts:51).
fn buildHalo(iteration: u32) -> StarRec {
  var dead: StarRec;
  dead.alive = false;
  let seed = gen.seed;
  let pop = 5u;

  for (var k = 0u; k < 8u; k = k + 1u) {
    let base = 64u * k;
    // slot 0: heavy-tailed radial draw (halo.ts:31)
    let u = genRand(seed, pop, iteration, base + 0u);
    let dist = gen.outerRadius * 0.3 * pow(-log(1.0 - u * 0.998), 1.35);
    if (dist > gen.outerRadius * 2.4) { continue; } // halo.ts:32-35 resample
    // slot 1: cosLat (halo.ts:36)
    let cosLat = 2.0 * genRand(seed, pop, iteration, base + 1u) - 1.0;
    let sinLat = sqrt(1.0 - cosLat * cosLat);
    // slot 2: lon (halo.ts:38)
    let lon = 2.0 * PI * genRand(seed, pop, iteration, base + 2u);
    let x = dist * sinLat * cos(lon);         // halo.ts:39
    let z = dist * sinLat * sin(lon);         // halo.ts:40
    let y = dist * cosLat * gen.flattening;   // halo.ts:41
    let haloFalloff = exp(-dist / (gen.outerRadius * (0.85 - 0.45 * gen.bulgeConcentration))); // halo.ts:42
    // slot 3: colour jitter (halo.ts:43)
    let color = tempColorRamp(0.3 + 0.12 * genRand(seed, pop, iteration, base + 3u));
    // slots 4-6: randomLuminosity (halo.ts:52)
    let brightness = randomLuminosity(seed, pop, iteration, base + 4u) * 0.5 * haloFalloff;

    var rec: StarRec;
    rec.pos = vec3<f32>(x, y + warpOffset(x, z), z); // addStar warp — ctx.ts:120
    rec.color = color;
    rec.size = gen.starSize * 0.7; // FIXED (halo.ts:51)
    rec.brightness = brightness;
    rec.alive = true;
    return rec;
  }
  return dead;
}

// buildGlobularStar — one star of one globular cluster (globularClusters.ts:20-59).
// Two disjoint hash ID spaces keep cluster-level and member-level draws from
// colliding: the cluster's centre/richness/radius/hue are drawn in pop 6 keyed
// on the cluster index 'c' (pop 6 owns no output slots — populationIds.ts:13),
// and the member's own position/colour/size/brightness in pop 7 keyed on the
// flat member index. Every member thread of a cluster recomputes that cluster's
// pop-6 draws identically. iteration = c*90 + j (carveStarLayout.ts:29,
// STARS_PER_CLUSTER = 90).
fn buildGlobularStar(iteration: u32) -> StarRec {
  let seed = gen.seed;
  let c = iteration / 90u;
  let j = iteration % 90u;

  // --- Cluster-level, pop 6, idx = c (globularClusters.ts:28-41) ---
  let cpop = 6u;
  let dist = gen.outerRadius * (0.35 + 1.0 * pow(genRand(seed, cpop, c, 0u), 0.5)); // slot 0 — :28
  let cosLat = 2.0 * genRand(seed, cpop, c, 1u) - 1.0; // slot 1 — :29
  let sinLat = sqrt(1.0 - cosLat * cosLat);
  let lon = 2.0 * PI * genRand(seed, cpop, c, 2u); // slot 2 — :31
  let centerX = dist * sinLat * cos(lon); // :32
  let centerZ = dist * sinLat * sin(lon); // :33
  let centerY = dist * cosLat * 0.85;     // :34
  // slots 3-4: richness = 0.3 + 0.9 * rand() * rand() (two draws — :38)
  let richness = 0.3 + 0.9 * genRand(seed, cpop, c, 3u) * genRand(seed, cpop, c, 4u);
  // slot 5: cluster radius (:39-40)
  let clusterRadius = gen.outerRadius * (0.003 + 0.01 * pow(genRand(seed, cpop, c, 5u), 1.8)) * gen.globularSize * (0.7 + 0.6 * richness);
  let clusterHue = 0.26 + 0.2 * genRand(seed, cpop, c, 6u); // slot 6 — :41

  // --- Member-level, pop 7, idx = c*90 + j == iteration (globularClusters.ts:44-58) ---
  let mpop = 7u;
  let midx = iteration;
  let d = clusterRadius * pow(genRand(seed, mpop, midx, 0u), 0.7); // slot 0 — :44 (concentrated core)
  let cl = 2.0 * genRand(seed, mpop, midx, 1u) - 1.0; // slot 1 — :45
  let sl = sqrt(1.0 - cl * cl);
  let ln = 2.0 * PI * genRand(seed, mpop, midx, 2u); // slot 2 — :47
  // slot 3: hue jitter (:48)
  let color = tempColorRamp(clusterHue + (genRand(seed, mpop, midx, 3u) - 0.5) * 0.16);
  let size = gen.starSize * (0.5 + 0.22 * genRand(seed, mpop, midx, 4u)); // slot 4 — :56
  let brightness = (0.18 + 0.32 * genRand(seed, mpop, midx, 5u)) * gen.globularBright * richness; // slot 5 — :57

  let px = centerX + d * sl * cos(ln); // :50
  let py = centerY + d * cl;           // :51
  let pz = centerZ + d * sl * sin(ln); // :52
  var rec: StarRec;
  rec.pos = vec3<f32>(px, py + warpOffset(px, pz), pz); // addStar warp — ctx.ts:120
  rec.color = color;
  rec.size = size;
  rec.brightness = brightness;
  rec.alive = true;
  return rec;
}
