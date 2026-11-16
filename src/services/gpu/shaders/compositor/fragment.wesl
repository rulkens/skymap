// compositor/fragment.wesl — unified composite + optional tone-map. toneEnabled 0
// passes the source through untouched (display-ready, or additive HDR above 1.0);
// toneEnabled 1 applies exposure, one of five curves (uniforms.curve: 0 Linear, 1
// Reinhard-extended, 2 Asinh, 3 Gamma 2.0, 4 ACES; maths in 'lib/tonemap.wesl',
// JS-mirrored in 'compositor.ts') and the HDR spill. The FILM pipeline variant
// adds the film look around the curve; the plain variant compiles none of it.

import package::compositor::io::CompositorUniforms;
import package::compositor::io::VSOut;
import package::lib::tonemap::applyLinear;
import package::lib::tonemap::applyReinhard;
import package::lib::tonemap::applyAsinh;
import package::lib::tonemap::applyGamma2;
import package::lib::tonemap::applyAces;
import package::lib::film::filmGrain;
import package::lib::film::caSpectrum;
import package::lib::film::cellNoise;

// Set to true by the compositor for a draw whose tone carries a film look.
override FILM: bool = false;

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSamp: sampler;
@group(0) @binding(2) var<uniform> uniforms: CompositorUniforms;
// Linear, for the film taps that land between texels; bound in both variants.
@group(0) @binding(3) var linSamp: sampler;

// Lateral chromatic aberration as a lens does it: the image smeared radially
// across a spectrum, blue end inward, red end outward, by chromaticPx at the
// corner falling with radialSq, each tap renormalised per channel so a flat field
// stays flat. Edge softness rides the same taps: each also sits on a
// golden-angle disc of radius softnessPx·radialSq, wider than tall by the squeeze,
// turned per pixel and frame so twelve taps read as grain, not ghost rings.
// Level-0 samples take no derivatives, so this is safe in any branch.
fn filmLens(uv: vec2<f32>) -> vec3<f32> {
  let dims = vec2<f32>(textureDimensions(srcTex));
  let aspect = dims.x / dims.y;
  let centred = (uv - vec2<f32>(0.5)) * vec2<f32>(aspect, 1.0);
  let cornerSq = 0.25 * aspect * aspect + 0.25;
  let radialSq = dot(centred, centred) / cornerSq;
  let caUv = centred / sqrt(cornerSq) * (uniforms.chromaticPx * radialSq) / dims;
  let softPx = uniforms.softnessPx * radialSq;
  let turn = cellNoise(vec2<i32>(uv * dims), uniforms.seed + 77u).x * 6.2831853;
  var smear = vec3<f32>(0.0);
  var weight = vec3<f32>(0.0);
  for (var tapIndex = 0u; tapIndex < 12u; tapIndex++) {
    let along = (f32(tapIndex) + 0.5) / 12.0;
    let tapWeight = caSpectrum(along);
    let angle = f32(tapIndex) * 2.39996 + turn;
    let radius = sqrt((f32((tapIndex * 7u) % 12u) + 0.5) / 12.0) * softPx;
    let disc = vec2<f32>(cos(angle) * uniforms.squeeze, sin(angle)) * radius / dims;
    smear += textureSampleLevel(srcTex, linSamp, uv + caUv * (2.0 * along - 1.0) + disc, 0.0).rgb * tapWeight;
    weight += tapWeight;
  }
  return smear / weight;
}

// The display-space grade, after the curve: contrast about mid grey, a black
// floor, cool shadows and warm highlights, an oval vignette (an anamorphic lens
// falls off later along the squeeze axis), and grain re-seeded every frame,
// mostly luminance, whose response peaks in the midtones and keeps a quarter in
// the blacks and whites.
fn filmGrade(colour: vec3<f32>, uv: vec2<f32>) -> vec3<f32> {
  let dims = vec2<f32>(textureDimensions(srcTex));
  let aspect = dims.x / dims.y;
  var out = (colour - vec3<f32>(0.18)) * uniforms.contrast + vec3<f32>(0.18);
  out = out * (1.0 - uniforms.lift) + vec3<f32>(uniforms.lift);
  let luma = clamp(dot(out, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  let cool = vec3<f32>(0.90, 0.97, 1.10);
  let warm = vec3<f32>(1.08, 1.00, 0.90);
  out = out * mix(vec3<f32>(1.0), mix(cool, warm, smoothstep(0.0, 0.7, luma)), uniforms.splitTone);
  let oval = (uv - vec2<f32>(0.5)) * vec2<f32>(aspect / uniforms.squeeze, 1.0);
  let radialSq = dot(oval, oval) / (0.25 * aspect * aspect / (uniforms.squeeze * uniforms.squeeze) + 0.25);
  out = out * (1.0 - uniforms.vignette * smoothstep(0.2, 1.1, radialSq));
  let noise = filmGrain(uv * dims, uniforms.grainSizePx, uniforms.seed);
  let grainRgb = mix(vec3<f32>(dot(noise, vec3<f32>(1.0 / 3.0))), noise, 0.3);
  out = out + grainRgb * uniforms.grain * (0.25 + 0.75 * 4.0 * luma * (1.0 - luma));
  return max(out, vec3<f32>(0.0));
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  // 'textureSample' takes implicit derivatives, so it stays out of any branch
  // that could vary across a quad; the film taps use 'textureSampleLevel'.
  var sample = textureSample(srcTex, srcSamp, in.uv);
  if (FILM && (uniforms.chromaticPx > 0.0 || uniforms.softnessPx > 0.0)) {
    sample = vec4<f32>(filmLens(in.uv), sample.a);
  }

  if (uniforms.toneEnabled == 0u) {
    // No exposure, curve or clamp: additive HDR above 1.0 is legitimate here.
    return sample;
  }

  let scaled = sample.rgb * uniforms.exposure;
  var mapped: vec3<f32>;
  if (uniforms.curve == 0u) {
    mapped = applyLinear(scaled);
  } else if (uniforms.curve == 1u) {
    mapped = applyReinhard(scaled, uniforms.whitepointSq);
  } else if (uniforms.curve == 2u) {
    mapped = applyAsinh(scaled, uniforms.asinhSoftness);
  } else if (uniforms.curve == 3u) {
    mapped = applyGamma2(scaled);
  } else {
    // 4u (ACES), and any unknown value.
    mapped = applyAces(scaled);
  }

  // Every curve clamps into [0,1]; on an extended-range swap the energy ABOVE
  // the knee is added back on top so bright sources climb into the display's
  // headroom. hdrHeadroom 0 (every SDR draw) leaves the curve's result exact.
  // Brightness is the MAX CHANNEL, as the bloom bright-pass measures it, and
  // the spill rides the pixel's own colour ratio, never per channel, so a
  // saturated star brightens without drifting to white (the 'lib/starKnee.wesl'
  // hue contract, one stage later).
  let lum = max(scaled.r, max(scaled.g, scaled.b));
  let peak = max(0.0, lum - uniforms.hdrKnee);
  let tint = scaled / max(lum, 0.0001);
  var out = mapped + tint * peak * uniforms.hdrHeadroom;
  if (FILM) {
    out = filmGrade(out, in.uv);
  }

  // replace forces opaque 1.0 (the premultiplied swap chain relies on it);
  // over / additive carry the source's straight alpha, which the blend
  // hardware multiplies itself, so premultiplying here would darken edges.
  return vec4<f32>(out, select(1.0, sample.a, uniforms.preserveAlpha == 1u));
}
