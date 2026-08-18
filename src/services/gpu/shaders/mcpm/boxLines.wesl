// mcpm/boxLines.wesl — a 12-edge wireframe of an axis-aligned box, drawn over every other
// layer to preview the PENDING grid box while its sliders drag. Vertex-pulled: 24 vertices,
// line-list, no vertex buffers — corners come from BoxUniform's min/max, already converted
// to the BUILT box's voxel space on the host (worldToVoxel), through the same shared camera
// (package::mcpm::camera) as every other layer.

import package::mcpm::camera::McpmCamera;
import package::mcpm::camera::voxelToNdc;

struct BoxUniform {
  boxMin: vec3<f32>,
  _pad0: f32,
  boxMax: vec3<f32>,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> cam: McpmCamera;
@group(1) @binding(0) var<uniform> box: BoxUniform;

const LINE_COLOR: vec3<f32> = vec3<f32>(0.7, 0.8, 0.9);
const LINE_INTENSITY: f32 = 0.35;

// Corner index bits: bit0=x, bit1=y, bit2=z (0=min, 1=max). 12 edges x 2 endpoints.
const EDGE_CORNERS: array<u32, 24> = array<u32, 24>(
  0u, 1u, 1u, 3u, 3u, 2u, 2u, 0u,
  4u, 5u, 5u, 7u, 7u, 6u, 6u, 4u,
  0u, 4u, 1u, 5u, 3u, 7u, 2u, 6u,
);

fn cornerPos(corner: u32) -> vec3<f32> {
  let x = select(box.boxMin.x, box.boxMax.x, (corner & 1u) != 0u);
  let y = select(box.boxMin.y, box.boxMax.y, (corner & 2u) != 0u);
  let z = select(box.boxMin.z, box.boxMax.z, (corner & 4u) != 0u);
  return vec3<f32>(x, y, z);
}

struct LineVsOut {
  @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> LineVsOut {
  let ndc = voxelToNdc(cam, cornerPos(EDGE_CORNERS[vi]));
  var out: LineVsOut;
  // A corner behind the eye plane has sign-flipped ndc lanes (see camera.wesl); push it
  // off-screen rather than draw a line toward whatever garbage direction that folds into.
  if (ndc.z <= 0.0) {
    out.pos = vec4<f32>(0.0, 0.0, 2.0, 1.0);
    return out;
  }
  out.pos = vec4<f32>(ndc.xy, 0.0, 1.0);
  return out;
}

@fragment
fn fs() -> @location(0) vec4<f32> {
  // Premultiplied, one/one additive — the carried alpha lane is never read downstream.
  return vec4<f32>(LINE_COLOR * LINE_INTENSITY, LINE_INTENSITY);
}
