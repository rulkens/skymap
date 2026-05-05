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
  // Per-frame uniform scale for the entire filament-pass output, [0..1].
  // Multiplied into the final pre-multiplied colour + alpha.  Lives in
  // the slot that used to be `pad0` — the byte layout is unchanged.
  // Lets the user dim the cosmic-web overlay against the bright HDR
  // catalogue when high-σ skeletons (with their longer, denser ridges)
  // saturate to flat white under the tone-mapped pass.
  intensityScale : f32,
};

@group(0) @binding(0) var<uniform> u : Uniforms;

// Per-cloud fade-in (CloudFade — see src/services/gpu/cloudFade.ts).  One
// f32 opacity, written each frame from the JS side; multiplied into the
// fragment alpha so a freshly-uploaded skeleton glides in over ~600 ms.
struct CloudUniforms {
  opacity : f32,
  _pad0 : f32,
  _pad1 : f32,
  _pad2 : f32,
};
@group(1) @binding(0) var<uniform> cloud : CloudUniforms;

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

  // ── Density-aware brightness + tint ──────────────────────────────
  //
  // The per-vertex density attribute is min-max-normalised at build
  // time (see `skeletonToFilamentCloud` in `tools/parsers/ndskl.ts`),
  // so `in.density` ∈ [0, 1] across the whole catalogue: 0 = the
  // sparsest filament vertex, 1 = the densest.  The vertex stage
  // already linearly interpolates `startDensity` ↔ `endDensity` along
  // the segment, so within a single filament the value rises smoothly
  // toward dense hub regions.
  //
  // Two simultaneous modulations:
  //
  // * `densityBoost` ramps alpha from a visible floor (0.2) at
  //   low-density tendrils to full (1.0) at the brightest spine
  //   vertices.  The `pow(d, 0.6)` gamma-correction stretches the
  //   low end of the curve — without it, a near-linear ramp would
  //   crush the dim 0.1–0.4 range to invisibility against the
  //   tone-mapped HDR background.  0.6 is empirical; the eye reads
  //   the resulting falloff as smooth.
  //
  // * `tint` blends from a base soft purple at low density toward a
  //   brighter, slightly more white-blue purple at high density.
  //   This adds a second visual axis (hue, not just brightness) so
  //   the cosmic-web spine pops without needing the alpha alone to
  //   carry the contrast.  The two endpoints have similar luminance
  //   so the tint shift reads as colour temperature, not glare.
  //
  // Disclaimer: `density` here is the DTFE field value at the vertex,
  // NOT the per-filament robustness in σ (which is what DisPerSE's
  // persistence cut threshold uses).  They're correlated — denser
  // ridges tend to be more persistent — but not identical.  See the
  // "Phase 3" note in the DisPerSE plan for the proper σ-coded
  // visualisation, which would require capturing per-filament
  // robustness in the parser, bumping the FILA binary format to v2,
  // and adding a second per-segment vertex attribute.
  let densityBoost = mix(0.2, 1.0, pow(in.density, 0.6));

  let baseTint = vec3<f32>(0.55, 0.45, 0.85); // dim, cool-purple tendrils
  let hotTint  = vec3<f32>(0.85, 0.75, 1.0);  // bright, near-white-violet spine
  let tint = mix(baseTint, hotTint, in.density);

  let alpha = edgeFade * 0.6 * densityBoost * u.intensityScale * cloud.opacity;
  return vec4<f32>(tint * alpha, alpha);  // pre-multiplied alpha
}
