// mcpm/grid.wesl — voxel addressing for the buffer port of Polyphorm's 3D grids.
//
// Polyphorm indexes its grids as textures; here every load and store goes through the
// flat index 'z*W*H + y*W + x', the order graphics.cpp:567-577 writes its .bin export
// in, so a readback compares against the published cube without a reshuffle.
//
// The bounds guards are not defensive padding. D3D11 typed-UAV loads returned 0 out of
// range and the fork restores that explicitly because Dawn/Metal clamps to the edge
// instead; in a BUFFER port an out-of-range index is worse than either, because a
// negative coordinate wraps through u32 onto a silently wrong voxel.

import package::mcpm::io::GridElem;
import package::mcpm::io::sim;
import package::mcpm::io::deposit;
import package::mcpm::io::depositOut;
import package::mcpm::io::trace;

fn gridDims() -> vec3<i32> {
  return vec3<i32>(sim.worldWidth, sim.worldHeight, sim.worldDepth);
}

fn inGrid(v: vec3<i32>) -> bool {
  return all(v >= vec3<i32>(0)) && all(v < gridDims());
}

// Callers must have passed 'inGrid' first — see the header on why an unguarded index is
// a wrong voxel rather than a clamp.
fn voxelIndex(v: vec3<i32>) -> u32 {
  let d = gridDims();
  return u32(v.z) * u32(d.x * d.y) + u32(v.y) * u32(d.x) + u32(v.x);
}

fn loadDeposit(v: vec3<i32>) -> f32 {
  if (!inGrid(v)) { return 0.0; }
  return f32(deposit[voxelIndex(v)]);
}

// Non-atomic on purpose: neither D3D11 nor WebGPU has float atomics, and the updates
// this loses launder into MCPM's Monte Carlo noise. It stays racy forever, including
// past the quirk strip.
fn addDeposit(v: vec3<i32>, amount: f32) {
  if (!inGrid(v)) { return; }
  let i = voxelIndex(v);
  deposit[i] = GridElem(f32(deposit[i]) + amount);
}

fn storeDepositOut(v: vec3<i32>, value: f32) {
  if (!inGrid(v)) { return; }
  depositOut[voxelIndex(v)] = GridElem(value);
}

fn loadTrace(v: vec3<i32>) -> f32 {
  if (!inGrid(v)) { return 0.0; }
  return f32(trace[voxelIndex(v)]);
}

// Racy in the same way and for the same reason as addDeposit.
fn addTrace(v: vec3<i32>, amount: f32) {
  if (!inGrid(v)) { return; }
  let i = voxelIndex(v);
  trace[i] = GridElem(f32(trace[i]) + amount);
}

// Race-free: the decay pass gives one invocation to each voxel and nothing else in that
// dispatch touches it.
fn scaleTrace(v: vec3<i32>, factor: f32) {
  if (!inGrid(v)) { return; }
  let i = voxelIndex(v);
  trace[i] = GridElem(f32(trace[i]) * factor);
}

// Trilinear sample of the trace field at 'p', in the same voxel space agent positions
// live in: voxel i covers [i, i+1) and so is centred at i + 0.5, which is why the
// interpolation base is floor(p - 0.5) and not floor(p). Corners outside the grid read
// 0 through loadTrace, so the field fades out at the box faces instead of smearing the
// boundary voxel outward.
fn sampleTrace(p: vec3<f32>) -> f32 {
  let g = p - vec3<f32>(0.5);
  let b = floor(g);
  let f = g - b;
  let i = vec3<i32>(b);

  let c000 = loadTrace(i + vec3<i32>(0, 0, 0));
  let c100 = loadTrace(i + vec3<i32>(1, 0, 0));
  let c010 = loadTrace(i + vec3<i32>(0, 1, 0));
  let c110 = loadTrace(i + vec3<i32>(1, 1, 0));
  let c001 = loadTrace(i + vec3<i32>(0, 0, 1));
  let c101 = loadTrace(i + vec3<i32>(1, 0, 1));
  let c011 = loadTrace(i + vec3<i32>(0, 1, 1));
  let c111 = loadTrace(i + vec3<i32>(1, 1, 1));

  let c00 = mix(c000, c100, f.x);
  let c10 = mix(c010, c110, f.x);
  let c01 = mix(c001, c101, f.x);
  let c11 = mix(c011, c111, f.x);

  return mix(mix(c00, c10, f.y), mix(c01, c11, f.y), f.z);
}
