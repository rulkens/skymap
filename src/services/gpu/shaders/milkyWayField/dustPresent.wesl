// milkyWayField/dustPresent.wesl — the "JWST" view mode: presents
// dustMap.wesl's screen-space column map directly, through a hot MIRI-ish
// palette, instead of using it to attenuate emission. Replaces the emission
// splat draw when render.dustView is on (createGalaxyEngine.ts), writing
// into fieldTex — the SAME target the emission splat pass writes — so the
// scene pass's existing aggregate-upsample composite folds whichever one
// ran into HDR with no new wiring.

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;

@group(0) @binding(0) var dustMapTex: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

@fragment
fn fs(input: FullscreenOut) -> @location(0) vec4<f32> {
  // dustMapTex is full canvas resolution; this pass's own target (fieldTex)
  // runs at a coarser divisor (FieldSection's field-target-divisor slider),
  // so the covering triangle's UV — not this fragment's own pixel position —
  // is what locates the matching dustMap texel. textureLoad (not a sampler)
  // keeps this a point sample: the map's high-frequency detail is the whole
  // reason it exists, and a bilinear blur here would soften it one pass
  // before the viewer ever sees it.
  let dims = vec2<f32>(textureDimensions(dustMapTex));
  let coord = vec2<i32>(input.uv * dims);
  let tau = textureLoad(dustMapTex, coord, 0).r;

  // Presentation palette, NOT physics: intensity saturates smoothly with
  // column depth, then ramps black -> deep red -> orange -> white. Tuned by
  // eye for a JWST/MIRI dust-map look; none of these four colours or the
  // 1.5 rate is a measured quantity.
  let i = 1.0 - exp(-tau * 1.5);
  let black = vec3<f32>(0.0, 0.0, 0.0);
  let deepRed = vec3<f32>(0.55, 0.08, 0.02);
  let orange = vec3<f32>(1.0, 0.45, 0.1);
  let white = vec3<f32>(1.0, 1.0, 1.0);
  let warm = mix(mix(black, deepRed, smoothstep(0.0, 0.5, i)), orange, smoothstep(0.5, 0.8, i));
  let color = mix(warm, white, smoothstep(0.8, 1.0, i));

  // Alpha 0, matching splat.wesl's fs: fieldTex's alpha channel feeds
  // nothing downstream (the additive upsample folds RGB into HDR and the
  // compositor forces alpha 1.0).
  return vec4<f32>(color, 0.0);
}
