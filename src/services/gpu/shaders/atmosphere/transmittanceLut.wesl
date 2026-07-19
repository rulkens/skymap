// atmosphere/transmittanceLut.wesl — the transmittance LUT bake (compute).
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
// existing compute precedents ('galaxyGen', 'flow') write storage BUFFERS. The
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
import package::atmosphere::scattering::sampleMedium;
import package::atmosphere::scattering::distanceToTop;
import package::atmosphere::scattering::transmittanceLutUvToParams;

// Named dimension + step consts (spec §11: lowering a dimension / a step count
// is the only quality knob; no adaptive machinery). Must match the CPU-side
// 'TRANSMITTANCE_LUT_SIZE' the renderer allocates + dispatches against.
const TRANSMITTANCE_LUT_WIDTH: u32 = 256u;
const TRANSMITTANCE_LUT_HEIGHT: u32 = 64u;
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
    let m = sampleMedium(params, pos);
    opticalDepth = opticalDepth + m.extinction * dt;
    i = i + 1u;
  }
  return opticalDepth;
}

@compute @workgroup_size(8, 8)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= TRANSMITTANCE_LUT_WIDTH || gid.y >= TRANSMITTANCE_LUT_HEIGHT) {
    return;
  }
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5))
    / vec2<f32>(f32(TRANSMITTANCE_LUT_WIDTH), f32(TRANSMITTANCE_LUT_HEIGHT));
  let rmu = transmittanceLutUvToParams(params.planetRadiusKm, params.atmosphereTopKm, uv);
  let opticalDepth = opticalDepthToTop(rmu.x, rmu.y);
  let transmittance = exp(-opticalDepth);
  textureStore(outTex, vec2<u32>(gid.x, gid.y), vec4<f32>(transmittance, 1.0));
}
