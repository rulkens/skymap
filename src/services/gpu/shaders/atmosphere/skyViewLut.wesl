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
// march the single-plus-multi-scatter integral across the IN-ATMOSPHERE segment
// of the ray. Fixed-step quadrature, 'SKY_VIEW_STEPS' samples (named tunable).
//
// ## From-space entry clamp (why we march [tNear, tFar], not [0, tMax])
//
// skymap's camera views Earth from SPACE, so the ray origin's radius is far
// outside the atmosphere top. Marching t in [0, tMax] (tMax = the far exit) would
// spend nearly every one of the ~30 fixed steps in the tens of thousands of km of
// VACUUM between the camera and the planet, with dt hundreds-to-thousands of km
// wide; the ~1,400 km of dense atmosphere near the ray's tangent point would catch
// zero or one sample and the LUT would bake to near-zero noise (the shell then
// renders almost nothing). Instead we clamp to the ray's atmosphere-top ENTRY:
// tNear = max(0, top.x) is the near intersection of the top sphere (0 for a camera
// already inside it), tFar the far exit or the ground hit, and we spread all
// samples across [tNear, tFar]. This is Hillaire's 'MoveToTopAtmosphere' clamp. For
// a camera INSIDE the atmosphere top.x < 0 -> tNear = 0, so the from-below case is
// byte-identical to the old bound; only the from-space case changes.
//
// rgba16float storage write — same first-in-repo caveat + render-to-texture
// fallback as the other two bakes (consumers only SAMPLE this LUT).
//
// Comments single-quoted, never backticks. Literal 'package::' imports.

import package::atmosphere::scattering::ScatteringParams;
import package::atmosphere::scattering::sampleMedium;
import package::atmosphere::scattering::sampleTransmittanceToTop;
import package::atmosphere::scattering::sampleMultiScatter;
import package::atmosphere::scattering::skyViewLutUvToParams;
import package::atmosphere::scattering::EXTINCTION_EPS;
import package::lib::util::raySphere;

// Step count for the fixed-step in-scatter quadrature (the only quality knob).
// The LUT DIMENSIONS are NOT restated here — they derive from
// 'textureDimensions(outTex)' at dispatch, so the renderer's createTexture size
// ('SKY_VIEW_LUT_SIZE') is their single home and cannot drift from a mirror.
const SKY_VIEW_STEPS: f32 = 30.0;

// ── SkyViewParams — the per-frame camera + sun state (16 bytes) ──────
//
// The camera's altitude (as a RADIUS in km, so the LUT parametrisations agree
// with the km-baked transmittance/multi-scatter tables), the cosine of the
// sun's zenith angle at the camera, the night-limb twilight-fade width, and the
// twilight-band brightness gain. Packed inline by the renderer each frame
// ('encodeSkyView'), a small enough struct that no exported packer/test earns
// its keep (verified visually).
//
// 'twilightSoftness' + 'twilightIntensity' ride HERE, not on the
// construction-written 'ScatteringParams' buffer, so Earth's Settings sliders
// can tune them live: this buffer is repacked every frame from the current
// settings values.
//
//   offset 0..3 : viewHeightKm      (f32 — camera radius from planet centre, km)
//   offset 4..7 : sunZenithCos      (f32 — cos angle between local up and the sun)
//   offset 8..11: twilightSoftness  (f32 — night-limb sun-fade width in mu)
//   offset 12..15: twilightIntensity (f32 — brightness gain on the twilight band)
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
@group(0) @binding(5) var outTex: texture_storage_2d<rgba16float, write>;

