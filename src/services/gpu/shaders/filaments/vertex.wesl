// filaments/vertex.wesl — instanced-quad line vertex stage.
//
// One instance per filament segment (consecutive vertex pair within a
// strip).  The instance attributes are the segment's two endpoints +
// per-endpoint density.  This vertex stage is invoked 6 times per
// instance (two triangles forming a screen-aligned thick rectangle
// between the two endpoints).
//
// The unit-quad geometry is shared static data:
//   indices (constant, 6 per instance):  0 1 2 1 3 2
//   per-quad-vertex attribute (4 verts):  uv = (0,0), (1,0), (0,1), (1,1)
// uv.x picks startpoint vs endpoint; uv.y picks one side of the line vs
// the other (mapped to ±half-width along the screen-space perpendicular).
//
// Why instanced quads instead of native line topology?  WebGPU's
// 'topology: 'line-list'' always renders 1-pixel-wide lines on most
// platforms (no 'setLineWidth' exists, by spec).  For visible-from-
// orbit cosmic-web filaments we want anti-aliased thick lines with a
// soft edge falloff — only the instanced-quad trick gives us that.
//
// ## Why bindings are declared here, not in io.wesl
//
// WESL has no global state — the @group(0) @binding(0) declaration
// below is a module-local thing that cannot be exported. We re-
// declare it here using 'Uniforms' imported from io.wesl so the
// layout matches fragment.wesl's identical declaration. The fragment
// stage additionally declares @group(1) @binding(0) for the cloud-
// fade uniform; that binding is fragment-only so it doesn't appear
// here.

import package::filaments::io::Uniforms;
import package::filaments::io::PerVertex;
import package::filaments::io::VSOut;
import package::lib::segmentQuad::expandSegmentQuad;

@group(0) @binding(0) var<uniform> u : Uniforms;

@vertex
fn vs(in : PerVertex) -> VSOut {
  // Expand this corner into a clip-space vertex via the shared
  // segment-quad helper. 'u.halfWidthPx' is already a half-width, so it
  // passes straight through.
  var out : VSOut;
  out.clip = expandSegmentQuad(u.cam, in.startPos, in.endPos, in.uv, u.halfWidthPx);
  // Pass uv.y through for the fragment falloff; lerp density between
  // start/end based on uv.x.
  out.uv = in.uv;
  out.density = mix(in.startDensity, in.endDensity, in.uv.x);
  return out;
}
