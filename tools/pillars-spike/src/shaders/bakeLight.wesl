// bakeLight.wesl — one-time compute bake of starlight transmittance.
//
// Output texel (rgba8unorm, one texel per voxel, sqrt-encoded):
//   r  transmittance from this voxel toward light star 0
//   g  transmittance toward star 1
//   b  transmittance toward star 2
//   a  ambient sky visibility (6-direction occlusion average)
//
// ## Why bake the light
//
// Physically, in-scatter at a march sample needs the transmittance from
// each light to that sample — itself a ray-march through the density
// field. Done live that turns the O(steps) primary march into
// O(steps × lightSteps × stars): hundreds of times over budget. Baking it
// per voxel makes runtime lighting a single trilinear fetch, and because
// the nebula and its stars are static, the bake never goes stale (only a
// reseed re-runs it).
//
// This baked product is ALSO what makes the ionization rims physical: the
// UV irradiance reaching a point is starUv·T/d², and emission ∝ density ×
// irradiance peaks exactly in the thin skin where dense gas first meets
// unattenuated starlight — the glowing pillar edges in every M16 image.
// No "rim light" hack is needed; it falls out of the transport.
//
// ## Precision & encoding
//
// Only a GRAY optical depth is baked (one 8-bit channel per star);
// chromatic shadowing is recovered at runtime as pow(T, tint) = exp(-tint·τ)
// — see lib/volume.wesl. sqrt-encoding spends the 8-bit codes where the
// eye watches shadows resolve (T near 0).
//
// ## Dispatch shape
//
// The engine dispatches this in Z-SLABS (several submits with different
// zBase uniforms) rather than one giant grid: ~5.7M voxels × ~150 texture
// taps in one command buffer flirts with OS GPU-watchdog limits on weak
// machines; slab submits keep each command buffer comfortably under them.

import package::lib::volume::VOLUME_MIN;
import package::lib::volume::VOLUME_MAX;
import package::lib::volume::worldToVolumeUv;
import package::lib::volume::intersectVolumeBox;
import package::lib::volume::encodeTransmittance;
import package::lib::scene::LightStars;
import package::lib::scene::LIGHT_STAR_COUNT;

struct BakeUniforms {
  // First z-voxel of this dispatch's slab (see "Dispatch shape" above).
  zBase: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var<uniform> bake: BakeUniforms;
@group(0) @binding(1) var<uniform> stars: LightStars;
@group(0) @binding(2) var field: texture_3d<f32>;
@group(0) @binding(3) var fieldSampler: sampler;
@group(0) @binding(4) var outLight: texture_storage_3d<rgba8unorm, write>;

// Optical-depth scale for the light march: how opaque unit dust density is
// per scene unit to STARLIGHT. Higher = harder shadows, brighter rims by
// contrast. Kept slightly above the view-path extinction so shadow cores
// read fully dark before the view path saturates.
const SIGMA_LIGHT = 16.0;
const LIGHT_STEPS = 28;
const AO_STEPS = 8;
const AO_STEP_LEN = 0.10;

// March from a world point toward a star, returning exp(-τ). The march
// ends at the volume boundary or the star, whichever is nearer — density
// outside the box is zero by construction (edgeEnvelope in the density
// bake), so stopping at the wall loses nothing.
fn transmittanceToward(p: vec3<f32>, starPos: vec3<f32>) -> f32 {
  let toStar = starPos - p;
  let dist = length(toStar);
  let dir = toStar / max(dist, 1e-5);
  let tRange = intersectVolumeBox(p, dir);
  let tEnd = min(tRange.y, dist);
  if (tEnd <= 0.0) {
    return 1.0;
  }
  let stepLen = tEnd / f32(LIGHT_STEPS);
  var tau = 0.0;
  // Half-step offset centres each sample in its interval (midpoint rule) —
  // cheaper than jitter and bias-free for a smooth integrand.
  var t = stepLen * 0.5;
  for (var i = 0; i < LIGHT_STEPS; i = i + 1) {
    let uv = worldToVolumeUv(p + dir * t);
    let dust = textureSampleLevel(field, fieldSampler, uv, 0.0).r;
    tau = tau + dust * SIGMA_LIGHT * stepLen;
    t = t + stepLen;
  }
  return exp(-tau);
}

@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid_in: vec3<u32>) {
  let gid = vec3<u32>(gid_in.x, gid_in.y, gid_in.z + bake.zBase);
  let dims = textureDimensions(outLight);
  if (gid.x >= dims.x || gid.y >= dims.y || gid.z >= dims.z) {
    return;
  }
  let uv = (vec3<f32>(gid) + vec3<f32>(0.5)) / vec3<f32>(dims);
  let p = mix(VOLUME_MIN, VOLUME_MAX, uv);

  var t = vec3<f32>(0.0);
  for (var s = 0; s < LIGHT_STAR_COUNT; s = s + 1) {
    t[s] = transmittanceToward(p, stars.posPower[s].xyz);
  }

  // Ambient occlusion: short marches along the six axes, averaged. This
  // stands in for the isotropic sky/HII-region glow — voxels deep inside a
  // column get no fill light, surface voxels get about half (they see half
  // the sky), free-floating haze gets nearly all of it.
  var ao = 0.0;
  for (var d = 0; d < 6; d = d + 1) {
    var dir = vec3<f32>(0.0);
    let axis = d / 2;
    let sgn = select(-1.0, 1.0, (d & 1) == 0);
    if (axis == 0) { dir.x = sgn; } else if (axis == 1) { dir.y = sgn; } else { dir.z = sgn; }
    var tau = 0.0;
    for (var i = 0; i < AO_STEPS; i = i + 1) {
      let sampleUv = worldToVolumeUv(p + dir * (f32(i) + 0.5) * AO_STEP_LEN);
      // Out-of-box samples clamp to the edge, whose density is ~0 thanks
      // to the bake's edge envelope — effectively open sky.
      let dust = textureSampleLevel(field, fieldSampler, sampleUv, 0.0).r;
      tau = tau + dust * SIGMA_LIGHT * AO_STEP_LEN;
    }
    ao = ao + exp(-tau);
  }
  ao = ao / 6.0;

  textureStore(
    outLight,
    vec3<i32>(gid),
    vec4<f32>(
      encodeTransmittance(t.x),
      encodeTransmittance(t.y),
      encodeTransmittance(t.z),
      encodeTransmittance(ao),
    ),
  );
}
