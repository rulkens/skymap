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

fn inGrid(voxel: vec3<i32>) -> bool {
  return all(voxel >= vec3<i32>(0)) && all(voxel < gridDims());
}

// Callers must have passed 'inGrid' first — see the header on why an unguarded index is
// a wrong voxel rather than a clamp.
fn voxelIndex(voxel: vec3<i32>) -> u32 {
  let dims = gridDims();
  return u32(voxel.z) * u32(dims.x * dims.y) + u32(voxel.y) * u32(dims.x) + u32(voxel.x);
}

fn loadDeposit(voxel: vec3<i32>) -> f32 {
  if (!inGrid(voxel)) { return 0.0; }
  return f32(deposit[voxelIndex(voxel)]);
}

// Non-atomic on purpose: neither D3D11 nor WebGPU has float atomics, and the updates
// this loses launder into MCPM's Monte Carlo noise. It stays racy forever, including
// past the quirk strip.
fn addDeposit(voxel: vec3<i32>, amount: f32) {
  if (!inGrid(voxel)) { return; }
  let flatIndex = voxelIndex(voxel);
  deposit[flatIndex] = GridElem(f32(deposit[flatIndex]) + amount);
}

fn storeDepositOut(voxel: vec3<i32>, value: f32) {
  if (!inGrid(voxel)) { return; }
  depositOut[voxelIndex(voxel)] = GridElem(value);
}

fn loadTrace(voxel: vec3<i32>) -> f32 {
  if (!inGrid(voxel)) { return 0.0; }
  return f32(trace[voxelIndex(voxel)]);
}

// Racy in the same way and for the same reason as addDeposit.
fn addTrace(voxel: vec3<i32>, amount: f32) {
  if (!inGrid(voxel)) { return; }
  let flatIndex = voxelIndex(voxel);
  trace[flatIndex] = GridElem(f32(trace[flatIndex]) + amount);
}

// Race-free: the decay pass gives one invocation to each voxel and nothing else in that
// dispatch touches it.
fn scaleTrace(voxel: vec3<i32>, factor: f32) {
  if (!inGrid(voxel)) { return; }
  let flatIndex = voxelIndex(voxel);
  trace[flatIndex] = GridElem(f32(trace[flatIndex]) * factor);
}

// Trilinear sample of the trace field at 'pos', in the same voxel space agent positions
// live in: voxel i covers [i, i+1) and so is centred at i + 0.5, which is why the
// interpolation base is floor(pos - 0.5) and not floor(pos). DIVERGENCE: the fork's trace
// sampler clamps to edge (main.cpp:578, cpplib/graphics.cpp:450-451), smearing the
// boundary voxel outward; here corners outside the grid read 0 via loadTrace instead.
fn sampleTrace(pos: vec3<f32>) -> f32 {
  let centredPos = pos - vec3<f32>(0.5);
  let baseCorner = floor(centredPos);
  let blend = centredPos - baseCorner;
  let baseVoxel = vec3<i32>(baseCorner);

  let c000 = loadTrace(baseVoxel + vec3<i32>(0, 0, 0));
  let c100 = loadTrace(baseVoxel + vec3<i32>(1, 0, 0));
  let c010 = loadTrace(baseVoxel + vec3<i32>(0, 1, 0));
  let c110 = loadTrace(baseVoxel + vec3<i32>(1, 1, 0));
  let c001 = loadTrace(baseVoxel + vec3<i32>(0, 0, 1));
  let c101 = loadTrace(baseVoxel + vec3<i32>(1, 0, 1));
  let c011 = loadTrace(baseVoxel + vec3<i32>(0, 1, 1));
  let c111 = loadTrace(baseVoxel + vec3<i32>(1, 1, 1));

  // x-lerped planes below; the two digits are (y, z), not (x, y) — contrast the corners'
  // 3-digit (x, y, z) names above.
  let x00 = mix(c000, c100, blend.x);
  let x10 = mix(c010, c110, blend.x);
  let x01 = mix(c001, c101, blend.x);
  let x11 = mix(c011, c111, blend.x);

  return mix(mix(x00, x10, blend.y), mix(x01, x11, blend.y), blend.z);
}
