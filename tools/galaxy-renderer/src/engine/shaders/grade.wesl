// grade.wesl — the tool's OPTIONAL display-space trailer, and the one post
// shader that is deliberately NOT shared with the runtime.
//
// Everything upstream of here is the app's own chain, shader for shader:
// scene HDR -> package::bloom (bright/downsample/upsample/fold, folding the
// glow back INTO the HDR target) -> package::compositor (exposure + one tone
// curve, straight to the swap chain). That chain has no saturation, no
// vignette, and no gamma encode, so a look tuned through it transfers to the
// app unchanged.
//
// This pass exists because the tool is also a reference-gallery instrument:
// matching a piece of astrophotography sometimes wants a saturation push or a
// vignette that the app has no equivalent for. Rather than fork the shared
// compositor to carry knobs the app does not have, those grades live here, in
// a pass the engine SKIPS entirely while all three knobs sit at identity
// (saturation 1, vignette 0, gamma encode off) — which is the tool's default
// state. So the default path is byte-identical to the app's, and moving a
// grade knob is an explicit, visible departure from it.
//
// ## The gamma toggle
//
// 'gammaEncode' applies pow(c, 1/2.2) to the tone-mapped result. The runtime
// does NOT do this: it configures the swap chain with
// getPreferredCanvasFormat() (a non-sRGB 'bgra8unorm' on macOS) and writes the
// tone-mapped value with no encode, so linear light lands in the 8-bit buffer
// and the display's sRGB transfer function is never inverted. Whether that is
// correct or whether the app should encode is an open colour-management
// question, so the encode stays available here as an off-by-default A/B rather
// than being deleted.

import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut { return fullscreenVertex(vi); }

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

// x: saturation (1 = identity), y: vignette (0 = identity),
// z: gamma-encode flag (>0.5 applies pow(1/2.2)), w: unused padding.
@group(0) @binding(2) var<uniform> u: vec4<f32>;

@fragment
fn fs(i: FullscreenOut) -> @location(0) vec4<f32> {
  var c = textureSample(tex, samp, i.uv).rgb;

  // Saturation about Rec.709 luma: 0 = greyscale, 1 = untouched, >1 pushes.
  let l = dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
  c = mix(vec3<f32>(l), c, u.x);

  // Vignette: a smooth radial darkening from 35% to 85% of the half-diagonal.
  let d = distance(i.uv, vec2<f32>(0.5, 0.5));
  c = c * (1.0 - u.y * smoothstep(0.35, 0.85, d));

  if (u.z > 0.5) { c = pow(c, vec3<f32>(1.0 / 2.2)); }

  return vec4<f32>(c, 1.0);
}
