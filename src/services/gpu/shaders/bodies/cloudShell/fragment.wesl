// cloudShell/fragment.wesl — fragment stage for the translucent cloud shell.
//
// Samples an equirectangular cloud map at the mesh uv -- RGB is the cloud colour
// (sRGB, hardware-linearised on read), '.a' is the coverage that becomes the
// shell's alpha -- then dims it by the shared sun-relative Lambert term
// ('lib/bodyLighting.wesl' 'litShade') so the clouds go dark on the night side
// (down to the shared 'AMBIENT' floor) and stay bright in daylight. The result
// is emitted as STRAIGHT alpha into the rgba16float foreground colour target; the
// renderer's OVER blend composites it over the opaque surface already drawn.
//
// ## Composition
//
//   c   = textureSample(cloudTexture, cloudSampler, uv)   // rgb colour, a coverage
//   lit = litShade(normalize(normalLocal), sunDirLocal)   // day/night dimmer
//   out = vec4(c.rgb * lit, c.a * cloudOpacity)           // straight alpha
//
// 'cloudOpacity' (from 'CLOUD_SHELL_PARAMS.opacity', packed at byte 76) is a
// global coverage-to-alpha multiplier so the whole deck can be dialed to a
// convincing translucency without re-authoring the map's alpha.
//
// ## Renormalize the interpolated normal
//
// 'normalLocal' arrives interpolated across the triangle face. Linear
// interpolation of two unit vectors yields a SHORTER vector between them, so a
// raw dot with the sun direction would under-report the Lambert term mid-face and
// band the terminator. 'normalize' restores unit length before the dot -- the
// standard per-fragment normal fix for smooth-shaded spheres.
//
// ## uv / orientation
//
// The cloud map is equirectangular, same v-orientation as the surface albedo:
// the renderer uploads it flipY:true so texture v=0 is the image's bottom (south)
// row, matching 'uvSphereMesh's south-first v. u reads raw (longitude on +Y winds
// east to screen-right for an outside viewer). So no uv remap here -- see
// 'earth/fragment.wesl' for the full derivation the shell inherits.
//
// ## Blend target
//
// Output @location(0) writes to the rgba16float foreground colour target with
// STRAIGHT (non-premultiplied) colour -- the renderer's pipeline uses OVER
// blending ('src-alpha' / 'one-minus-src-alpha'), the standard translucent
// overlay. The cloud texture is 'rgba8unorm-srgb', so the sampled RGB is already
// linear, correct for the HDR target.

import package::bodies::cloudShell::io::VSOut;
import package::lib::sphere::CloudShellUniforms;
import package::lib::bodyLighting::litShade;

@group(0) @binding(0) var<uniform> u: CloudShellUniforms;
@group(0) @binding(1) var cloudSampler: sampler;
@group(0) @binding(2) var cloudTexture: texture_2d<f32>;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // RGB = cloud colour (sRGB de-gammad on read), .a = coverage.
  let c = textureSample(cloudTexture, cloudSampler, in.uv);
  // Sun-relative day/night dimmer, floored at AMBIENT so the night-side deck
  // never dissolves to pure black at the terminator.
  let lit = litShade(normalize(in.normalLocal), u.sunDirLocal);
  // Straight-alpha OVER: colour dimmed by the light term, coverage scaled by the
  // per-shell opacity multiplier.
  return vec4<f32>(c.rgb * lit, c.a * u.cloudOpacity);
}
