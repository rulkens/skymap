// mcpm/boxLines.wesl — a 12-edge wireframe of an axis-aligned box, drawn over every other
// layer to preview the PENDING grid box while its sliders drag. Vertex-pulled: 24 vertices,
// line-list, no vertex buffers — corners come from BoxUniform's min/max, already converted
// to the BUILT box's voxel space on the host (worldToVoxel), through the same shared camera
// (package::mcpm::camera) as every other layer.
//
// A second vertex-pulled draw (vsGlyph/fsGlyph) renders the gizmo handle glyphs: per-axis
// colored translate arrows with cone tips, and resize crosses. Each glyph is a list of
// GlyphSegments (the host rebuilds the buffer from gizmoHandleGeometry every frame); vsGlyph
// expands each into a screen-space quad (2 triangles, constant pixel width) rather than
// drawing 1px line-list hairlines. Rotate rings are F1 zero-radius stubs — no geometry yet.

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

// A screen-space quad's endpoints, world (voxel) space, plus per-endpoint pixel width — a
// tapered segment (widthA != widthB) is how an arrowhead cone-leg narrows to its apex.
// posA/widthA and posB/widthB each fill a 16-byte slot (vec3 + trailing scalar, same shape as
// BoxUniform above); handleId's slot pads out to the struct's 48-byte, 16-byte-aligned size.
// boxPreviewPass.ts's GLYPH_SEGMENT_FLOATS packs this byte-for-byte — keep the two in sync.
struct GlyphSegment {
  posA: vec3<f32>,
  widthA: f32,
  posB: vec3<f32>,
  widthB: f32,
  handleId: i32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> cam: McpmCamera;
@group(1) @binding(0) var<uniform> box: BoxUniform;
@group(1) @binding(1) var<storage, read> glyphSegs: array<GlyphSegment>;
@group(1) @binding(2) var<uniform> gizmo: GizmoUniform;

// Loud on purpose: this is a transient drag affordance, not part of the scene palette.
const LINE_COLOR: vec3<f32> = vec3<f32>(1.0, 0.55, 0.1);
const LINE_INTENSITY: f32 = 0.35;

// Blender's transform-gizmo convention, hex #E8544C / #6BBF3F / #3B83BD.
const AXIS_COLOR_X: vec3<f32> = vec3<f32>(0.910, 0.329, 0.298);
const AXIS_COLOR_Y: vec3<f32> = vec3<f32>(0.420, 0.749, 0.247);
const AXIS_COLOR_Z: vec3<f32> = vec3<f32>(0.231, 0.514, 0.741);
const GLYPH_HOVER_MIX: f32 = 0.5; // base color, mixed this far toward white
const GLYPH_ACTIVE_COLOR: vec3<f32> = vec3<f32>(0.95, 0.95, 0.95);
const GLYPH_INTENSITY: f32 = 0.9;

// vi/6 = segment index, vi%6 = corner. Two triangles split the quad along its A+/B- diagonal:
// (A-,A+,B-) then (A+,B+,B-) — endpoint picks posA/posB, side picks which perpendicular edge.
const QUAD_ENDPOINT: array<u32, 6> = array<u32, 6>(0u, 0u, 1u, 0u, 1u, 1u);
const QUAD_SIDE: array<f32, 6> = array<f32, 6>(-1.0, 1.0, -1.0, 1.0, 1.0, -1.0);

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
  // Premultiplied-over (RenderGraph's OVERLAY_BLEND): alpha 1.0 makes this opaque, so the
  // gizmo stays legible over a bright raymarch region instead of washing out additively.
  return vec4<f32>(LINE_COLOR * LINE_INTENSITY, 1.0);
}

struct GlyphVsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) handleId: i32,
};

@vertex
fn vsGlyph(@builtin(vertex_index) vi: u32) -> GlyphVsOut {
  let seg = glyphSegs[vi / 6u];
  let corner = vi % 6u;
  var out: GlyphVsOut;
  out.handleId = seg.handleId;

  let ndcA = voxelToNdc(cam, seg.posA);
  let ndcB = voxelToNdc(cam, seg.posB);
  // Either endpoint behind the eye plane folds its ndc signs (camera.wesl) and would drag the
  // whole quad's direction/width toward garbage — push the entire segment off-screen, same
  // dodge as vs() but decided once per segment rather than per vertex.
  if (ndcA.z <= 0.0 || ndcB.z <= 0.0) {
    out.pos = vec4<f32>(0.0, 0.0, 2.0, 1.0);
    return out;
  }

  // voxelToNdc already performed the perspective divide (camera.wesl), so out.pos.w is always
  // 1 below and there is no further hardware divide left to compensate for — offsetting this
  // already-divided NDC by a pixel-derived amount IS the constant-pixel-width expansion here;
  // the usual "scale the clip-space offset by w" trick would be a no-op on this camera.
  let viewportPx = vec2<f32>(cam.screenWidth, cam.screenHeight);
  let dirPx = (ndcB.xy - ndcA.xy) * viewportPx * 0.5;
  let dirLen = length(dirPx);
  let perpPx = select(vec2<f32>(1.0, 0.0), vec2<f32>(-dirPx.y, dirPx.x) / dirLen, dirLen >= 1e-6);

  let endpoint = QUAD_ENDPOINT[corner];
  let side = QUAD_SIDE[corner];
  let ndc = select(ndcA, ndcB, endpoint == 1u);
  let widthPx = select(seg.widthA, seg.widthB, endpoint == 1u);
  let offsetNdc = perpPx * side * widthPx * (1.0 / viewportPx);

  out.pos = vec4<f32>(ndc.xy + offsetNdc, 0.0, 1.0);
  return out;
}

@fragment
fn fsGlyph(in: GlyphVsOut) -> @location(0) vec4<f32> {
  // handleId is encodeGizmoHandleId.ts's kind*100 + axis*10 + sign — axis is the tens digit.
  let axis = (in.handleId / 10) % 10;
  let base = select(select(AXIS_COLOR_X, AXIS_COLOR_Y, axis == 1), AXIS_COLOR_Z, axis == 2);

  // Two-case select, not a per-kind branch: any handle (translate/resize/rotate) highlights
  // purely by matching the two uniform ints — see spec §5 "Handle rendering".
  let isActive = in.handleId == gizmo.activeHandle && gizmo.activeHandle >= 0;
  let isHover = in.handleId == gizmo.hoverHandle && gizmo.hoverHandle >= 0;
  let hovered = mix(base, vec3<f32>(1.0), GLYPH_HOVER_MIX);
  let color = select(select(base, hovered, isHover), GLYPH_ACTIVE_COLOR, isActive);
  // Alpha 1.0, same premultiplied-over reasoning as fs() above.
  return vec4<f32>(color * GLYPH_INTENSITY, 1.0);
}