// raymarchInScatter — the single-plus-multi-scatter integral along one view ray
// from 'p0' (at the camera radius) toward 'dir', with the sun at 'sunDir'. The
// single-scatter source is weighted by the REAL Rayleigh + Mie phases (this is a
// directional lookup, unlike the isotropic multi-scatter bake); the precomputed
// multi-scatter is added with the total scattering coefficient (it is already
// isotropic). Standard '(S - S*T)/extinction' analytic step integral.
//
// The march is confined to the ray's IN-ATMOSPHERE segment [tNear, tFar] — the
// entry/exit of the top-of-atmosphere sphere, clamped to a ground hit — NOT to
// [0, tMax]. With a from-space camera the origin is far outside the top sphere,
// so tNear > 0 skips the leading vacuum and every sample lands in the medium (the
// module-header 'From-space entry clamp'); for a camera inside the atmosphere
// top.x < 0 -> tNear = 0, recovering the plain 'origin-to-boundary' march. A ray
// that never meets the top sphere (top.y < 0) is empty space -> return zero.
fn raymarchInScatter(p0: vec3<f32>, dir: vec3<f32>, sunDir: vec3<f32>) -> vec3<f32> {
  let bottom = params.planetRadiusKm;
  let topRadius = params.atmosphereTopKm;

  // Confine the march to the atmosphere-top sphere's [entry, exit] interval, the
  // same bound shape the shell fragment + CPU 'atmosphereShellBound' already use.
  let top = raySphere(p0, dir, vec3<f32>(0.0), topRadius);
  if (top.y < 0.0) { return vec3<f32>(0.0); }
  let tNear = max(0.0, top.x);
  var tFar = top.y;
  // Ground clamp: a down-looking ray stops at the opaque surface ahead of tNear.
  let ground = raySphere(p0, dir, vec3<f32>(0.0), bottom);
  if (ground.x > 0.0 && ground.x > tNear) {
    tFar = min(tFar, ground.x);
  }
  let dt = (tFar - tNear) / SKY_VIEW_STEPS;

  let cosTheta = dot(dir, sunDir);

  var L = vec3<f32>(0.0);
  var throughput = vec3<f32>(1.0);

  var i: u32 = 0u;
  loop {
    if (f32(i) >= SKY_VIEW_STEPS) { break; }
    let t = tNear + (f32(i) + 0.5) * dt;
    let pos = p0 + dir * t;
    let r = length(pos);
    let up = pos / r;
    let sunCosZenith = dot(up, sunDir);

    let m = sampleMedium(params, pos, cosTheta);
    let sampleTransmittance = exp(-m.extinction * dt);
    let sunTransmittance = sampleTransmittanceToTop(transmittanceLut, lutSamp, bottom, topRadius, r, sunCosZenith);
    let psiMultiScatter = sampleMultiScatter(multiScatterLut, lutSamp, bottom, topRadius, r, sunCosZenith);

    // Phase-weighted single-scatter source + isotropic multi-scatter source.
    let scatterPhased = m.scatterPhased;
    let scatterTotal = m.scatterTotal;
    // twilightSoftness: fade the WHOLE in-scatter source (single + multi) across the
    // terminator so deep planet shadow goes black instead of clamping to the LUTs'
    // grazing-edge rows. 'muHorizon' is the sun-zenith cosine at which the sun grazes
    // this sample's local horizon. The multi-scatter term MUST be inside the fade: its
    // LUT shares the same below-horizon edge clamp, and at the night limb that ambient
    // floor dominates the grazing-attenuated single scatter by orders of magnitude —
    // gating single scatter alone leaves the knob modulating a sub-percent component.
    let muHorizon = -sqrt(max(0.0, r * r - bottom * bottom)) / r;
    // Clamp the fade width to a tiny epsilon: a zero width collides smoothstep's two edges
    // (its internal divide-by-(edge1-edge0) goes 0/0), so the hard-shadow limit is a near-step.
    let fadeWidth = max(view.twilightSoftness, 1e-4);
    let sunVis = smoothstep(muHorizon - fadeWidth, muHorizon, sunCosZenith);
    // twilightIntensity: a brightness gain applied ONLY across the fade band. The
    // gain is identity where the sun is above the local horizon (sunVis = 1 ->
    // gain = 1, so the day side is untouched); at intensity 1 the whole thing is
    // the physical result; > 1 amplifies only the twilight band. Deep night stays
    // black at any intensity because sunVis -> 0 dominates the product.
    let twilightGain = mix(1.0, view.twilightIntensity, 1.0 - sunVis);
    let s = sunVis * twilightGain * (sunTransmittance * scatterPhased + psiMultiScatter * scatterTotal);

    let sInt = (s - s * sampleTransmittance) / max(m.extinction, vec3<f32>(EXTINCTION_EPS));
    L = L + throughput * sInt;
    throughput = throughput * sampleTransmittance;
    i = i + 1u;
  }
  return L;
}

@compute @workgroup_size(8, 8)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(outTex);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5)) / vec2<f32>(dims);

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
