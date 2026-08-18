// mcpm/volpath.wesl — Polyphorm's cs_volpath: a volumetric path tracer over the trace
// grid. Woodcock (delta) tracking to the next collision, Henyey-Greenstein phase,
// Russian roulette, summed into a vec4 accumulator whose '.a' is the sample count.
//
// DIVERGENCES: voxel space and the shared McpmCamera replace the fork's look-at-origin
// rig and its mold-space axis flips, exactly as fragment.wesl drops them; no deposit grid
// is bound, so the halo emission term goes with it; the accumulator SUMS and the blit
// divides, so a reset is a buffer clear with no iteration counter to desync; and the
// tracking loop is step-capped, since an unbounded loop costs the device, not a frame.

import package::mcpm::camera::McpmCamera;
import package::mcpm::io::GridElem;
import package::mcpm::rng::Rng;
import package::mcpm::rng::wangHash;
import package::mcpm::rng::rngSetSeed;
import package::mcpm::rng::rngNextFloat;

struct VolpathParams {
  gridWidth: i32,
  gridHeight: i32,
  gridDepth: i32,
  // Extinction. The fork carries sigma_s and sigma_a and derives the albedo from them;
  // here the albedo is the knob and the split is sigmaS = albedo * sigmaT.
  sigmaT: f32,
  albedo: f32,
  sigmaE: f32,
  anisotropy: f32,
  // Density floor added everywhere inside the box, so the void still scatters.
  ambientTrace: f32,
  // Majorant: the tracking is unbiased only while traceToRho(traceMax) >= every rho.
  traceMax: f32,
  trimDensity: f32,
  sampleWeight: f32,
  exposure: f32,
  bounces: u32,
  // 1 = tonemap each sample BEFORE it is accumulated (the fork's LDR accumulation), and
  // the blit then passes the mean through untouched.
  compressive: u32,
};

// group(0) is per-frame, group(1) the resources that outlive a frame. The trace grid is
// bound READ-ONLY in this pass's own layout rather than through io.wesl's read_write
// group(1) contract: the kernel only reads it, and needs none of io's other slots.
@group(0) @binding(0) var<uniform> cam: McpmCamera;
@group(0) @binding(1) var<uniform> pt: VolpathParams;
@group(0) @binding(2) var<storage, read_write> accum: array<vec4<f32>>;
@group(1) @binding(0) var<storage, read> traceGrid: array<GridElem>;
@group(1) @binding(1) var palette: texture_2d<f32>;
@group(1) @binding(2) var paletteSampler: sampler;

const RAY_EPSILON: f32 = 1e-5;
const NUMERICAL_EPSILON: f32 = 1e-4;
// The fork's truncated 2pi (cs_volpath.hlsl:4), kept verbatim — it scales every sample.
const PI2: f32 = 6.283184;
// cs_volpath.hlsl:196 emission scale, and the bounce ordinal RR starts at (HLSL:436).
const EMISSION_SCALE: f32 = 0.05;
const RR_START_BOUNCE: u32 = 2u;
// Not the fork's: its do/while walks a low-majorant medium in arbitrarily many tiny
// steps, and a browser tab loses the whole device to that, not one slow frame.
const MAX_TRACK_STEPS: u32 = 512u;
const VOLPATH_WG: u32 = 8u;

fn gridDims() -> vec3<i32> {
  return vec3<i32>(pt.gridWidth, pt.gridHeight, pt.gridDepth);
}

// grid.wesl's loadTrace/sampleTrace against this pass's own read-only binding — that file
// cannot be imported here because its binding is io.wesl's read_write one, so the pair
// below must be kept in step with it by hand. Outside the grid reads 0, not the clamp.
fn loadTraceVoxel(v: vec3<i32>) -> f32 {
  let d = gridDims();
  if (any(v < vec3<i32>(0)) || any(v >= d)) { return 0.0; }
  return f32(traceGrid[u32(v.z) * u32(d.x * d.y) + u32(v.y) * u32(d.x) + u32(v.x)]);
}

fn sampleTraceAt(p: vec3<f32>) -> f32 {
  // Voxel i covers [i, i+1) and so is centred at i + 0.5, which is why the interpolation
  // base is floor(p - 0.5) and not floor(p).
  let g = p - vec3<f32>(0.5);
  let b = floor(g);
  let f = g - b;
  let i = vec3<i32>(b);

  let c000 = loadTraceVoxel(i + vec3<i32>(0, 0, 0));
  let c100 = loadTraceVoxel(i + vec3<i32>(1, 0, 0));
  let c010 = loadTraceVoxel(i + vec3<i32>(0, 1, 0));
  let c110 = loadTraceVoxel(i + vec3<i32>(1, 1, 0));
  let c001 = loadTraceVoxel(i + vec3<i32>(0, 0, 1));
  let c101 = loadTraceVoxel(i + vec3<i32>(1, 0, 1));
  let c011 = loadTraceVoxel(i + vec3<i32>(0, 1, 1));
  let c111 = loadTraceVoxel(i + vec3<i32>(1, 1, 1));

  let x00 = mix(c000, c100, f.x);
  let x10 = mix(c010, c110, f.x);
  let x01 = mix(c001, c101, f.x);
  let x11 = mix(c011, c111, f.x);

  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}

