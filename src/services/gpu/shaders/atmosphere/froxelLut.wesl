// atmosphere/froxelLut.wesl — the aerial-perspective bake; derivation-carrying,
// over the comment budget on that basis. Each texel (x, y, z) holds the
// in-scatter and per-channel transmittance integrated from the camera to slice
// z along the view ray of (x, y); why a volume rather than the
// direction-indexed sky-view LUT is on the 'AerialPerspectiveRenderer' type.
//
// Two frames meet here. The ray, the slice mapping and 'camPosLocal' are LOCAL
// units (atmosphere top = 1), the frame 'froxelSlices' and the shell fragment
// both work in; 'scatterStep' integrates in KM like every other bake.
// 'params.atmosphereTopKm' is the one conversion, exact because the proxy's
// model transform is a uniform scale.

import package::atmosphere::froxelSlices::froxelMaxDistance;
import package::atmosphere::froxelSlices::froxelRayDir;
import package::atmosphere::froxelSlices::froxelSliceDistance;
import package::atmosphere::scattering::ScatteringParams;
import package::atmosphere::scattering::scatterStep;
import package::atmosphere::skyViewLut::SkyViewParams;
import package::lib::sphere::AtmosphereUniforms;
import package::lib::util::raySphere;

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

@compute @workgroup_size(8, 8)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(outInScatter);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }

  // The SAME uv the apply samples with, which is what registers the two halves
  // per texel: one texel centre, one ray, both sides.
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5)) / vec2<f32>(dims.xy);
  let dir = froxelRayDir(u.invMvp, u.camPosLocal, uv);
  let maxDistance = froxelMaxDistance(length(u.camPosLocal), u.bottomRadius);
  let sliceCount = f32(dims.z);

  let kmPerLocal = params.atmosphereTopKm;
  let camKm = u.camPosLocal * kmPerLocal;
  // Constant along the ray, so it is hoisted out of the slice loop.
  let cosTheta = dot(dir, u.sunDirLocal);

  // Ground hit in LOCAL units, same frame as near/far/maxDistance. ground.x < 0
  // covers both a miss and a camera already under bottomRadius (terrain
  // relief) — either way there is no clamp.
  let ground = raySphere(u.camPosLocal, dir, vec3<f32>(0.0), u.bottomRadius);
  let tGround = select(maxDistance, ground.x, ground.x > 0.0);

  // Slice 0 is the identity, written rather than left to the loop: the apply
  // trilinearly interpolates, and at the metre-to-kilometre ranges a rover is
  // framed at every lookup lands between slice 0 and slice 1. A slice 0 holding
  // an already-accumulated slab would fog the near field at every distance.
  let texel = vec3<u32>(gid.x, gid.y, 0u);
  textureStore(outInScatter, texel, vec4<f32>(0.0, 0.0, 0.0, 1.0));
  textureStore(outTransmittance, texel, vec4<f32>(1.0, 1.0, 1.0, 1.0));

  var inScatter = vec3<f32>(0.0);
  var throughput = vec3<f32>(1.0);
  var near = 0.0;

  var i: u32 = 1u;
  loop {
    if (i >= dims.z) { break; }
    let far = froxelSliceDistance(f32(i), sliceCount, maxDistance);
    // The ground is opaque: each slab integrates only to the ground hit, the
    // sky-view bake's own clamp (raymarchInScatter) applied per slab rather
    // than once per ray. A whole-slab skip at the midpoint instead would step
    // the stored value by half a slab and draw iso-distance rings on the ground.
    let end = min(far, tGround);
    if (near < end) {
      let posKm = camKm + dir * ((near + end) * 0.5 * kmPerLocal);
      let s = scatterStep(
        params, transmittanceLut, multiScatterLut, lutSamp,
        posKm, u.sunDirLocal, cosTheta, (end - near) * kmPerLocal,
        view.twilightSoftness, view.twilightIntensity,
      );
      inScatter = inScatter + throughput * s.inScatter;
      throughput = throughput * s.transmittance;
    }
    let slice = vec3<u32>(gid.x, gid.y, i);
    textureStore(outInScatter, slice, vec4<f32>(inScatter, 1.0));
    textureStore(outTransmittance, slice, vec4<f32>(throughput, 1.0));
    near = far;
    i = i + 1u;
  }
}
