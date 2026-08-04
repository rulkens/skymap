// milkyWay/field/splat.wesl — the analytic Milky Way field: one instanced
// quad PER EMISSION COMPONENT, each covering its own Gaussian's screen
// footprint. Emission is additive and order-independent (no depth test, no
// depth sort), so overlapping quads sum to the mixture's true integral
// wherever a quad covers its own component's support: cost is sum of
// covered screen area rather than pixels x componentCount, which is what
// makes N~300+ mixtures affordable.
//
// Dust components live in the SAME 'comps' array, past every emission
// component (see io.wesl's layout comment), but are never drawn as quads —
// the draw call's instance count is the emission count only. The PRIMARY
// galaxy's dust no longer walks that slice per-fragment (a per-fragment loop
// does not scale to a filament network's component count, per the
// grill-session doc's N1); it instead reads dustMap.wesl's screen-space,
// depth-sliced optical-depth accumulation (io.wesl's dustSlices doc), one
// texel lookup regardless of dust component count. A single mean-depth
// split (the previous scheme) put a hard 50% floor on obscuration — the
// dust's own tau centroid sits INSIDE the emitting disc from both an
// edge-on and an inside-the-disc view, so half the light always escaped no
// matter how thick the dust. Four slices fix that: each is attenuated by
// only the tau IN FRONT of it, so opacity can reach 100% as tau does. A
// future per-EXTRA dust slice would come back as a bounded loop for extra
// instances (extras have no dust map yet, and their attenuation must stay
// per-galaxy — see io.wesl's primaryCount gate).

import package::lib::billboard::quadCorner;
import package::lib::splatSilhouette::splatNdc;
import package::lib::gaussianIntegral::gaussianRayIntegral;
import package::lib::gaussianIntegral::gaussianRayCoeffs;
import package::lib::gaussianIntegral::expHalfErfc;
import package::lib::gaussianIntegral::GAUSS_PI;
import package::milkyWay::field::io::u;
import package::milkyWay::field::io::comps;
import package::milkyWay::field::io::dustMapTex;
import package::milkyWay::field::io::dustMapSmp;

// sliceTransmitRatio — (1 - exp(-x)) / x per channel, the exact closed form
// for emission spread UNIFORMLY through a homogeneous slab of per-channel
// optical depth x, relative to the slab's own near face. x -> 0 is a
// removable singularity (the limit is 1, by l'Hopital / the Taylor series of
// exp), but the literal expression is 0/0 there and IEEE division does not
// take limits — so this is guarded per channel with select() rather than
// trusted to degrade gracefully, since red/green/blue can straddle the
// threshold independently (blue extinction is stronger than red at the same
// physical tau). 'safe' only feeds the branch select() is about to discard;
// its own value never reaches the output.
fn sliceTransmitRatio(x: vec3<f32>) -> vec3<f32> {
  let thin = vec3<f32>(1e-4);
  let safe = max(x, thin);
  let ratio = (vec3<f32>(1.0) - exp(-safe)) / safe;
  return select(ratio, vec3<f32>(1.0), x < thin);
}

struct SplatOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) ndc: vec2<f32>,
  @location(1) @interpolate(flat) inst: u32,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) inst: u32) -> SplatOut {
  let corner = quadCorner(vi);
  let g1 = comps[4u * inst + 1u];
  let g3 = comps[4u * inst + 3u];
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

  var out: SplatOut;
  out.inst = inst;
  let ndc = splatNdc(corner, xv, yv, zv, r, tanHalfFov, aspect, shift);
  out.pos = vec4<f32>(ndc, 0.0, 1.0);
  out.ndc = ndc;
  return out;
}

