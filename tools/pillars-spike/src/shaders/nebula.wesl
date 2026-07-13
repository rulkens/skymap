// nebula.wesl — the volumetric raymarcher: single-scattering radiative
// transfer through the baked density field, lit by the baked star
// transmittances. This is where the physics assembles into a picture.
//
// ## Radiance model (per march sample)
//
//   L(x) = emission(x) + in-scatter(x) + ambient(x)
//
//   emission   — ionization-front glow: dust density × UV irradiance
//                (starUv·T_baked/d²). Peaks in the thin skin where dense
//                gas first meets unattenuated starlight, giving the
//                physically-correct bright rims — no rim-light hack.
//                Colour blends Hα red-pink into [OIII] teal by the baked
//                temperature channel. The thin gas haze (field.g) emits
//                the same way, tinted toward teal — the glowing cavity
//                that back-lights the columns.
//   in-scatter — Henyey-Greenstein single scattering of each star's
//                visible light, with per-channel (chromatic) shadowing
//                pow(T, tint) and a bluish dust albedo — the physics that
//                makes forward-lit faces warm and grazing halos cool
//                (reflection-nebula blue).
//   ambient    — baked 6-direction sky visibility × a cool HII-region
//                fill, so shadowed dust reads as deep blue-grey volume
//                instead of dead black.
//
// Accumulation is front-to-back with a CHROMATIC transmittance vec3:
// blue extinguishes faster than red (lib/volume.wesl's EXTINCTION_TINT),
// so thin dust reddens what's behind it — including the background
// starfield, which this fragment composites itself (see below).
//
// ## Why the fragment paints its own background
//
// Chromatic occlusion of the backdrop needs 'dst × T_rgb' per channel —
// not expressible in fixed-function blending without dual-source blend
// (an optional WebGPU feature). Instead the fragment evaluates the SAME
// bgColor(rayDir) the fullscreen background pass uses and outputs
// C + T_rgb·bg with blending disabled. Inside the volume's screen
// footprint this replaces the background pass's pixels with a value that
// is IDENTICAL where T=1 (the two evaluations share one function of one
// ray), so the box edge cannot show a seam.
//
// ## Geometry
//
// The cube is drawn with FRONT-face culling so only back faces rasterise —
// the standard trick that covers both camera-outside and camera-inside
// cases with no branching (see src/services/gpu/shaders/scalarVolume/
// fragment.wesl for the full derivation; the tEnter clamp to 0 handles
// inside-the-volume).
//
// Per-fragment jitter of the march start offset (hash of fragCoord +
// frame) trades the visible step-grid moiré for film-like grain, exactly
// as the runtime engine's volume renderer does and for the same reasons.

import package::lib::scene::SceneUniforms;
import package::lib::scene::LightStars;
import package::lib::scene::LIGHT_STAR_COUNT;
import package::lib::volume::VOLUME_MIN;
import package::lib::volume::VOLUME_MAX;
import package::lib::volume::worldToVolumeUv;
import package::lib::volume::intersectVolumeBox;
import package::lib::volume::decodeTransmittance;
import package::lib::volume::applyChromaticTransmittance;
import package::lib::volume::EXTINCTION_TINT;
import package::lib::noise::hash21Hq;
import package::lib::starfield::bgColor;

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(0) @binding(1) var<uniform> stars: LightStars;
@group(0) @binding(2) var field: texture_3d<f32>;
@group(0) @binding(3) var light: texture_3d<f32>;
@group(0) @binding(4) var volSampler: sampler;

const STEP_COUNT = 128;
// View-path optical depth per unit dust density per scene unit. The light
// bake uses a slightly HIGHER sigma (9.0) so shadows fully develop before
// the view path saturates — see bakeLight.wesl.
const SIGMA_VIEW = 6.5;
// Dust single-scattering albedo, bluish: interstellar grains scatter blue
// more efficiently than they absorb it (why reflection nebulae are blue).
const DUST_ALBEDO = vec3<f32>(0.52, 0.60, 0.74);
// Emission line palette (linear-light). Hα dominates ionized hydrogen
// rims (broad red-pink); [OIII]+Hβ pulls hotter regions toward teal.
const HALPHA = vec3<f32>(1.00, 0.36, 0.26);
const OIII = vec3<f32>(0.42, 0.90, 0.78);
// The thin cavity haze leans teal-blue (higher ionization, less dust).
const GAS_TINT = vec3<f32>(0.40, 0.72, 0.78);
// Cool HII-region ambient fill for shadowed dust.
const SKY_FILL = vec3<f32>(0.30, 0.40, 0.55);

struct VsOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  // 36 vertices of the unit cube (two triangles per face), wound so
  // OUTWARD faces are front — the pipeline culls fronts, rasterising back
  // faces. Function-scope 'var' (not module-scope 'const'): WGSL only
  // guarantees dynamic indexing on addressable storage, and some
  // compilers reject a runtime index into a module-scope const array.
  var cube = array<vec3<f32>, 36>(
    // -x
    vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(0.0, 1.0, 1.0),
    vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 1.0), vec3<f32>(0.0, 1.0, 0.0),
    // +x
    vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(1.0, 1.0, 1.0),
    vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(1.0, 0.0, 1.0),
    // -y
    vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(1.0, 0.0, 1.0),
    vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 0.0, 1.0), vec3<f32>(0.0, 0.0, 1.0),
    // +y
    vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0, 1.0, 1.0), vec3<f32>(1.0, 1.0, 1.0),
    vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(1.0, 1.0, 0.0),
    // -z
    vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 1.0, 0.0),
    vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0),
    // +z
    vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 1.0), vec3<f32>(1.0, 1.0, 1.0),
    vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(0.0, 1.0, 1.0),
  );
  var o: VsOut;
  let world = mix(VOLUME_MIN, VOLUME_MAX, cube[vi]);
  o.worldPos = world;
  o.clip = scene.viewProj * vec4<f32>(world, 1.0);
  return o;
}