// cs_volpath.hlsl:174. Density, not raw trace: the trim subtracts, the ambient floors,
// and sampleWeight scales — the same transfer the raymarch layer feeds its palette.
fn traceToRho(traceValue: f32) -> f32 {
  return pt.sampleWeight * (max(traceValue - pt.trimDensity, 0.0) + pt.ambientTrace);
}

fn getRho(p: vec3<f32>) -> f32 {
  return traceToRho(sampleTraceAt(p));
}

fn remap(v: f32) -> f32 {
  return 1.0 - exp(-v);
}

fn tonemap(L: vec3<f32>, exposure: f32) -> vec3<f32> {
  return vec3<f32>(1.0) - exp(-exposure * L);
}

// cs_volpath.hlsl:196 with the workbench's palette LUT in place of the fork's trace .tga.
fn emittedL(rho: f32) -> vec3<f32> {
  return EMISSION_SCALE
    * textureSampleLevel(palette, paletteSampler, vec2<f32>(remap(rho), 0.5), 0.0).rgb;
}

// Ray against the grid box in voxel space; entry clamped to 0 so a camera inside the grid
// marches from its own position. Miss when '.y' <= '.x'. Same shape as fragment.wesl's.
fn intersectGrid(o: vec3<f32>, d: vec3<f32>) -> vec2<f32> {
  let invD = 1.0 / d;
  let t0 = -o * invD;
  let t1 = (vec3<f32>(gridDims()) - o) * invD;
  let lo = min(t0, t1);
  let hi = max(t0, t1);
  let entry = max(max(max(lo.x, lo.y), lo.z), 0.0);
  return vec2<f32>(entry, min(min(hi.x, hi.y), hi.z));
}

fn deltaStep(sigmaMaxInv: f32, xi: f32) -> f32 {
  return -log(max(xi, 0.001)) * sigmaMaxInv;
}

// Free-flight distance by Woodcock tracking (cs_volpath.hlsl:215-225): step by the
// majorant, accept the collision with probability rho/rhoMax. A return >= tMax means the
// ray left the box without colliding, which is also how the step cap reports itself.
fn deltaTracking(rp: vec3<f32>, rd: vec3<f32>, tMax: f32, rhoMaxInv: f32, rng: ptr<function, Rng>) -> f32 {
  let sigmaMaxInv = rhoMaxInv / pt.sigmaT;
  var t = 0.0;
  for (var i = 0u; i < MAX_TRACK_STEPS; i = i + 1u) {
    t = t + deltaStep(sigmaMaxInv, rngNextFloat(rng));
    if (t > tMax) { return t; }
    let eventRho = getRho(rp + t * rd);
    if (rngNextFloat(rng) <= eventRho * rhoMaxInv) { return t; }
  }
  return tMax + 1.0;
}

// cs_volpath.hlsl:243-248, with a guard the fork has not: its basis divides by |dir.xz|,
// which blows up for a direction straight along y. One NaN sample would poison this
// pixel's accumulator for good rather than for a frame — the sum never forgets.
fn generateBasis(dir: vec3<f32>, v1: ptr<function, vec3<f32>>, v2: ptr<function, vec3<f32>>) {
  let planar = dir.x * dir.x + dir.z * dir.z;
  if (planar < NUMERICAL_EPSILON) {
    (*v1) = vec3<f32>(1.0, 0.0, 0.0);
  } else {
    let invNorm = 1.0 / sqrt(planar);
    (*v1) = vec3<f32>(dir.z * invNorm, 0.0, -dir.x * invNorm);
  }
  (*v2) = cross(dir, (*v1));
}

