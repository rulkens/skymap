// atmosphere/transmittanceLut.wesl — shader-math derivation file (exceeds
// the usual header budget on that basis): the transmittance LUT bake (compute).
//
// Writes the 256x64 view-INDEPENDENT transmittance table: each texel stores the
// rgb fraction of sunlight that survives the trip from a point (radius r,
// view-zenith cosine mu) to the top of atmosphere, i.e. 'exp(-opticalDepth)'.
// Every other stage reads it — the multi-scatter bake and the sky-view bake use
// it for the sun's attenuation to each march point, and the shell fragment uses
// a RATIO of two lookups for the view-segment opacity. It is baked ONCE at
// startup ('createAtmosphereShellRenderer', Task 5).
//
// ## Why a compute storage-texture write (and the fallback)
//
// This is the first 'texture_storage_2d<rgba16float, write>' in the repo — the
// existing compute precedents ('milkyWay/sprites', 'flow') write storage BUFFERS. The
// WGSL is legal (rgba16float is a core write-only storage format), but WebKit
// acceptance is unproven. The whole module is deliberately shaped so a
// render-to-texture fallback (a fullscreen fragment writing the same rgb) could
// replace it WITHOUT touching any consumer: consumers only ever SAMPLE the LUT,
// so how it was filled is invisible to them. See the plan's Global Constraints.
//
// ## The parametrisation
//
// 'transmittanceLutUvToParams' (scattering.wesl) is Bruneton's horizon-packing
// (r, mu) <-> uv mapping; this bake reads a texel's centre uv, recovers (r, mu),
// integrates optical depth along that ray to the top, and stores the
// transmittance. Fixed-step quadrature, 'TRANSMITTANCE_STEPS' samples — a named
// tunable, no adaptive machinery (spec's LUT quality knob).
//
// Comments single-quoted, never backticks. Literal 'package::' imports.

import package::atmosphere::scattering::ScatteringParams;
import package::atmosphere::scattering::sampleMediumIsotropic;
import package::atmosphere::scattering::distanceToTop;
import package::atmosphere::scattering::transmittanceLutUvToParams;

// Step count for the fixed-step optical-depth quadrature (spec §11: lowering a
// step count is the only quality knob; no adaptive machinery). The LUT
// DIMENSIONS are NOT restated here — they derive from 'textureDimensions(outTex)'
// at dispatch, so the renderer's createTexture size ('TRANSMITTANCE_LUT_SIZE') is
// their single home and the TS quality knob cannot silently drift from a mirror.
const TRANSMITTANCE_STEPS: f32 = 40.0;

@group(0) @binding(0) var<uniform> params: ScatteringParams;
@group(0) @binding(1) var outTex: texture_storage_2d<rgba16float, write>;

// opticalDepthToTop — integrate the total extinction (1/km) from (r, mu) to the
// top of atmosphere, returning the per-channel optical depth. The ray starts on
// the +z axis at radius r (azimuth is irrelevant by spherical symmetry) and
// marches 'TRANSMITTANCE_STEPS' equal segments to the top boundary, sampling the
// medium at each segment MIDPOINT (midpoint rule — second-order accurate, and it
// never samples exactly at the boundary where density can underflow).
fn opticalDepthToTop(r: f32, mu: f32) -> vec3<f32> {
  let dist = distanceToTop(r, mu, params.atmosphereTopKm);
  let dt = dist / TRANSMITTANCE_STEPS;
  let p0 = vec3<f32>(0.0, 0.0, r);
  let dir = vec3<f32>(sqrt(max(0.0, 1.0 - mu * mu)), 0.0, mu);

  var opticalDepth = vec3<f32>(0.0);
  var i: u32 = 0u;
  loop {
    if (f32(i) >= TRANSMITTANCE_STEPS) { break; }
    let t = (f32(i) + 0.5) * dt;
    let pos = p0 + dir * t;
    let m = sampleMediumIsotropic(params, pos);
    opticalDepth = opticalDepth + m.extinction * dt;
    i = i + 1u;
  }
  return opticalDepth;
}

@compute @workgroup_size(8, 8)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(outTex);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5)) / vec2<f32>(dims);
  let rmu = transmittanceLutUvToParams(params.planetRadiusKm, params.atmosphereTopKm, uv);
  let opticalDepth = opticalDepthToTop(rmu.x, rmu.y);
  let transmittance = exp(-opticalDepth);
  textureStore(outTex, vec2<u32>(gid.x, gid.y), vec4<f32>(transmittance, 1.0));
}
