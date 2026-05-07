// quads/fragment.wesl — galaxy-thumbnail fragment stage.
//
// Samples the 2048x2048 atlas, applies a soft circular mask to fade
// the corner JPEG artefacts into the surrounding dot field, then
// gates alpha by per-fragment luminance so the dark sky in the
// SDSS / DSS cutout JPEGs bleeds transparent against the catalogue
// dot field.
//
// ## Why bindings are declared here, not in io.wesl
//
// Same WESL no-global-state argument as elsewhere. The atlas
// texture + sampler bindings are fragment-only (the vertex stage
// never samples), so they live here. The uniform binding is
// declared in vertex.wesl only — its visibility on the bind-group
// layout is VERTEX-only, matching what the WebGPU pipeline-layout
// introspection saw in the original single-file shader.

import package::quads::io::VsOut;
// Shared fragment-stage mask shapes — see 'lib/masks.wesl' for the
// rationale (three smoothstep patterns recurred across four shaders,
// naming the shapes makes the intent visible at the call site).
import package::lib::masks::circularMask;
import package::lib::masks::lumAlpha;

@group(0) @binding(1) var          atlasTex: texture_2d<f32>;
@group(0) @binding(2) var          atlasSmp: sampler;

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let rgba = textureSample(atlasTex, atlasSmp, in.atlasUv);

  // Radial mask centred on the slot middle (cornerUv = 0.5, 0.5).
  // Fades from 1.0 inside r=0.4 to 0.0 at r≥0.5 via smoothstep.
  // Why this shape?  A galaxy thumbnail is mostly bulge in the center
  // and dim sky / image-edge artefacts at the corners — the corners
  // are exactly the part we want to hide so the quad blends into the
  // surrounding dot field instead of showing a hard JPEG square.
  // 0.4 → 0.5 gives a ~10% transition band, soft enough to look like
  // a Gaussian halo rather than a clipped circle.
  let r = length(in.cornerUv - vec2<f32>(0.5, 0.5));
  let mask = circularMask(r, 0.4, 0.5);

  // ── BRIGHTNESS-DERIVED ALPHA (sky-subtraction lite) ──────────────────────
  //
  // SDSS / DSS cutout JPEGs ship with no alpha channel (rgba.a is always
  // 1.0), so they used to render their full sky background as an opaque
  // grey square against the dark dot field — the cosmetic complaint
  // logged in 'project_thumbnail_quality.md'.
  //
  // Trick: use the maximum RGB component as alpha.  A pure-black sky
  // pixel (max ≈ 0.02) becomes nearly transparent; a galaxy body
  // (max ≈ 0.4–0.9) stays opaque; saturated stars (max = 1.0) stay fully
  // bright.  'smoothstep' applies a soft threshold so the dimmest sky
  // pixels vanish entirely instead of leaving a faint grey haze:
  //   - lum ≤ 0.05 → fully transparent (sky)
  //   - lum ≥ 0.30 → fully opaque (galaxy / star)
  // This is the 'quick fix' stop-gap; the planned proper sky-subtraction
  // ('project_thumbnail_quality.md' option B) will sample corner pixels
  // and subtract a per-cutout sky level.
  let lum = max(rgba.r, max(rgba.g, rgba.b));
  let lumGate = lumAlpha(lum, 0.05, 0.30);
  // 'fadeAlpha' is the engine's per-frame fade multiplier — combines
  // distance fade (galaxies smoothly grow in as they cross the
  // apparent-size threshold) and load fade (~400 ms ramp from
  // bitmap-arrival).  Final alpha is the product of all three.
  let alpha = lumGate * mask * in.fadeAlpha;
  // Discard near-transparent fragments — pure early-out
  // optimisation.  The quad covers a full bounding box, but the
  // soft circular mask + brightness-derived 'lumAlpha' zero out the
  // corners and the dim-sky pixels.  An additive blend of
  // (rgb * ~0, ~0) on top of the HDR target would contribute
  // basically nothing visible while still costing a blend-bandwidth
  // round-trip per fragment; discarding cuts that wasted traffic
  // entirely.  (An earlier revision needed this discard to prevent
  // a depth-write punching a square footprint into the depth
  // buffer; commit 28aced5 dropped depth writes here, leaving the
  // discard as just a cheap early-out.)
  if (alpha < 0.01) { discard; }
  // Premultiplied-alpha output — required by the project's blend
  // configuration (see device.ts 'alphaMode: 'premultiplied'').
  return vec4<f32>(rgba.rgb * alpha, alpha);
}
