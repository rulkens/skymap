// mcpm/splatTransform.wesl — Polyphorm's cs_particles_transform: every particle projected
// to a pixel and counted into an atomic u32 screen buffer, data points 10000x, agents 10x.
// WebGPU has no atomic storage texture, so the fork's InterlockedAdd on a RWTexture2D<uint>
// becomes atomicAdd into a row-major buffer (y*width + x) — an exact behavioural match, and
// the conclusion the fork's own WGSL draft reached.
//
// DIVERGENCES: agents already live in voxel space here, so the fork's mold-space normalise,
// its y/z flip and its trim box all go, exactly as fragment.wesl drops them; and its
// galaxy_weight gate (which suppresses data-point splats entirely below 0.001) has no knob
// in this tool, so data points always splat.

import package::mcpm::camera::McpmCamera;
import package::mcpm::camera::voxelToNdc;
import package::mcpm::io::sim;
import package::mcpm::io::agentX;
import package::mcpm::io::agentY;
import package::mcpm::io::agentZ;
import package::mcpm::io::agentTheta;

// group(0)/(1) are io.wesl's contract; group(2) is this pass's, as tracePass does.
@group(2) @binding(0) var<uniform> cam: McpmCamera;
@group(2) @binding(1) var<storage, read_write> splat: array<atomic<u32>>;

// cs_particles_transform.hlsl:99,102 — splatBlit.wesl's 'val < 10000' branch reads both back.
const DATA_POINT_WEIGHT: u32 = 10000u;
const AGENT_WEIGHT: u32 = 10u;
// The fork dispatches (10,10,10). Flat here: the index is only a bijection onto the particle
// range, and unlike propagate this pass has no dispatch-truncation quirk to preserve — a
// VIEW that silently dropped its last agents is just a wrong picture.
const SPLAT_WG_SIZE: u32 = 256u;

@compute @workgroup_size(SPLAT_WG_SIZE)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u32(sim.nDataPoints + sim.nAgents)) { return; }

  let ndc = voxelToNdc(cam, vec3<f32>(agentX[idx], agentY[idx], agentZ[idx]));
  // Replaces the near clip the fork got for free from its projection matrix.
  if (ndc.z <= 0.0) { return; }
  // cs_particles_transform.hlsl:91-92, in ndc rather than its own [0,1] frame.
  if (ndc.x < -1.0 || ndc.x > 1.0 || ndc.y < -1.0 || ndc.y > 1.0) { return; }

  // +v DOWN: the frame vertex.wesl's uv and this buffer's rows share.
  let px = vec2<f32>(
    (ndc.x * 0.5 + 0.5) * cam.screenWidth,
    (0.5 - ndc.y * 0.5) * cam.screenHeight);
  let out = vec2<u32>(px);
  // Not defensive padding: the clip test above is inclusive, so a particle on the right or
  // bottom edge lands one past the end, and WGSL CLAMPS an out-of-range buffer index onto
  // the last element rather than discarding the write as D3D11's typed-UAV store did.
  let w = u32(cam.screenWidth);
  if (out.x >= w || out.y >= u32(cam.screenHeight)) { return; }

  // Indices [0, nDataPoints) carry seedAgents' theta = -5 sentinel, tested as propagate.wesl
  // tests it. The fork's own 't < 0.0' is equivalent: an agent theta comes out of acos.
  if (agentTheta[idx] < -1.0) {
    atomicAdd(&splat[out.y * w + out.x], DATA_POINT_WEIGHT);
  } else {
    atomicAdd(&splat[out.y * w + out.x], AGENT_WEIGHT);
  }
}
