// atmosphere/aerialPerspective/bake.wesl — the per-frame camera-local aerial
// bake. One invocation per (x, y) screen texel marches that pixel's view ray
// once and stores the running in-scatter + throughput at every slice, so the
// apply reads two texels instead of re-marching. Ray + slice arithmetic are
// LOCAL units (atmosphere top = 1); 'scatterStep' integrates in km.

import package::atmosphere::aerialPerspective::froxelSlices::froxelSliceEndKm;
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

// The volume's DIMENSIONS are not restated here — they derive from
// 'textureDimensions(outInScatter)', so the renderer's createTexture size is
// their single home (the sky-view bake's convention).
@group(0) @binding(0) var<uniform> params: ScatteringParams;
@group(0) @binding(1) var<uniform> view: SkyViewParams;
@group(0) @binding(2) var transmittanceLut: texture_2d<f32>;
@group(0) @binding(3) var multiScatterLut: texture_2d<f32>;
@group(0) @binding(4) var lutSamp: sampler;
@group(0) @binding(5) var<uniform> u: AtmosphereUniforms;
@group(0) @binding(6) var outInScatter: texture_storage_3d<rgba16float, write>;
@group(0) @binding(7) var outTransmittance: texture_storage_3d<rgba16float, write>;

const PLANET_CENTER = vec3<f32>(0.0, 0.0, 0.0);

// The only quality knob: sub-steps per slice, so one slice is four quadrature
// samples wide rather than one.
const SUB_STEPS: u32 = 4u;

@compute @workgroup_size(8, 8, 1)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(outInScatter);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  // The SAME uv the apply samples with — one texel centre, one ray, both sides.
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5)) / vec2<f32>(dims.xy);
  let dir = sceneRayDir(uv, u.invMvp, u.camPosLocal);

  let kmPerLocal = params.atmosphereTopKm;
  let originKm = u.camPosLocal * kmPerLocal;
  // Constant along the ray, so it is hoisted out of the march.
  let cosTheta = dot(dir, u.sunDirLocal);

  // Past the atmosphere top there is no medium; past a ground hit nothing is
  // ever looked up (the relief floor never sits below drawn terrain). Either
  // way the totals simply stop growing and the remaining slices repeat them.
  let top = raySphere(u.camPosLocal, dir, PLANET_CENTER, 1.0);
  var endKm = max(top.y, 0.0) * kmPerLocal;
  let ground = raySphere(u.camPosLocal, dir, PLANET_CENTER, u.bottomRadius);
  if (ground.x >= 0.0) {
    endKm = min(endKm, ground.x * kmPerLocal);
  }

  let dtKm = u.froxelSliceKm / f32(SUB_STEPS);
  var inScatter = vec3<f32>(0.0);
  var throughput = vec3<f32>(1.0);

  var i: u32 = 0u;
  loop {
    if (i >= dims.z) { break; }
    let sliceStartKm = froxelSliceEndKm(i, u.froxelSliceKm) - u.froxelSliceKm;

    var j: u32 = 0u;
    loop {
      if (j >= SUB_STEPS) { break; }
      let t0 = sliceStartKm + f32(j) * dtKm;
      // The step is CLIPPED to the end rather than skipped whole: a skip at the
      // midpoint would step the stored value by half a sub-step and draw
      // iso-distance rings across the ground.
      let t1 = min(t0 + dtKm, endKm);
      if (t1 > t0) {
        let len = t1 - t0;
        let s = scatterStep(
          params, transmittanceLut, multiScatterLut, lutSamp,
          originKm + dir * (t0 + len * 0.5), u.sunDirLocal, cosTheta, len,
          view.twilightSoftness, view.twilightIntensity,
        );
        inScatter = inScatter + throughput * s.inScatter;
        throughput = throughput * s.transmittance;
      }
      j = j + 1u;
    }

    let texel = vec3<u32>(gid.x, gid.y, i);
    textureStore(outInScatter, texel, vec4<f32>(inScatter, 1.0));
    textureStore(outTransmittance, texel, vec4<f32>(throughput, 1.0));
    i = i + 1u;
  }
}
