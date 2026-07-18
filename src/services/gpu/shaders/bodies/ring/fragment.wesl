// ring/fragment.wesl -- fragment stage for the translucent planetary ring.
//
// Draws Saturn's rings as a two-sided translucent annulus, textured by a radial
// alpha strip and dimmed where the planet's disc occults the sun (planet-on-ring
// shadow). This is the OTHER half of the ring system: 'texturedBody/fragment.wesl'
// casts the ring's shadow onto the planet; here the planet casts its shadow onto
// the ring.
//
// ## The geometry is a ring-agnostic disc; the hole is per-draw
//
// The ring mesh is a UNIT disc (annulus with inner radius 0), so ONE geometry
// serves any ring. The uniform 'innerRatio' (ring inner / ring outer) punches
// the hole per-draw: fragments inside it are discarded, and the visible band is
// normalized to the strip's [0, 1] u. This is why 'innerRatio' rides the uniform
// rather than being baked into the geometry or a per-vertex uv.
//
// ## Planet-on-ring shadow (analytic, no shadow map)
//
// Does the planet's disc block the sun as seen from this ring point? Solve it in
// BODY-RADIUS units, where the planet is the UNIT sphere at the origin. The
// annulus point 'localPos' is authored at unit OUTER radius, so scaling by
// 1 / planetRadiusRatio (= ring outer / planet radius) rescales it into that
// frame, giving a ring point at radius > 1. Cast a ray toward the sun and test
// it against the unit sphere:
//
//   |p + t * sunDir|^2 = 1,  with sunDir a unit vector, so
//   t^2 + 2 (p.sunDir) t + (p.p - 1) = 0.
//
// Because the ring point is OUTSIDE the planet ('p.p' > 1), the two roots share a
// sign, and they are POSITIVE -- the ray meets the sphere on the way to the sun --
// exactly when the discriminant is non-negative AND 'p.sunDir < 0' (the ring
// point faces away from the sun). That single predicate IS 'the planet is between
// this point and the sun', so no explicit 't' is needed.
//
// ## Two-sided lighting
//
// A ring is a thin sheet lit on whichever face the sun strikes. The plane normal
// is the constant local +z; flipping it to face the sun ('normal * sign(sunDir.z)')
// makes 'litShade's max(dot, 0) evaluate abs(dot(normal, sunDir)) -- both faces
// lit, no dark back side. Scaling the sun direction by the shadow visibility
// (0 when occluded) then drops 'litShade's direct term to zero, leaving only its
// ambient floor -- the same 'attenuate the direct term, keep ambient' shape the
// ring-on-planet shadow uses.
//
// ## Blend target
//
// Output @location(0) writes to the rgba16float 'foreground:0' colour target with
// straight-alpha OVER blending (baked into the ring pipeline), so it emits STRAIGHT
// colour and the strip's own alpha. The strip is 'rgba8unorm-srgb', so the
// hardware linearises the colour on read -- correct for the HDR target.

import package::bodies::ring::io::VSOut;
import package::lib::sphere::RingUniforms;
import package::lib::bodyLighting::litShade;

@group(0) @binding(0) var<uniform> u: RingUniforms;
@group(0) @binding(1) var ringSampler: sampler;
// The radial alpha strip -- an N x 1 'texture_2d' (never 'texture_1d': WebKit
// rejects the 1D sampler and silently drops the whole shared-encoder frame). A
// 1x1 transparent placeholder until the strip bitmap commits.
@group(0) @binding(2) var ringTexture: texture_2d<f32>;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // Normalized radius across the annulus. The disc geometry reaches r = 0, so
  // the uniform inner ratio remaps the visible band to [0, 1] and discards the
  // hole (r below the inner edge -- over the planet) and any r past the outer
  // edge (seam-interpolation guard).
  let r = length(in.localPos.xy);
  let radialU = (r - u.innerRatio) / (1.0 - u.innerRatio);
  if (radialU < 0.0 || radialU > 1.0) {
    discard;
  }

  // Sample the radial alpha strip. 'textureSampleLevel' (not 'textureSample'):
  // this call sits after the discard in non-uniform control flow, where the
  // implicit-LOD sampler's screen-space derivatives are undefined -- level 0 is
  // both legal there and correct for the mip-less strip. v = 0.5 reads the single
  // row's centre.
  let strip = textureSampleLevel(ringTexture, ringSampler, vec2<f32>(radialU, 0.5), 0.0);

  // Planet-on-ring shadow: rescale the ring point into body-radius units (planet
  // = unit sphere) and test the sun ray against it. See the module header for the
  // ray-sphere derivation and why the occlusion predicate needs no explicit t.
  let p = vec3<f32>(in.localPos.xy / u.planetRadiusRatio, 0.0);
  let h = dot(p, u.sunDirLocal);
  let disc = h * h - (dot(p, p) - 1.0);
  let occluded = disc >= 0.0 && h < 0.0;
  let sunVis = select(1.0, 0.0, occluded);

  // Two-sided lighting: flip the ring plane normal (local +z) to face the sun so
  // 'litShade' lights whichever face the sun strikes; scaling the sun by 'sunVis'
  // drops the direct term to zero in shadow, leaving the ambient floor.
  let facing = vec3<f32>(0.0, 0.0, 1.0) * sign(u.sunDirLocal.z);
  let lit = litShade(facing, u.sunDirLocal * sunVis);

  // Straight-alpha OVER: the ring's own opacity from the strip, lit colour on top.
  return vec4<f32>(strip.rgb * lit, strip.a);
}
