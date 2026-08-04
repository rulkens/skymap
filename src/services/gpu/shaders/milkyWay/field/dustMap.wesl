// milkyWay/field/dustMap.wesl — splats the PRIMARY galaxy's dust slice into a
// screen-space column map: one instanced quad per dust component, additively
// accumulating FOUR depth-sliced optical-depth channels (tau_0..tau_3, see
// io.wesl's dustSlices doc) per pixel, at fieldTex's own divisor-matched
// resolution (see createGalaxyEngine.ts's dustMapTex declaration — NOT full
// canvas res, its readers' target rate). This is the scaling backbone a
// filament network needs (grill-session doc, N1):
// dust component count decouples from emission fragment cost the same way
// splat.wesl's own quad-per-component scheme decoupled emission from it.
//
// splat.wesl's fs reads this map with one textureLoad per primary emission
// fragment, replacing its former per-fragment dust loop. The JWST view mode
// (dustPresent.wesl) reads it too, summing the four channels to present the
// total column through a palette instead of using it to attenuate emission.
//
// Vertex geometry is splat.wesl's exact silhouette math (see
// lib/splatSilhouette.wesl) — a dust component is a Gaussian with a
// boundRadius like any emission component, so the same per-axis tangent-cone
// footprint applies unchanged.

import package::lib::billboard::quadCorner;
import package::lib::splatSilhouette::splatNdc;
import package::lib::gaussianIntegral::gaussianRayCoeffs;
import package::lib::gaussianIntegral::expHalfErfc;
import package::lib::gaussianIntegral::GAUSS_PI;
import package::milkyWay::field::io::u;
import package::milkyWay::field::io::comps;
import package::milkyWay::field::io::dustNoiseTex;
import package::milkyWay::field::io::dustNoiseSmp;

struct DustMapOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
  @location(1) @interpolate(flat) inst: u32,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> DustMapOut {
  let corner = quadCorner(vi);
  // counts.y is dustOffset (== the emission count, since dust is appended
  // last — see io.wesl's layout comment): this draw's own instance index is
  // relative to the dust slice, not 'comps' as a whole.
  let dustOffset = u32(u.counts.y);
  let base = 4u * (dustOffset + inst);
  let g1 = comps[base + 1u];
  let g3 = comps[base + 3u];
  let center = g3.xyz;
  let r = g1.w;

  let eye = u.eye.xyz;
  let camRight = u.camRight.xyz;
  let camUp = u.camUp.xyz;
  let camFwd = u.camFwd.xyz;
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;

  // View-space offset of the centre: zv along the gaze, xv/yv across it.
  let rel = center - eye;
  let zv = dot(rel, camFwd);
  let xv = dot(rel, camRight);
  let yv = dot(rel, camUp);

  var out: DustMapOut;
  out.inst = inst;
  let ndc = splatNdc(corner, xv, yv, zv, r, tanHalfFov, aspect, shift);
  out.pos = vec4<f32>(ndc, 0.0, 1.0);
  out.ndc = ndc;
  return out;
}

