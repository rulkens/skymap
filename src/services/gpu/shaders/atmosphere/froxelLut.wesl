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
//
// Per-channel transmittance, never a grey scalar: a luminance-collapsed factor
// adds blue to the ground without removing blue from it (the cyan wash
// 'atmosphereShellRenderer's header records).

import package::atmosphere::froxelSlices::froxelMaxDistance;
import package::atmosphere::froxelSlices::froxelRayDir;
import package::atmosphere::froxelSlices::froxelSliceDistance;
import package::atmosphere::scattering::ScatteringParams;
import package::atmosphere::scattering::scatterStep;
import package::atmosphere::skyViewLut::SkyViewParams;
import package::lib::sphere::AtmosphereUniforms;

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
    let posKm = camKm + dir * ((near + far) * 0.5 * kmPerLocal);
    // The ground is opaque, so the integral must stop there rather than keep
    // growing through it: 'accumulateMedium' floors altitude at zero, which
    // would otherwise fog every remaining slice at full ground density, and the
    // apply's trilinear filter would bleed that slab back onto the last
    // above-ground slice. This is 'raymarchInScatter's own ground clamp,
    // expressed per slice. Per SAMPLE, not a latch — a ray that re-emerged
    // would resume, though no seeded body can reach that (D is far short of the
    // chord through the planet).
    if (length(posKm) >= params.planetRadiusKm) {
      let s = scatterStep(
        params, transmittanceLut, multiScatterLut, lutSamp,
        posKm, u.sunDirLocal, cosTheta, (far - near) * kmPerLocal,
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