// cs_volpath.hlsl:250-268. Henyey-Greenstein importance sample around 'v'.
fn sampleHG(v: vec3<f32>, g: f32, rng: ptr<function, Rng>) -> vec3<f32> {
  let xi = rngNextFloat(rng);
  var cosTheta: f32;
  if (abs(g) > 1e-3) {
    let sqrTerm = (1.0 - g * g) / (1.0 - g + 2.0 * g * xi);
    // FORK QUIRK, kept (HLSL:256): the textbook denominator is 2g, and this abs() folds a
    // negative g onto its positive twin (substitute xi -> 1-xi and the two samplers are the
    // same), so the mean cosine is |g| and back-scattering is unreachable. The host clamps
    // the knob to [0, 0.99] rather than expose a sign that does nothing; restoring it is a
    // constants.wesl quirk-registry lever, not an edit here.
    cosTheta = (1.0 + g * g - sqrTerm * sqrTerm) / (2.0 * abs(g));
  } else {
    cosTheta = 1.0 - 2.0 * xi;
  }

  let sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  let phi = PI2 * rngNextFloat(rng);
  var v1: vec3<f32>;
  var v2: vec3<f32>;
  generateBasis(v, &v1, &v2);
  return sinTheta * cos(phi) * v1 + sinTheta * sin(phi) * v2 + cosTheta * v;
}

// cs_volpath.hlsl:275-345, emission-only light transport: every collision emits through
// the palette and the walk continues, so there is no light source to sample. A ray that
// leaves the box returns what it has — the fork's sky term is 0 in its shipping build.
fn pathTrace(rpIn: vec3<f32>, rdIn: vec3<f32>, rng: ptr<function, Rng>) -> vec3<f32> {
  var rp = rpIn;
  var rd = rdIn;
  var L = vec3<f32>(0.0);
  var throughput = 1.0;
  let rhoMaxInv = 1.0 / traceToRho(pt.traceMax);

  for (var n = 0u; n < pt.bounces; n = n + 1u) {
    let span = intersectGrid(rp, rd);
    let tEvent = deltaTracking(rp, rd, span.y, rhoMaxInv, rng);
    if (tEvent >= span.y) { return L; }

    rp = rp + tEvent * rd;
    let rhoEvent = getRho(rp);
    L = L + throughput * rhoEvent * pt.sigmaE * emittedL(rhoEvent);

    // FORK QUIRK, kept (HLSL:319-323): a path that SURVIVES Russian roulette is scaled by
    // the albedo anyway, where the survival probability has already paid for it. It biases
    // deep bounces dark; unpicking it would change the published Polyphorm look.
    if (n >= RR_START_BOUNCE && rngNextFloat(rng) > pt.albedo) { return L; }
    throughput = throughput * pt.albedo;

    rd = sampleHG(rd, pt.anisotropy, rng);
  }
  return L;
}

@compute @workgroup_size(VOLPATH_WG, VOLPATH_WG, 1)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let w = u32(cam.screenWidth);
  // The dispatch rounds UP to cover partial tiles, and an out-of-range storage index is
  // CLAMPED onto a real pixel here rather than discarded — the tail band would otherwise
  // add a second sample to the last row every frame.
  if (gid.x >= w || gid.y >= u32(cam.screenHeight)) { return; }
  let pixIdx = gid.y * w + gid.x;

  // The accumulator's own sample count decorrelates the frames, so nothing outside this
  // buffer tracks the iteration: clearing it IS the reset. Exact in f32 to 2^24 samples.
  let prior = accum[pixIdx];
  let sampleIndex = u32(prior.a);
  var rng: Rng;
  // HLSL:360-361, minus its seed_idx truncation: the fork's first seed collapses onto the
  // workgroup COLUMN, which correlates the noise of every pixel sharing one.
  rngSetSeed(&rng,
    wangHash(1u + 73u * (pixIdx + 1u)),
    wangHash(1u + (gid.x + gid.y + gid.x * gid.y) * (sampleIndex + 1u)));

  // Jittered inside the pixel: the accumulator is what turns that into antialiasing.
  let ndc = vec2<f32>(
    (f32(gid.x) + rngNextFloat(&rng)) / cam.screenWidth * 2.0 - 1.0,
    1.0 - (f32(gid.y) + rngNextFloat(&rng)) / cam.screenHeight * 2.0);
  // The exact inverse of camera.wesl's voxelToNdc — a ray built any other way would walk
  // a volume the other layers draw somewhere else on screen.
  let dir = normalize(
    cam.camForward
    + cam.camRight * (ndc.x * cam.tanHalfFov * cam.aspect)
    + cam.camUp * (ndc.y * cam.tanHalfFov));

  var pathL = vec3<f32>(0.0);
  let span = intersectGrid(cam.camVoxel, dir);
  if (span.y > span.x) {
    let rp = cam.camVoxel + dir * (span.x + RAY_EPSILON);
    // HLSL:437's PI2, the phase-function normalisation the fork folds in at the end.
    pathL = pathTrace(rp, dir, &rng) * PI2;
  }

  if (pt.compressive == 1u) {
    pathL = tonemap(pathL, pt.exposure);
  }
  accum[pixIdx] = prior + vec4<f32>(pathL, 1.0);
}
