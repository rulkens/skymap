// milkyWayField/splat.wesl — the analytic Milky Way field: one instanced
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
// grill-session doc's N1); it instead reads dustMap.wesl's screen-space
// (tau, tau*tPeak) accumulation, one texel lookup regardless of dust
// component count. A future per-EXTRA dust slice would come back as a
// bounded loop for extra instances (extras have no dust map yet, and their
// attenuation must stay per-galaxy — see io.wesl's primaryCount gate).

import package::lib::billboard::quadCorner;
import package::lib::splatSilhouette::splatNdc;
import package::lib::gaussianIntegral::gaussianRayIntegral;
import package::lib::gaussianIntegral::gaussianRayCoeffs;
import package::lib::gaussianIntegral::expHalfErfc;
import package::lib::gaussianIntegral::GAUSS_PI;
import package::milkyWayField::io::u;
import package::milkyWayField::io::comps;
import package::milkyWayField::io::dustMapTex;

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
  // The dust column comes from dustMapTex, not a per-component loop:
  // framebuffer pixel coords index the map exactly, a direct 1:1 texel
  // read, no sampler and no uv-flip trap — because dustMapTex is sized to
  // THIS pass's own target extent by construction (createGalaxyEngine.ts's
  // buildDustMapTarget, rebuilt on every render.fieldDivisor change). A
  // resolution mismatch here is invisible in types and silently
  // misregisters the attenuation (it once decimated thin lanes into beads —
  // see dustMapTex's own declaration comment). tau is the map's grey column
  // depth (red channel); dividing the green channel (tau*tPeak) by tau
  // recovers tD, the tau-weighted depth moment — see dustMap.wesl's fs for
  // the two channels' definitions.
  if (input.inst < primaryCount) {
    let texel = textureLoad(dustMapTex, vec2<i32>(input.pos.xy), 0);
    // Bubbles (dustFeature.wesl kind 1) write a SIGNED tau — clamp at this
    // consumer: a nested hole/rim overshoot must read as clean dust, never
    // as negative absorption.
    let tau = max(texel.r, 0.0);
    dustApplies = tau > 1e-6;
    if (dustApplies) {
      let tD = max(texel.g / tau, 0.0);
      let tauRGB = tau * u.dustExtinction.xyz;
      let transmittance = exp(-tauRGB);

      let ec = gaussianRayCoeffs(po, d, g0.xyz, g1.xyz);
      let ea = ec.x;
      // ea < 1e-12 (ray in this component's covariance null space) leaves
      // 'emission' at its zero default rather than falling back to the
      // plain path — 'dustApplies' is already true, and a null-space ray
      // integrates to 0 either way.
      if (ea >= 1e-12) {
        let sqrtHalfA = sqrt(2.0 * ea);
        let x0 = ec.y / sqrtHalfA;
        let x1 = (ec.y + ea * tD) / sqrtHalfA;
        let full = expHalfErfc(ec.z, x0);
        let behind = expHalfErfc(ec.z, x1);
        // full - (1-T)*behind = E(0->t_d) + T*E(t_d->infinity): t_d clamped
        // >= 0 keeps x1 >= x0, so behind <= full and this stays >= 0.
        // full/behind broadcast to vec3 explicitly: WGSL has no scalar-minus-
        // vector overload (only * and / broadcast a scalar), and this needs
        // one number PER CHANNEL once (1-T) varies by channel.
        let perChannel = vec3<f32>(full) - (vec3<f32>(1.0) - transmittance) * behind;
        emission = g2.xyz * (g0.w * sqrt(GAUSS_PI / (2.0 * ea)) * perChannel);
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
  return vec4<f32>(emission * u.params.w, 0.0);
}
