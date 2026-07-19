// atmosphere/skyViewLut.wesl — the sky-view LUT bake (compute, PER FRAME).
//
// Writes the ~192x108 view-DEPENDENT table: each texel stores the in-scattered
// sky radiance looking in a (view-zenith, azimuth-relative-to-sun) direction
// from the camera's CURRENT altitude. Unlike the transmittance + multi-scatter
// LUTs (baked once at startup), this one is regenerated every frame — the
// camera altitude and the sun direction change, and folding them into a small
// 2D table means the shell fragment does a single texture sample instead of a
// per-pixel march (spec §11 performance). Dispatched by 'encodeSkyView' before
// the foreground render pass (Task 5/6), modeled on 'encodeFlowCompute'.
//
// It reads both startup LUTs: the transmittance LUT for the sun's attenuation to
// each march point, and the multi-scatter LUT for the isotropic higher-order
// contribution added at each step. This is the ONE stage that composes single
// scattering (with the real Rayleigh + Mie phases) and the precomputed
// multi-scatter into the final sky radiance the fragment displays.
//
// ## The per-texel work
//
// 'skyViewLutUvToParams' (scattering.wesl) inverts Hillaire's horizon-split
// warp to recover (viewZenithCos, lightViewCos) for the texel. From those, plus
// the camera altitude + sun zenith carried in 'SkyViewParams', we rebuild the
// view ray and the sun direction in a local frame whose up axis is +z, then
// march the single-plus-multi-scatter integral to the atmosphere (or ground)
// boundary. Fixed-step quadrature, 'SKY_VIEW_STEPS' samples (named tunable).
//
// rgba16float storage write — same first-in-repo caveat + render-to-texture
// fallback as the other two bakes (consumers only SAMPLE this LUT).
//
// Comments single-quoted, never backticks. Literal 'package::' imports.

import package::atmosphere::scattering::ScatteringParams;
import package::atmosphere::scattering::sampleMedium;
import package::atmosphere::scattering::marchDistance;
import package::atmosphere::scattering::rayleighPhase;
import package::atmosphere::scattering::miePhase;
import package::atmosphere::scattering::sampleTransmittanceToTop;
import package::atmosphere::scattering::sampleMultiScatter;
import package::atmosphere::scattering::skyViewLutUvToParams;
import package::atmosphere::scattering::EXTINCTION_EPS;

const SKY_VIEW_LUT_WIDTH: u32 = 192u;
const SKY_VIEW_LUT_HEIGHT: u32 = 108u;
const SKY_VIEW_STEPS: f32 = 30.0;

