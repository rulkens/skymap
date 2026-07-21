// cloudShell/fragment.wesl — fragment stage for the translucent cloud shell.
//
// Samples an equirectangular cloud map at the mesh uv -- RGB is the cloud colour
// (sRGB, hardware-linearised on read), '.a' is the coverage that becomes the
// shell's alpha -- then shades it with the shared sun-relative Lambert term
// (the 'u.ambientLight' floor + direct term) so the clouds go dark on the night
// side (down to that ambient floor) and stay bright in daylight. The result is
// emitted as STRAIGHT alpha into the rgba16float foreground colour target; the
// renderer's OVER blend composites it over the opaque surface already drawn.
//
// ## Composition
//
//   c       = textureSample(cloudTexture, cloudSampler, uv) // rgb colour, a coverage
//   lambert = max(dot(normalize(normalLocal), sunDirLocal), 0)
//   lit     = ambientLight + (1 - ambientLight) * lambert * sunIrradiance  // direct scaled
//   out     = vec4(c.rgb * lit, c.a * cloudOpacity)         // straight alpha
//
// ## Why 'sunIrradiance' scales only the direct term
//
// The surface fragment ('earth/fragment.wesl') scales its DIRECT (sun-lit) term
// by 'EARTH_SURFACE_PARAMS.sunIrradiance' (~3x) and adds the ambient floor
// unscaled. Left unscaled the shell's lit output would top out at the raw Lambert
// term (peak ~1) -- so the clouds, the brightest real feature (albedo ~0.8),
// rendered DIMMER than the ~3x-brighter ground beneath them. Scaling the same
// direct portion here matches the two. The 'u.ambientLight' floor stays unscaled,
// so the night-side deck is unchanged -- exactly the surface's split.
// 'sunIrradiance' is the SAME constant, packed at byte 80 from
// 'EARTH_SURFACE_PARAMS.sunIrradiance' (single source of truth), never a second
// cloud-only irradiance.
//
// ## Why 'ambientLight' is a uniform, not the shared const
//
// The ambient floor here is 'u.ambientLight' (packed at byte 84 from
// 'EARTH_SURFACE_PARAMS.ambientLight'), the SAME Earth-scoped, user-tunable value
// the surface reads -- NOT the shared 'AMBIENT' const the flat + textured planets
// use. Reading it from the uniform keeps the deck's night side dimming in lockstep
// with the ground; it seeds from the same 0.08 the const holds, so the default is
// unchanged.
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
// row, matching 'uvSphereMesh's south-first v. HANDEDNESS reads raw (longitude on
// +Y winds east to screen-right for an outside viewer). The u ORIGIN needs a +0.5
// though: the map paints the prime meridian (geographic longitude 0) at its CENTRE
// (u=0.5), while 'uvSphereMesh' emits u=0 at the local +x prime meridian. The
// Earth SURFACE rides the Earth-only 'cubeSphereMesh', which now bakes this same
// +0.5 into its uv; the deck rides the SHARED 'uvSphereMesh' (also serving the
// distant planets), so the correction stays local to this Earth shader rather than
// shifting every planet's mesh. Without it the deck sits 180deg off the surface
// beneath it. See 'earth/fragment.wesl' for the full derivation.
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

@group(0) @binding(0) var<uniform> u: CloudShellUniforms;
@group(0) @binding(1) var cloudSampler: sampler;
@group(0) @binding(2) var cloudTexture: texture_2d<f32>;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // RGB = cloud colour (sRGB de-gammad on read), .a = coverage. The +0.5 on u is
  // the EARTH_TEXTURE_PRIME_MERIDIAN_U convention: it puts the map centre
  // (geographic longitude 0) on the local +x prime meridian, matching the surface
  // (see the '## uv / orientation' note); the shared uvSphereMesh emits u=0 there,
  // so the origin correction lives here. WESL cannot import the TS constant, so
  // this offset is re-encoded; the other two sites of the same 0.5 are
  // 'cubeSphereMesh.ts' (the TS home exporting EARTH_TEXTURE_PRIME_MERIDIAN_U) and
  // 'earth/fragment.wesl'. Grep the token to find all three.
  // No explicit fract() wrap: the sampler uses addressModeU 'repeat', so a u of
  // 0.5..1.5 wraps correctly in hardware. Wrapping in-shader with fract() instead
  // breaks the quad derivatives at the u=0.5 seam (the value jumps 1->0), which
  // forces the coarsest mip along a ~1px antimeridian line; leaving u continuous
  // keeps ddx/ddy well-behaved and lets repeat addressing do the wrap.
  let uv = vec2<f32>(in.uv.x + 0.5, in.uv.y);
  let c = textureSample(cloudTexture, cloudSampler, uv);
  // Sun-relative day/night term, decomposed so 'sunIrradiance' scales the DIRECT
  // (sun-lit) portion only -- mirroring the surface, whose direct term is scaled
  // by the same irradiance while its ambient floor is not. The 'u.ambientLight'
  // floor stays unscaled so the night-side deck never dissolves to pure black at
  // the terminator, and night-side brightness is unchanged by the irradiance
  // boost.
  let lambert = max(dot(normalize(in.normalLocal), u.sunDirLocal), 0.0);
  let lit = u.ambientLight + (1.0 - u.ambientLight) * lambert * u.sunIrradiance;
  // Straight-alpha OVER: colour shaded by the light term, coverage scaled by the
  // per-shell opacity multiplier.
  return vec4<f32>(c.rgb * lit, c.a * u.cloudOpacity);
}
