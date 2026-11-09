// lib/starTint.wesl — Gaia BP−RP → linear-RGB star tint, shared by every shader that colours stars.
// CPU twin: src/utils/color/starTintFromBpRp.ts (focused-star sphere); an edit to the anchors or
// breakpoints here MUST be mirrored there (starTint.parity.test.ts pins both).
// Breakpoints are approximate Gaia class centres. Each chained mix only activates once 'bpRp'
// passes its low breakpoint, when the running value already equals that segment's start anchor:
// a piecewise-linear ramp with clamped flat ends and no branch.

import package::lib::math::saturate;

fn starTint(bpRp: f32) -> vec3<f32> {
  // Spectral-class anchors, linear RGB.
  let ob = vec3<f32>(0.6, 0.7, 1.0);   // O/B blue-white
  let af = vec3<f32>(1.0, 1.0, 0.98);  // A/F white
  let gc = vec3<f32>(1.0, 0.97, 0.85); // G yellow-white
  let kc = vec3<f32>(1.0, 0.85, 0.65); // K orange
  let mc = vec3<f32>(1.0, 0.6, 0.4);   // M red

  var tint = ob;
  tint = mix(tint, af, saturate((bpRp - (-0.30)) / (0.30 - (-0.30))));
  tint = mix(tint, gc, saturate((bpRp -   0.30 ) / (0.85 -   0.30 )));
  tint = mix(tint, kc, saturate((bpRp -   0.85 ) / (1.25 -   0.85 )));
  tint = mix(tint, mc, saturate((bpRp -   1.25 ) / (2.20 -   1.25 )));
  return tint;
}
