// mcpm/boxLines.wesl — a 12-edge wireframe of an axis-aligned box, drawn over every other
// layer to preview the PENDING grid box while its sliders drag. Vertex-pulled: 24 vertices,
// line-list, no vertex buffers — corners come from BoxUniform's min/max, already converted
// to the BUILT box's voxel space on the host (worldToVoxel), through the same shared camera
// (package::mcpm::camera) as every other layer.
//
// A second vertex-pulled draw (vsGlyph/fsGlyph) renders the gizmo handle glyphs: arrow shafts
// (translate) and small crosses (resize) read from a storage buffer the host rebuilds from
// gizmoHandleGeometry every frame. Rotate rings are F1 zero-radius stubs — no geometry, no
// third entry point needed yet.

import package::mcpm::camera::McpmCamera;
import package::mcpm::camera::voxelToNdc;

struct BoxUniform {
  boxMin: vec3<f32>,
  _pad0: f32,
  boxMax: vec3<f32>,
  _pad1: f32,
};

// handleId matches encodeGizmoHandleId.ts's flat int (-1 = no hover/active handle).
struct GizmoUniform {
  hoverHandle: i32,
  activeHandle: i32,
  _pad0: f32,
  _pad1: f32,
};

struct GlyphVertex {
  position: vec3<f32>,
  handleId: i32,
};

@group(0) @binding(0) var<uniform> cam: McpmCamera;
@group(1) @binding(0) var<uniform> box: BoxUniform;
@group(1) @binding(1) var<storage, read> glyphVerts: array<GlyphVertex>;
@group(1) @binding(2) var<uniform> gizmo: GizmoUniform;

// Loud on purpose: this is a transient drag affordance, not part of the scene palette.
const LINE_COLOR: vec3<f32> = vec3<f32>(1.0, 0.55, 0.1);
const LINE_INTENSITY: f32 = 0.35;

const GLYPH_COLOR_NORMAL: vec3<f32> = vec3<f32>(1.0, 0.55, 0.1);
const GLYPH_COLOR_HOVER: vec3<f32> = vec3<f32>(1.0, 0.9, 0.2);
const GLYPH_COLOR_ACTIVE: vec3<f32> = vec3<f32>(0.2, 1.0, 0.4);
const GLYPH_INTENSITY: f32 = 0.9;

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

struct GlyphVsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) handleId: i32,
};

@vertex
fn vsGlyph(@builtin(vertex_index) vi: u32) -> GlyphVsOut {
  let v = glyphVerts[vi];
  let ndc = voxelToNdc(cam, v.position);
  var out: GlyphVsOut;
  out.handleId = v.handleId;
  if (ndc.z <= 0.0) {
    out.pos = vec4<f32>(0.0, 0.0, 2.0, 1.0);
    return out;
  }
  out.pos = vec4<f32>(ndc.xy, 0.0, 1.0);
  return out;
}

@fragment
fn fsGlyph(in: GlyphVsOut) -> @location(0) vec4<f32> {
  // Three-case select, not a per-kind branch: any handle (translate/resize/rotate) picks
  // its color purely by matching the two uniform ints — see spec §5 "Handle rendering".
  let isActive = in.handleId == gizmo.activeHandle && gizmo.activeHandle >= 0;
  let isHover = in.handleId == gizmo.hoverHandle && gizmo.hoverHandle >= 0;
  let color = select(select(GLYPH_COLOR_NORMAL, GLYPH_COLOR_HOVER, isHover), GLYPH_COLOR_ACTIVE, isActive);
  return vec4<f32>(color * GLYPH_INTENSITY, GLYPH_INTENSITY);
}
