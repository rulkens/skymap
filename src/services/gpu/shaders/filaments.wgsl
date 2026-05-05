// filaments.wgsl — instanced-quad line shader for the cosmic-web skeleton.
//
// One instance per filament SEGMENT (consecutive vertex pair within a
// strip).  The instance attributes are the segment's two endpoints +
// per-endpoint density.  The vertex stage is invoked 6 times per
// instance (two triangles forming a screen-aligned thick rectangle
// between the two endpoints).
//
// Why instanced quads instead of native line topology?  WebGPU's
// `topology: 'line-list'` always renders 1-pixel-wide lines on most
// platforms (no `setLineWidth` exists, by spec).  For visible-from-
// orbit cosmic-web filaments we want anti-aliased thick lines with a
// soft edge falloff — only the instanced-quad trick gives us that.
//
// The unit-quad geometry is shared static data:
//   indices (constant, 6 per instance):  0 1 2 1 3 2
//   per-quad-vertex attribute (4 verts):  uv = (0,0), (1,0), (0,1), (1,1)
// uv.x picks startpoint vs endpoint; uv.y picks one side of the line vs
// the other (mapped to ±half-width along the screen-space perpendicular).

struct Uniforms {
  viewProj : mat4x4<f32>,
  viewport : vec2<f32>,    // [w, h] in physical pixels
  halfWidthPx : f32,       // line half-width in pixels
  pad0 : f32,
};

@group(0) @binding(0) var<uniform> u : Uniforms;

struct PerVertex {
  @location(0) uv : vec2<f32>,           // (0..1, 0..1) — quad-corner UV
  @location(1) startPos : vec3<f32>,     // segment start in world Mpc
  @location(2) startDensity : f32,       // 0..1
  @location(3) endPos : vec3<f32>,       // segment end in world Mpc
  @location(4) endDensity : f32,         // 0..1
};

struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) uv : vec2<f32>,
  @location(1) density : f32,
};

@vertex
fn vs(in : PerVertex) -> VSOut {
  // Project both endpoints to clip space.
  let aClip = u.viewProj * vec4<f32>(in.startPos, 1.0);
  let bClip = u.viewProj * vec4<f32>(in.endPos, 1.0);

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
  let halfWidthNdc = perp * (u.halfWidthPx / (u.viewport * 0.5));

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

@fragment
fn fs(in : VSOut) -> @location(0) vec4<f32> {
  // Soft anti-aliased edge: uv.y ∈ [0, 1], peak at 0.5.
  // smoothstep(0, 0.1, x) and (1 - smoothstep(0.9, 1, x)) carve a soft
  // window around the centre.  Multiplied together they give a
  // perpendicular-distance falloff that fades to 0 at the line's edges.
  let edgeFade =
    smoothstep(0.0, 0.1, in.uv.y) * (1.0 - smoothstep(0.9, 1.0, in.uv.y));

  // Phase 1: ignore density (constant alpha + colour).  Phase 2 will
  // multiply by density for ridge-brightness modulation.
  let alpha = edgeFade * 0.6;
  let tint = vec3<f32>(0.65, 0.55, 0.95); // soft purple, matches the canonical
                                          // cosmic-web visual aesthetic.
  return vec4<f32>(tint * alpha, alpha);  // pre-multiplied alpha
}
