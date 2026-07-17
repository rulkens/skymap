// texturedBody/fragment.wesl — fragment stage for a textured planet or moon.
//
// Samples the body's equirectangular surface texture at the mesh uv, then
// attenuates it by the shared sun-relative Lambert term ('lib/bodyLighting.wesl'
// 'litShade') so the terminator tracks the body's real position relative to the
// Sun. The lit colour goes straight into the rgba16float foreground target.
// Before the real bitmap arrives the bound texture is a 1x1 mid-grey
// placeholder, so this same path draws a plain lit sphere rather than black or
// absent (see 'texturedBodyRenderer.ts' header).
//
// ## Renormalize the interpolated normal
//
// 'normalLocal' arrives interpolated across the triangle face. Linear
// interpolation of two unit vectors yields a SHORTER vector between them, so a
// raw dot with the sun direction would under-report the Lambert term mid-face
// and band the terminator. 'normalize' restores unit length before the dot --
// the standard per-fragment normal fix for smooth-shaded spheres.
//
// ## Ring-on-planet shadow (Task 8 hook)
//
// A ringed body ('u.ringOuterRatio > 0') casts its ring's shadow onto the
// sphere; that attenuation is added in Task 8, sampling the ring-alpha strip at
// binding 3. This task ships the clean no-op: 'ringOuterRatio == 0' means 'no
// ring', so the ring strip is never sampled and the lit texture is emitted
// unchanged. Binding 3 still holds a real (1x1 transparent) texture on every
// body so ONE pipeline serves ringed and ringless bodies alike -- the
// always-bind-a-real-texture, branch-on-data trick.
//
// ## Blend target
//
// Output @location(0) writes to the rgba16float foreground colour target. The
// foreground composite uses straight-alpha OVER blending, so we emit STRAIGHT
// colour with alpha=1 for fully opaque fragments. The body texture is
// 'rgba8unorm-srgb', so the hardware linearises the sample on read -- the value
// is already linear, correct for the HDR target.

import package::bodies::texturedBody::io::VSOut;
import package::lib::sphere::TexturedBodyUniforms;
import package::lib::bodyLighting::litShade;

@group(0) @binding(0) var<uniform> u: TexturedBodyUniforms;
@group(0) @binding(1) var bodySampler: sampler;
@group(0) @binding(2) var bodyTexture: texture_2d<f32>;
// Ring-alpha strip -- a real 1x1 transparent placeholder on every non-ringed
// body. Sampled only when the Task 8 ring-shadow term lands; declared now so the
// bind-group layout is identical across all bodies (one pipeline for all).
@group(0) @binding(3) var ringTexture: texture_2d<f32>;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let n = normalize(in.normalLocal);
  let albedo = textureSample(bodyTexture, bodySampler, in.uv).rgb;
  let shade = litShade(n, u.sunDirLocal);
  let colour = albedo * shade;
  return vec4<f32>(colour, 1.0);
}
