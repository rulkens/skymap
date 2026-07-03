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
// Task-7 seam — spiral-arm star sampling
// ---------------------------------------------------------------------------

// ArmStarSample — the shared output of the spiral-arm star/dust generator.
// The arm builder is the one population that spawns BOTH stars (arm stars,
// HII cores/newborns) and, in the full port, dust — so its per-invocation
// result is factored into this dedicated sample type both the star and dust
// entry passes read. Task 7 fills in the body (the ported spiralArms.ts
// personality/meander/clump/wave math driven off gen.armTable); this file
// declares the struct + signature so the seam's shape is fixed now. The
// placeholder returns a dead star so, if linked before Task 7, no arm star
// is emitted rather than a garbage one.
struct ArmStarSample {
  star: StarRec,
}

fn armStarSample(i: u32) -> ArmStarSample {
  _ = i;
  var dead: StarRec;
  dead.alive = false;
  return ArmStarSample(dead);
}
