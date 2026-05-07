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
import package::lib::camera::worldToClip;

@group(0) @binding(0) var<uniform> u : Uniforms;

@vertex
fn vs(in : PerVertex) -> VSOut {
  // Project both endpoints to clip space via the shared helper. We
  // could call 'worldToNdc' twice and drop the perspective divide
  // separately, but we still need 'aClip.w' / 'bClip.w' below to
  // restore clip space after the pixel-space offset, so doing the
  // divide locally is cheaper than projecting twice.
  let aClip = worldToClip(u.cam, in.startPos);
  let bClip = worldToClip(u.cam, in.endPos);

  // Choose which endpoint this corner uses (uv.x = 0 → start, 1 → end).
  let endpoint = select(aClip, bClip, in.uv.x > 0.5);

  // Compute the screen-space tangent and perpendicular for THIS segment.
  // We do the math in NDC then scale to pixels — clip-space requires the
  // perspective divide first.
  let aNdc = aClip.xy / aClip.w;
  let bNdc = bClip.xy / bClip.w;
  let tangent = normalize(bNdc - aNdc);
  let perp = vec2<f32>(-tangent.y, tangent.x);

  // pixel width → NDC offset: (px / halfViewport) is the NDC-space length
  // of one pixel.  Multiplied by halfWidthPx gives the half-width in NDC.
  let halfWidthNdc = perp * (u.halfWidthPx / (u.cam.viewportPx * 0.5));

  // uv.y in [0, 1] picks +halfWidth or -halfWidth.
  let sideSign = in.uv.y * 2.0 - 1.0;
  let offsetNdc = halfWidthNdc * sideSign;

  // Apply the offset to the chosen endpoint, then re-multiply by w to
  // restore clip space (perspective-correct interpolation).
  var out : VSOut;
  out.clip = vec4<f32>(
    endpoint.xy + offsetNdc * endpoint.w,
    endpoint.zw,
  );
  // Pass uv.y through for the fragment falloff; lerp density between
  // start/end based on uv.x.
  out.uv = in.uv;
  out.density = mix(in.startDensity, in.endDensity, in.uv.x);
  return out;
}