@fragment
fn fs(input: SplatOut) -> @location(0) vec4<f32> {
  // Reconstructs the world-space ray from the interpolated NDC rather than
  // passing one down from the vertex stage: cheap (three lines) and avoids
  // an extra varying.
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;
  let d = normalize(
    u.camRight.xyz * ((input.ndc.x + shift) * tanHalfFov * aspect)
      + u.camUp.xyz * (input.ndc.y * tanHalfFov)
      + u.camFwd.xyz,
  );
  let o = u.eye.xyz;

  let g0 = comps[4u * input.inst];
  let g1 = comps[4u * input.inst + 1u];
  let g2 = comps[4u * input.inst + 2u];
  let g3 = comps[4u * input.inst + 3u];
  let po = o - g3.xyz;

  // counts.x is the emission count (this draw's own instance count, unused
  // here); .w is the primary galaxy's own emission count — see io.wesl's
  // layout comment. .y/.z (the dust slice's offset/count) are consumed by
  // dustMap.wesl's own draw now, not read here.
  let primaryCount = u32(u.counts.w);

  var emission = vec3<f32>(0.0);
  var dustApplies = false;
  // Dust attenuates only the PRIMARY galaxy's own emission splats (index <
  // primaryCount, since the primary's components are packed first — see
  // io.wesl): an extra's dust must never darken the primary, and this gate
  // is what keeps that true without extras carrying their own dust yet.
  //
  // The dust column comes from dustMapTex, not a per-component loop. This
  // pass runs at fieldTex's own (coarser) resolution while dustMapTex is now
  // sized to its OWN divisor (io.wesl's DUST MAP doc) — no longer the same
  // extent, so a direct framebuffer-coord texel load is no longer valid.
  // counts2.zw (fieldSizePx) turns this fragment's own coords into a
  // normalized UV, sampled through dustMapSmp with an EXPLICIT level (0.0,
  // not textureSample): this read sits inside 'if (input.inst <
  // primaryCount)' and the 'dustApplies' branch below, both non-uniform
  // control flow, where implicit-derivative sampling is a WGSL validation
  // error. Bilinear is not a correct box downsample of a finer source, so
  // fine dust structure can shimmer under camera motion — a mip chain
  // sampled at the resolution ratio's LOD would fix that; a deliberate,
  // not-yet-done follow-up, not an oversight (see io.wesl's DUST MAP doc).
  // The four channels are the depth-sliced optical depths tau_0..tau_3
  // (io.wesl's dustSlices doc), not a single column any more.
  if (input.inst < primaryCount) {
    let dustUv = input.pos.xy / u.counts2.zw;
    let texel = textureSampleLevel(dustMapTex, dustMapSmp, dustUv, 0.0);
    let tau0 = texel.x;
    let tau1 = texel.y;
    let tau2 = texel.z;
    let tau3 = texel.w;
    dustApplies = (tau0 + tau1 + tau2 + tau3) > 1e-6;
    if (dustApplies) {
      let K = u.dustExtinction.xyz;
      // Cumulative optical depth IN FRONT OF each slice: slice 0 sees none
      // of the column yet (so its own attenuation below has no exp(-C*K)
      // factor), slice k sees every slice nearer than it.
      let c1 = tau0 * K;
      let c2 = c1 + tau1 * K;
      let c3 = c2 + tau2 * K;

      let ec = gaussianRayCoeffs(po, d, g0.xyz, g1.xyz);
      let ea = ec.x;
      // ea < 1e-12 (ray in this component's covariance null space) leaves
      // 'emission' at its zero default rather than falling back to the
      // plain path — 'dustApplies' is already true, and a null-space ray
      // integrates to 0 either way.
      if (ea >= 1e-12) {
        // tail(t) is this Gaussian's own column from depth t to infinity —
        // same expHalfErfc trick dustMap.wesl uses to slice its dust
        // column, applied here to the EMISSION component instead so each
        // slice's own emission mass (E_k = tail(t_k) - tail(t_{k+1})) can be
        // attenuated by that slice's own transmittance before summing.
        let sqrtHalfA = sqrt(2.0 * ea);
        let x0 = ec.y / sqrtHalfA;
        let aOverSqrtHalfA = ea / sqrtHalfA;
        let tail0 = expHalfErfc(ec.z, x0);
        let tail1 = expHalfErfc(ec.z, x0 + aOverSqrtHalfA * u.dustSlices.x);
        let tail2 = expHalfErfc(ec.z, x0 + aOverSqrtHalfA * u.dustSlices.y);
        let tail3 = expHalfErfc(ec.z, x0 + aOverSqrtHalfA * u.dustSlices.z);
        // Clamped for the same reason dustMap.wesl's fs clamps its own tail
        // differences: two close tail values subtracted can lose precision
        // to the erfc rational approximation's branch seam, and a tiny
        // negative E_k would otherwise darken this slice's contribution
        // rather than the intended "no mass in this slice."
        let e0 = max(tail0 - tail1, 0.0);
        let e1 = max(tail1 - tail2, 0.0);
        let e2 = max(tail2 - tail3, 0.0);
        let e3 = max(tail3, 0.0);

        // Attenuation of emission spread through slice k: exp(-C_k*K), the
        // transmittance of everything IN FRONT of the slice, times the
        // in-slice term (the exact result for uniform emission through a
        // homogeneous absorbing slab, tau_k thick) — see
        // sliceTransmitRatio's own header for the tau_k -> 0 limit.
        let atten0 = sliceTransmitRatio(tau0 * K);
        let atten1 = exp(-c1) * sliceTransmitRatio(tau1 * K);
        let atten2 = exp(-c2) * sliceTransmitRatio(tau2 * K);
        let atten3 = exp(-c3) * sliceTransmitRatio(tau3 * K);

        let summed = e0 * atten0 + e1 * atten1 + e2 * atten2 + e3 * atten3;
        emission = g2.xyz * (g0.w * sqrt(GAUSS_PI / (2.0 * ea)) * summed);
      }
    }
  }
  if (!dustApplies) {
    emission = g2.xyz * (g0.w * gaussianRayIntegral(po, d, g0.xyz, g1.xyz));
  }

  // Alpha 0: the aggregate's alpha channel feeds nothing — the additive
  // upsample folds it into HDR and the compositor forces 1.0 — and a quad
  // writing coverage would swamp the sprites' own alpha for no reader's
  // benefit.
  //
  // Exposure (params.w) multiplies emission only, never the attenuation
  // above: the dust column is physical (a property of the galaxy's own
  // geometry), not a look knob that should brighten or dim with the field's
  // whole-frame exposure.
  //
  // debugView.w is the combined galaxy dimming weight (io.wesl's debugView
  // doc) — 1 with every debug view off, so this multiply is a no-op at the
  // default. This same fs also draws the HII tier (a second bind group over
  // the same pipeline), so HII dims under an active debug view too.
  return vec4<f32>(emission * u.params.w * u.debugView.w, 0.0);
}
