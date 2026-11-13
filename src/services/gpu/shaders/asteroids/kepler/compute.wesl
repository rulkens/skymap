// asteroids/kepler/compute.wesl — once per drawn frame, every row's heliocentric position, its V and
// lifted flux, and THE cull (class faded out, hidden, under the flux floor); the rows that survive are
// appended to 'visible' and counted into the draw's indirect args, so the dot and pick draws touch only
// what shows. The position solve is step for step the CPU mirror asteroidHelioAu (kepler/utils/).
//
// Time arrives as whole + fractional days since the element epoch (split in f64 on the CPU), so
// n·whole and n·frac each keep f32's 7 digits: one f32 dt would lose ~0.01 day at the window edges.
// The format constants mirror the TS tables, and KeplerUniforms asteroidKeplerSolver.ts's
// KEPLER_UNIFORM_OFFSETS, both pinned by asteroidPoints.parity.test.ts.

import package::lib::kepler::solveKeplerFixed;
import package::asteroids::lib::apparentMagnitude::asteroidApparentMagnitude;
import package::asteroids::lib::visibleTag::visibleTag;
import package::lib::math::LOG10;

// 'sunFromCamAu' is the Sun minus the frame's eye, composed in f64 on the CPU; 'exposure' the display
// lift times the Layer's brightness; 'classFade' one lane per class, [cls >> 2][cls & 3].
// 'hLimitCenti' the faintest stored H each class keeps under the brightness budget, laid out as
// classFade. 'selectedRow' (0xFFFFFFFF = none) is exempt from it and from the flux floor 'minFlux', so
// a followed dot always draws. 'maxPhaseDimMag' caps the phase dimming, for the dot only (the card keeps the physical V).
struct KeplerUniforms {
  dtWholeDays: f32,
  dtFracDays: f32,
  count: u32,
  selectedRow: u32,
  sunFromCamAu: vec3<f32>,
  exposure: f32,
  classFade: array<vec4<f32>, 2>,
  hLimitCenti: array<vec4<f32>, 2>,
  minFlux: f32,
  maxPhaseDimMag: f32,
};

const WORKGROUP_SIZE: u32 = 64u;
// V for a row MPC gives no H: a typical faint numbered belt asteroid seen from Earth.
const NO_H_MAGNITUDE: f32 = 21.0;
const MIN_DELTA_AU: f32 = 0.001;
const CLASS_MASK: u32 = 7u;
const HIDDEN_FLAG: u32 = 128u;
const H_NONE: u32 = 65535u;
const H_OFFSET: f32 = 5.0;
const H_SCALE: f32 = 100.0;
const G_OFFSET: f32 = 0.5;
const G_SCALE: f32 = 100.0;
const LAST_CLASS: u32 = 4u;
// DrawIndirectArgs: vertexCount, instanceCount, firstVertex, firstInstance.
const INSTANCE_COUNT: u32 = 1u;

@group(0) @binding(0) var<uniform> kepler: KeplerUniforms;
// Per row: A = a·P̂ (AU) and e; B = a·√(1−e²)·Q̂ (AU) and n (rad/day); M₀ bitcast, then the packed word.
@group(0) @binding(1) var<storage, read> elementsA: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> elementsB: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> extra: array<vec2<u32>>;
// Per drawn dot: heliocentric xyz (AU, equatorial J2000) and the lifted flux; its visibleTag.
@group(0) @binding(4) var<storage, read_write> visible: array<vec4<f32>>;
@group(0) @binding(5) var<storage, read_write> visibleTags: array<u32>;
// The instance count is zeroed by the CPU's clearBuffer before this pass.
@group(0) @binding(6) var<storage, read_write> draws: array<atomic<u32>, 4>;

// One global atomic per workgroup instead of one per dot: ~14k adds on the counter, not ~900k.
var<workgroup> groupCount: atomic<u32>;
var<workgroup> groupBase: u32;

// The row's helio position and lifted flux; flux 0 for a culled row.
fn shownRow(row: u32) -> vec4<f32> {
  let packed = extra[row].y;
  let cls = min(packed & CLASS_MASK, LAST_CLASS);
  if ((packed & HIDDEN_FLAG) != 0u || kepler.classFade[cls >> 2u][cls & 3u] <= 0.0) {
    return vec4<f32>(0.0);
  }
  let hCenti = packed >> 16u;
  // Ahead of the solve, so a row the budget drops costs no Kepler iterations.
  if (f32(hCenti) > kepler.hLimitCenti[cls >> 2u][cls & 3u] && row != kepler.selectedRow) {
    return vec4<f32>(0.0);
  }
  let a = elementsA[row];
  let b = elementsB[row];
  let m = bitcast<f32>(extra[row].x) + b.w * kepler.dtWholeDays + b.w * kepler.dtFracDays;
  let E = solveKeplerFixed(m, a.w);
  let p = a.xyz * (cos(E) - a.w) + b.xyz * sin(E);
  var v = NO_H_MAGNITUDE;
  if (hCenti != H_NONE) {
    let rAu = length(p);
    let camRelAu = p + kepler.sunFromCamAu;
    let deltaAu = max(length(camRelAu), MIN_DELTA_AU);
    let hMag = f32(hCenti) / H_SCALE - H_OFFSET;
    let g = f32((packed >> 8u) & 255u) / G_SCALE - G_OFFSET;
    let cosPhase = dot(p, camRelAu) / max(rAu * deltaAu, 1e-30);
    v = asteroidApparentMagnitude(hMag, g, rAu, deltaAu, cosPhase);
    v = min(v, hMag + 5.0 * log(rAu * deltaAu) / LOG10 + kepler.maxPhaseDimMag);
  }
  let flux = pow(10.0, -0.4 * v) * kepler.exposure;
  if (flux < kepler.minFlux && row != kepler.selectedRow) {
    return vec4<f32>(0.0);
  }
  // A selected row under the floor keeps a positive flux, so the shown test below holds for it.
  return vec4<f32>(p, max(flux, 1e-30));
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_index) lid: u32,
) {
  // No early return: every invocation must reach the barriers below.
  let row = gid.x;
  var entry = vec4<f32>(0.0);
  if (row < kepler.count) {
    entry = shownRow(row);
  }
  let shown = entry.w > 0.0;
  var local = 0u;
  if (shown) {
    local = atomicAdd(&groupCount, 1u);
  }
  workgroupBarrier();
  if (lid == 0u) {
    groupBase = atomicAdd(&draws[INSTANCE_COUNT], atomicLoad(&groupCount));
  }
  let base = workgroupUniformLoad(&groupBase);
  if (shown) {
    let at = base + local;
    visible[at] = entry;
    visibleTags[at] = visibleTag(row, min(extra[row].y & CLASS_MASK, LAST_CLASS));
  }
}