// ── SkyViewParams — the per-frame camera + sun state (16 bytes) ──────
//
// The camera's altitude (as a RADIUS in km, so the LUT parametrisations agree
// with the km-baked transmittance/multi-scatter tables) and the cosine of the
// sun's zenith angle at the camera. Packed inline by the renderer each frame
// ('encodeSkyView'), a small enough struct that no exported packer/test earns
// its keep (verified visually).
//
//   offset 0..3 : viewHeightKm  (f32 — camera radius from planet centre, km)
//   offset 4..7 : sunZenithCos  (f32 — cos angle between local up and the sun)
//   offset 8..15: _pad0, _pad1  (f32 x2 — rounds to 16)
struct SkyViewParams {
  viewHeightKm: f32,
  sunZenithCos: f32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> params: ScatteringParams;
@group(0) @binding(1) var<uniform> view: SkyViewParams;
@group(0) @binding(2) var transmittanceLut: texture_2d<f32>;
@group(0) @binding(3) var multiScatterLut: texture_2d<f32>;
@group(0) @binding(4) var lutSamp: sampler;
@group(0) @binding(5) var outTex: texture_storage_2d<rgba16float, write>;

// raymarchInScatter — the single-plus-multi-scatter integral along one view ray
// from 'p0' (at the camera radius) toward 'dir', with the sun at 'sunDir'. The
// single-scatter source is weighted by the REAL Rayleigh + Mie phases (this is a
// directional lookup, unlike the isotropic multi-scatter bake); the precomputed
// multi-scatter is added with the total scattering coefficient (it is already
// isotropic). Standard '(S - S*T)/extinction' analytic step integral.
fn raymarchInScatter(p0: vec3<f32>, dir: vec3<f32>, sunDir: vec3<f32>) -> vec3<f32> {
  let bottom = params.planetRadiusKm;
  let top = params.atmosphereTopKm;
  let tMax = marchDistance(p0, dir, bottom, top);
  let dt = tMax / SKY_VIEW_STEPS;

  let cosTheta = dot(dir, sunDir);
  let rp = rayleighPhase(cosTheta);
  let mp = miePhase(cosTheta, params.miePhaseG);

  var L = vec3<f32>(0.0);
  var throughput = vec3<f32>(1.0);

  var i: u32 = 0u;
  loop {
    if (f32(i) >= SKY_VIEW_STEPS) { break; }
    let t = (f32(i) + 0.5) * dt;
    let pos = p0 + dir * t;
    let r = length(pos);
    let up = pos / r;
    let sunCosZenith = dot(up, sunDir);

    let m = sampleMedium(params, pos);
    let sampleTransmittance = exp(-m.extinction * dt);
    let sunTransmittance = sampleTransmittanceToTop(transmittanceLut, lutSamp, bottom, top, r, sunCosZenith);
    let psiMultiScatter = sampleMultiScatter(multiScatterLut, lutSamp, bottom, top, r, sunCosZenith);

    // Phase-weighted single-scatter source + isotropic multi-scatter source.
    let scatterPhased = m.scatterR * rp + vec3<f32>(m.scatterM * mp);
    let scatterTotal = m.scatterR + vec3<f32>(m.scatterM);
    let s = sunTransmittance * scatterPhased + psiMultiScatter * scatterTotal;

    let sInt = (s - s * sampleTransmittance) / max(m.extinction, vec3<f32>(EXTINCTION_EPS));
    L = L + throughput * sInt;
    throughput = throughput * sampleTransmittance;
    i = i + 1u;
  }
  return L;
}

@compute @workgroup_size(8, 8)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= SKY_VIEW_LUT_WIDTH || gid.y >= SKY_VIEW_LUT_HEIGHT) {
    return;
  }
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5))
    / vec2<f32>(f32(SKY_VIEW_LUT_WIDTH), f32(SKY_VIEW_LUT_HEIGHT));

  let r = view.viewHeightKm;
  let angles = skyViewLutUvToParams(params.planetRadiusKm, r, uv);
  let viewZenithCos = angles.x;
  let lightViewCos = angles.y;

  // Rebuild the view ray + sun in a local frame with up = +z. The sun sits at
  // azimuth 0 (the LUT is symmetric about it — 'lightViewCos' encodes the view's
  // azimuth relative to the sun), so the view direction's off-axis component
  // splits between the sun-aligned (x) and perpendicular (y) axes by
  // 'lightViewCos'.
  let viewZenithSin = sqrt(max(0.0, 1.0 - viewZenithCos * viewZenithCos));
  let dir = vec3<f32>(
    viewZenithSin * lightViewCos,
    viewZenithSin * sqrt(max(0.0, 1.0 - lightViewCos * lightViewCos)),
    viewZenithCos,
  );
  let sunZenithSin = sqrt(max(0.0, 1.0 - view.sunZenithCos * view.sunZenithCos));
  let sunDir = vec3<f32>(sunZenithSin, 0.0, view.sunZenithCos);

  let p0 = vec3<f32>(0.0, 0.0, r);
  let inScatter = raymarchInScatter(p0, dir, sunDir);
  textureStore(outTex, vec2<u32>(gid.x, gid.y), vec4<f32>(inScatter, 1.0));
}