// Henyey-Greenstein phase function. g > 0 forward-scatters (halo around
// backlit dust), g < 0 back-scatters. Normalised over the sphere (1/4π).
fn hgPhase(cosTheta: f32, g: f32) -> f32 {
  let g2 = g * g;
  let denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (12.56637 * pow(max(denom, 1e-4), 1.5));
}

// Two-lobe phase: dominant tunable forward lobe plus a fixed faint
// backscatter lobe, the standard cheap fit to real dust phase curves
// (pure HG under-lights faces viewed from the star side).
fn dustPhase(cosTheta: f32, g: f32) -> f32 {
  return mix(hgPhase(cosTheta, -0.18), hgPhase(cosTheta, g), 0.75);
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  // in.clip is @builtin(position): in a fragment stage that IS the
  // framebuffer coordinate (declaring a second position builtin param is
  // a pipeline-input conflict).
  let fragCoord = in.clip;
  let rd = normalize(in.worldPos - scene.camPos);
  let tRange = intersectVolumeBox(scene.camPos, rd);
  if (tRange.y <= tRange.x) {
    discard;
  }

  let stepLen = (tRange.y - tRange.x) / f32(STEP_COUNT);
  // Temporal jitter: decorrelates the step grid per pixel AND per frame
  // (irrational frame multipliers, same idiom as the runtime engine).
  let jitter = hash21Hq(fragCoord.xy + vec2<f32>(scene.frame * 7.13, scene.frame * 13.71));
  var t = tRange.x + jitter * stepLen;

  var radiance = vec3<f32>(0.0);
  var trans = vec3<f32>(1.0);

  for (var i = 0; i < STEP_COUNT; i = i + 1) {
    let p = scene.camPos + rd * t;
    let f = textureSampleLevel(field, volSampler, worldToVolumeUv(p), 0.0);
    let dust = f.r * scene.densityMul;
    let gas = f.g;

    if (dust + gas > 0.004) {
      // 'var' (not 'let'): the per-star loop below indexes the vector
      // dynamically, which WGSL only guarantees on addressable storage.
      var lightSample = textureSampleLevel(light, volSampler, worldToVolumeUv(p), 0.0);
      let ao = decodeTransmittance(lightSample.a);

      var uvIrradiance = 0.0;
      var scatter = vec3<f32>(0.0);
      for (var s = 0; s < LIGHT_STAR_COUNT; s = s + 1) {
        let tGray = decodeTransmittance(lightSample[s]);
        let toStar = stars.posPower[s].xyz - p;
        let d2 = dot(toStar, toStar);
        let invSq = 1.0 / (0.35 + d2);
        // UV flux drives emission — scalar is enough (lines re-emit at
        // their own wavelengths, so the exciting photons' hue is moot).
        uvIrradiance = uvIrradiance + stars.colorUv[s].w * tGray * invSq;
        // Visible flux drives scattering — chromatic shadow via pow(T,tint).
        let cosTheta = dot(normalize(toStar), rd);
        scatter = scatter
          + stars.colorUv[s].rgb * (stars.posPower[s].w * invSq * dustPhase(cosTheta, scene.phaseG))
          * applyChromaticTransmittance(tGray);
      }

      // Emission: rim glow on dust skins + volume glow in the thin haze.
      let lineMix = clamp(f.b * 0.75, 0.0, 1.0);
      let rimColor = mix(HALPHA, OIII, lineMix);
      let grain = 0.55 + 0.90 * f.a;
      // The haze coefficient is ~10× below the rim's: the cavity glow is
      // integrated over the WHOLE box depth with no self-extinction (the
      // haze is optically thin), while the rims only integrate over a
      // thin skin — at equal coefficients the haze nukes the frame to
      // white (verified in the first smoke render).
      let emission = rimColor * (dust * uvIrradiance * scene.emissionMul * grain)
        + GAS_TINT * (gas * (uvIrradiance * 0.10 + 0.003) * scene.emissionMul);

      // In-scatter + ambient fill, both carried by dust.
      let scattered = scatter * DUST_ALBEDO * (dust * scene.scatterMul);
      let ambient = SKY_FILL * DUST_ALBEDO * (dust * ao * scene.ambientMul);

      radiance = radiance + trans * (emission + scattered + ambient) * stepLen;

      // Beer-Lambert step transmittance, chromatic.
      let tau = SIGMA_VIEW * dust * stepLen;
      trans = trans * exp(-EXTINCTION_TINT * tau);
      if (max(trans.r, max(trans.g, trans.b)) < 0.004) {
        break;
      }
    }
    t = t + stepLen;
  }

  // Composite the (reddened, dimmed) background behind the volume.
  // ('final' is a WGSL reserved word — hence 'outColor'.)
  let outColor = radiance + trans * bgColor(rd);
  return vec4<f32>(outColor, 1.0);
}