// dustNoiseMultiplier — erodes the particle cloud's own column with
// the baked ridged-fbm volume (dustNoiseBake.wesl) — see io.wesl's
// dustNoise doc for why every dust component takes this branch now.
// 'p' is the ray's world-space closest-approach point to this Gaussian,
// 'depth' its distance along the ray (both already computed by the caller
// as o + d*tPeak / tPeak). Sampled at explicit LOD 0, no derivatives: this
// is a splat quad, so neighbouring fragments can belong to wildly different
// depths, and hardware-derivative LOD would pick the wrong footprint for at
// least one of them.
fn dustNoiseMultiplier(p: vec3<f32>, depth: f32) -> f32 {
  let bands = textureSampleLevel(dustNoiseTex, dustNoiseSmp, p / u.dustNoise.x, 0.0);

  // dustMapHeightPx (counts2.y) is dustMapTex's own pixel height (io.wesl);
  // tanHalfFov (params.x) times depth is the world-space HALF-height of the
  // view frustum at this depth, so 2x that over the pixel height converts
  // to world units per pixel — this fragment's own footprint at 'depth'.
  let pxWorld = 2.0 * depth * u.params.x / u.counts2.y;
  if (pxWorld <= 0.0) {
    return 1.0;
  }

  // Four bands at 1x/2x/4x/8x the base tile frequency (dustNoiseBake.wesl),
  // weighted by a rough 1/f falloff (0.5/0.25/0.15/0.10) then REQUIRED to be
  // band-limited: at galaxy-wide zoom the high bands are far sub-pixel, and
  // sampling them unfiltered crawls badly under camera motion. A band's
  // weight ramps to zero once its wavelength has shrunk under ~2 world-space
  // pixels, and holds its full base weight once comfortably resolved.
  let w0 = 0.5 * clamp(u.dustNoise.x / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
  let w1 = 0.25 * clamp((u.dustNoise.x / 2.0) / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
  let w2 = 0.15 * clamp((u.dustNoise.x / 4.0) / (2.0 * pxWorld) - 1.0, 0.0, 1.0);
  let w3 = 0.10 * clamp((u.dustNoise.x / 8.0) / (2.0 * pxWorld) - 1.0, 0.0, 1.0);

  let wSum = w0 + w1 + w2 + w3;
  let weighted = bands.x * w0 + bands.y * w1 + bands.z * w2 + bands.w * w3;
  let n = weighted / max(wSum, 1e-6);
  // n has mean ~0.5 by construction (each ridged band averages ~0.5 over a
  // tile), so 's' below has mean ~0. Contrast is applied as a SIGNED power
  // of 's' rather than a plain pow(n, g) on n itself, specifically to stay
  // odd about s=0: an odd function preserves mean(s)=0 for a symmetric s,
  // so the multiplier keeps mean 1 at ANY contrast setting — the cloud's
  // total measured tau still holds in expectation, erosion only redistributes
  // it. This only preserves the mean as well as n's own ~0.5
  // assumption already does (ridged fbm is not exactly symmetric); no new
  // debt beyond that pre-existing approximation. The max(0, ...) clamp
  // biases that mean very slightly upward at amplitudes above 1 (it can
  // only clip the low tail, never the high one, since n in [0,1] bounds the
  // unclamped term to [1-amp, 1+amp]); accepted rather than corrected — the
  // slider tops out at 1.5, so the bias is small and the alternative
  // (renormalising after the clamp) would cost a second pass over the same
  // four samples for no visible gain.
  let s = 2.0 * n - 1.0;
  let shaped = sign(s) * pow(abs(s), u.dustNoise.w);
  return max(0.0, 1.0 + u.dustNoise.y * shaped);
}

@fragment
fn fs(input: DustMapOut) -> @location(0) vec4<f32> {
  // Reconstructs the world-space ray from the interpolated NDC, exactly as
  // splat.wesl's fs does — the two must agree pixel-for-pixel since the map
  // is later read back at the SAME framebuffer coordinates.
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  let d = normalize(
    u.camRight.xyz * ((input.ndc.x + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (input.ndc.y * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;

  let dustOffset = u32(u.counts.y);
  let base = 4u * (dustOffset + input.inst);
  let dg0 = comps[base];
  let dg1 = comps[base + 1u];
  let dg3 = comps[base + 3u];
  let po = o - dg3.xyz;

  let dc = gaussianRayCoeffs(po, d, dg0.xyz, dg1.xyz);
  let a = dc.x;
  // a < 1e-12: ray in this component's covariance null space — additive
  // blend means "contribute nothing" is the correct default, not a fallback
  // path (there's no other estimate to fall back to for one instance).
  if (a < 1e-12) {
    return vec4<f32>(0.0);
  }
  // tail(t) is this component's own column from depth t to infinity, the
  // same closed form splat.wesl's former per-fragment loop used for the
  // whole ray (t=0). amplitude (dg0.w) is the component's central V-band
  // extinction density — see io.wesl's layout comment. x(t) = (b + a*t) /
  // sqrt(2a) is expHalfErfc's own lower-limit argument (gaussianIntegral.wesl);
  // x0 is x(0), and each further edge just adds a*t_k/sqrtHalfA to it.
  let sqrtHalfA = sqrt(2.0 * a);
  let coeff = dg0.w * sqrt(GAUSS_PI / (2.0 * a));
  let x0 = dc.y / sqrtHalfA;
  let aOverSqrtHalfA = a / sqrtHalfA;
  let tail0 = coeff * expHalfErfc(dc.z, x0);
  let tail1 = coeff * expHalfErfc(dc.z, x0 + aOverSqrtHalfA * u.dustSlices.x);
  let tail2 = coeff * expHalfErfc(dc.z, x0 + aOverSqrtHalfA * u.dustSlices.y);
  let tail3 = coeff * expHalfErfc(dc.z, x0 + aOverSqrtHalfA * u.dustSlices.z);
  // Slice k's own column is the tail mass BETWEEN its two edges (tail(t4 =
  // infinity) is 0, folded in directly rather than a fourth expHalfErfc
  // call). Each difference of two close tail values loses precision as the
  // slice narrows (the erfc rational approximation is not bit-exact
  // monotonic across its two branches — gaussianIntegral.wesl's erfc x>=0/
  // x<0 split); clamped at 0 so that cancellation noise never becomes a
  // small negative tau feeding the additive accumulation, rather than
  // trusting it to stay non-negative on every GPU's math library.
  var slices = vec4<f32>(
    max(tail0 - tail1, 0.0),
    max(tail1 - tail2, 0.0),
    max(tail2 - tail3, 0.0),
    max(tail3, 0.0),
  );

  // -b/a is this component's own closest-approach depth along the ray;
  // clamped to 0 because a component whose peak is behind the eye still
  // contributes column density in front of it. Used only to place the
  // erosion sample below — the depth SLICING above needs no such peak.
  let tPeak = max(-dc.y / a, 0.0);

  // Erosion applies to every dust component — input.inst is this draw's
  // index within the dust slice (see 'base' above), and cloudOffset
  // (dustNoise.z) is where the cloud components start within that same
  // slice (io.wesl's dustNoise doc); it is always 0 now that the particle
  // cloud is the only dust tier, so this gate never skips. Kept rather than
  // deleted since the uniform layout still reserves the field. It is a
  // DENSITY modulation, not a depth-dependent one, so the same scalar
  // multiplies all four slices.
  let noiseAmp = u.dustNoise.y;
  if (noiseAmp > 0.0 && input.inst >= u32(u.dustNoise.z)) {
    slices = slices * dustNoiseMultiplier(o + d * tPeak, tPeak);
  }
  return slices;
}
