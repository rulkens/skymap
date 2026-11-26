// atmosphere/aerialPerspective/bake.wesl — the per-frame camera-local aerial
// bake. One invocation per (x, y) screen texel marches that pixel's view ray
// through the slices, storing the running in-scatter + throughput at each;
// past the last slice the apply reads the shell instead (task 13), so the
// volume never holds a column-dependent total.

import package::atmosphere::aerialPerspective::froxelSlices::froxelSliceStartKm;
import package::atmosphere::scattering::ScatteringParams;
import package::atmosphere::scattering::scatterStep;
import package::lib::sceneDepthRay::sceneRayDir;
import package::lib::sphere::AtmosphereUniforms;
import package::lib::util::raySphere;

// The twilight knobs ride the per-frame sky-view params buffer. Restated here
// rather than imported from 'skyViewLut.wesl': that module owns its own
// '@group(0)' declarations and importing through it would hoist a second,
// conflicting set.
struct SkyViewParams {
  viewHeightKm: f32,
  sunZenithCos: f32,
  twilightSoftness: f32,
  twilightIntensity: f32,
};

@group(0) @binding(0) var<uniform> params: ScatteringParams;
@group(0) @binding(1) var<uniform> view: SkyViewParams;
@group(0) @binding(2) var transmittanceLut: texture_2d<f32>;
@group(0) @binding(3) var multiScatterLut: texture_2d<f32>;
@group(0) @binding(4) var lutSamp: sampler;
@group(0) @binding(5) var<uniform> uniforms: AtmosphereUniforms;
@group(0) @binding(6) var outInScatter: texture_storage_3d<rgba16float, write>;
@group(0) @binding(7) var outTransmittance: texture_storage_3d<rgba16float, write>;

const PLANET_CENTER = vec3<f32>(0.0, 0.0, 0.0);

// The only quality knob: quadrature samples per slice. 2 and 1 measured within
// 1/255 of 4 on bright low poses, and the march is the phone's largest pass there.
const SUB_STEPS: u32 = 2u;

// The running totals along one ray.
struct March {
  inScatter: vec3<f32>,
  throughput: vec3<f32>,
};

// One quadrature sample over [t0Km, t1Km], run once per sub-step of a slice.
fn marchSegment(
  state: March, originKm: vec3<f32>, dir: vec3<f32>, cosTheta: f32,
  t0Km: f32, t1Km: f32,
) -> March {
  var out = state;
  if (t1Km > t0Km) {
    let len = t1Km - t0Km;
    let stepContribution = scatterStep(
      params, transmittanceLut, multiScatterLut, lutSamp,
      originKm + dir * (t0Km + len * 0.5), uniforms.sunDirLocal, cosTheta, len,
      view.twilightSoftness, view.twilightIntensity,
    );
    out.inScatter = state.inScatter + state.throughput * stepContribution.inScatter;
    out.throughput = state.throughput * stepContribution.transmittance;
  }
  return out;
}

@compute @workgroup_size(8, 8, 1)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(outInScatter);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  // The SAME uv the apply samples with — one texel centre, one ray, both sides.
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5)) / vec2<f32>(dims.xy);
  let dir = sceneRayDir(uv, uniforms.invMvp, uniforms.camPosLocal);

  // Ray + sphere arithmetic is in LOCAL units (atmosphere top = 1); every
  // distance the march carries is km, which is what 'scatterStep' integrates.
  let kmPerLocal = params.atmosphereTopKm;
  let originKm = uniforms.camPosLocal * kmPerLocal;
  // Constant along the ray, so it is hoisted out of the march.
  let cosTheta = dot(dir, uniforms.sunDirLocal);

  // Past the atmosphere top there is no medium; past a ground hit nothing is
  // ever looked up (the relief floor never sits below drawn terrain). Either
  // way the totals simply stop growing and the remaining slices repeat them.
  let top = raySphere(uniforms.camPosLocal, dir, PLANET_CENTER, 1.0);
  var endKm = max(top.y, 0.0) * kmPerLocal;
  let ground = raySphere(uniforms.camPosLocal, dir, PLANET_CENTER, uniforms.bottomRadius);
  // '> 0', never '>= 0': 'raySphere' hands back a 0 root for a camera exactly on
  // the floor, and that would clamp 'endKm' to 0 — the whole column at identity.
  if (ground.x > 0.0) {
    endKm = min(endKm, ground.x * kmPerLocal);
  }

  let dtKm = uniforms.froxelSliceKm / f32(SUB_STEPS);
  var march: March;
  march.inScatter = vec3<f32>(0.0);
  march.throughput = vec3<f32>(1.0);

  var sliceIndex: u32 = 0u;
  loop {
    if (sliceIndex >= dims.z) { break; }
    let sliceStartKm = froxelSliceStartKm(sliceIndex, uniforms.froxelSliceKm);

    var subStepIndex: u32 = 0u;
    loop {
      if (subStepIndex >= SUB_STEPS) { break; }
      let subStepStartKm = sliceStartKm + f32(subStepIndex) * dtKm;
      // The step is CLIPPED to the end rather than skipped whole: a skip at the
      // midpoint would step the stored value by half a sub-step and draw
      // iso-distance rings across the ground.
      march = marchSegment(march, originKm, dir, cosTheta, subStepStartKm, min(subStepStartKm + dtKm, endKm));
      subStepIndex = subStepIndex + 1u;
    }

    let texel = vec3<u32>(gid.x, gid.y, sliceIndex);
    textureStore(outInScatter, texel, vec4<f32>(march.inScatter, 1.0));
    textureStore(outTransmittance, texel, vec4<f32>(march.throughput, 1.0));
    sliceIndex = sliceIndex + 1u;
  }
}
