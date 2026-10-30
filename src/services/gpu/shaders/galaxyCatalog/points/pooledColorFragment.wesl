// points/pooledColorFragment.wesl — the pooled (octree) points pipeline's visual
// fragments: the per-source fade sits in the source's @group(2) block at
// binding 3, since @group(1) holds the octree cut. 'fs' draws the leaf stream
// through 'galaxyPointColor' (points/colorBody.wesl), shared with the flat
// pipeline; 'fsBlob' draws the aggregate stream's glows.

import package::galaxyCatalog::points::io::VSOut;
import package::galaxyCatalog::points::colorBody::galaxyPointColor;
import package::lib::colorIndex::ramp;
import package::lib::fadeUniforms::FadeUniforms;
import package::lib::fadeUniforms::applyFade;
import package::lib::starPhotometry::starGlowProfile;

@group(2) @binding(3) var<uniform> fade: FadeUniforms;

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  return galaxyPointColor(in, fade.opacity);
}

// Round, in the profile K_GAUSS integrates (the vertex stage's peak divisor), so the
// glow paints exactly the light it was given. A blob is many galaxies, so its colour
// index takes the plain ramp, without a single disk's warm-core shift; a negative one
// is the provenance highlight, whose .rgb is final (colorBody.wesl).
@fragment
fn fsBlob(in: VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) { discard; }
  let ci = in.instanceTint.w;
  let rgb = in.instanceTint.rgb * select(ramp(ci), vec3<f32>(1.0), ci < 0.0);
  let alpha = applyFade(starGlowProfile(r2), fade.opacity);
  return vec4<f32>(rgb * alpha, alpha);
}
