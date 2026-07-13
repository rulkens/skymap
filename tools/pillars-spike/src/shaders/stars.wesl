// stars.wesl — HDR star billboards: the ionizing cluster (NGC 6611 in the
// real M16) plus a scatter of fainter members.
//
// ## Occlusion through the nebula (the vertex-stage micro-march)
//
// Stars can pass BEHIND the pillars as the camera orbits, and a star
// shining through a dust column at full brightness instantly breaks the
// volumetric illusion. Instead of a depth buffer (useless against a
// participating medium — occlusion here is partial and chromatic), the
// VERTEX stage runs a 16-step transmittance march from the star toward
// the camera through the baked density field and passes the optical
// depth τ to the fragment, which applies the chromatic Beer-Lambert
// pow-tint. Cost: 6 vertices × 16 taps per star per frame — trivial —
// and stars physically dim AND redden as dust slides in front of them.
//
// ## HDR intensity + bloom division of labour
//
// The billboard itself is small and hard-edged: a tight gaussian core
// plus a 4-point diffraction-spike cross (the telescope aesthetic every
// astro image carries). Its INTENSITY however is far above 1.0 — the
// bloom pyramid, not the billboard, provides the big soft halo. Splitting
// "shape" (here) from "glow" (bloom) is what keeps star size stable while
// glow scales with brightness, matching how real optics behave.

import package::lib::scene::SceneUniforms;
import package::lib::volume::worldToVolumeUv;
import package::lib::volume::intersectVolumeBox;
import package::lib::volume::EXTINCTION_TINT;

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(0) @binding(1) var field: texture_3d<f32>;
@group(0) @binding(2) var volSampler: sampler;

const OCCLUSION_STEPS = 16;
// Must match nebula.wesl's SIGMA_VIEW so a star dims at the same rate the
// dust in front of it darkens the background.
const SIGMA_VIEW = 6.5;

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) quv: vec2<f32>,
  @location(1) color: vec3<f32>,
  @location(2) intensity: f32,
  @location(3) tau: f32,
}

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) pos: vec3<f32>,
  @location(1) size: f32,
  @location(2) color: vec3<f32>,
  @location(3) intensity: f32,
) -> VsOut {
  // Two-triangle quad from the vertex index (no vertex buffer needed).
  var corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0),
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0),
  );
  let corner = corners[vi];

  // Camera-facing billboard in world space.
  let world = pos + (scene.camRight * corner.x + scene.camUp * corner.y) * size;

  // Vertex-stage occlusion march: star → camera through the volume.
  let toCam = scene.camPos - pos;
  let dist = length(toCam);
  let dir = toCam / max(dist, 1e-5);
  let tRange = intersectVolumeBox(pos, dir);
  var tau = 0.0;
  let tEnd = min(tRange.y, dist);
  if (tEnd > tRange.x) {
    let stepLen = (tEnd - tRange.x) / f32(OCCLUSION_STEPS);
    var t = tRange.x + stepLen * 0.5;
    for (var i = 0; i < OCCLUSION_STEPS; i = i + 1) {
      let uv = worldToVolumeUv(pos + dir * t);
      tau = tau + textureSampleLevel(field, volSampler, uv, 0.0).r * SIGMA_VIEW * stepLen;
      t = t + stepLen;
    }
  }

  var o: VsOut;
  o.clip = scene.viewProj * vec4<f32>(world, 1.0);
  o.quv = corner;
  o.color = color;
  o.intensity = intensity * scene.starBrightness;
  o.tau = tau;
  return o;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let r = length(in.quv);
  // Tight gaussian core; the +spike cross uses steep power falloffs along
  // each axis, faded radially so the spikes taper to points.
  let core = exp(-r * r * 18.0);
  let radial = max(1.0 - r, 0.0);
  let spikes = (pow(max(1.0 - abs(in.quv.x), 0.0), 16.0)
    + pow(max(1.0 - abs(in.quv.y), 0.0), 16.0)) * radial * radial;
  let shape = core + spikes * 0.55;

  // Chromatic occlusion: same pow-tint Beer-Lambert as the volume, so a
  // star behind a pillar edge reddens before it disappears.
  let occlusion = exp(-EXTINCTION_TINT * in.tau);

  // Whiten the core: saturated colour lives in the halo/spikes, the
  // overexposed centre clips toward white — how camera sensors render
  // bright point sources.
  let c = mix(in.color, vec3<f32>(1.0), core * 0.65);
  let rgb = c * occlusion * (shape * in.intensity);
  // Additive target (one/one): alpha is unused.
  return vec4<f32>(rgb, 0.0);
}
