// asteroids/kepler/compute.wesl — every row's heliocentric position at the frame's sim time, written
// once per frame for the dot and pick stamps to read. Step for step the CPU mirror asteroidHelioAu
// (src/layers/asteroids/kepler/utils/), which follow, card and ring solve with.
//
// Time arrives as whole + fractional days since the element epoch (split in f64 on the CPU), so
// n·whole and n·frac each keep f32's 7 digits: one f32 dt would lose ~0.01 day at the window edges.
// TS twin of KeplerUniforms: asteroidKeplerSolver.ts's KEPLER_UNIFORM_BYTES.

import package::lib::kepler::solveKeplerFixed;

struct KeplerUniforms {
  dtWholeDays: f32,
  dtFracDays: f32,
  count: u32,
  _pad: u32,
};

const WORKGROUP_SIZE: u32 = 64u;

@group(0) @binding(0) var<uniform> k: KeplerUniforms;
// Per row: A = a·P̂ (AU) and e; B = a·√(1−e²)·Q̂ (AU) and n (rad/day); M₀ bitcast, then the packed word.
@group(0) @binding(1) var<storage, read> elementsA: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> elementsB: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> extra: array<vec2<u32>>;
// xyz heliocentric equatorial J2000 in AU, w = r.
@group(0) @binding(4) var<storage, read_write> helio: array<vec4<f32>>;

@compute @workgroup_size(WORKGROUP_SIZE)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  if (row >= k.count) {
    return;
  }
  let a = elementsA[row];
  let b = elementsB[row];
  let m = bitcast<f32>(extra[row].x) + b.w * k.dtWholeDays + b.w * k.dtFracDays;
  let E = solveKeplerFixed(m, a.w);
  let p = a.xyz * (cos(E) - a.w) + b.xyz * sin(E);
  helio[row] = vec4<f32>(p, length(p));
}
