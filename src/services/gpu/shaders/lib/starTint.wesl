// lib/starTint.wesl — Gaia BP−RP → linear-RGB star tint, for survey stars and stream streaks.
// CPU twin: src/utils/color/starTintFromBpRp.ts (focused-star sphere, stream captions); an edit to
// the anchors or breakpoints here MUST be mirrored there (starTint.parity.test.ts pins both),
// and STREAM_BP_RP_RANGE (stellarStreams/streaks/vertex.wesl + its TS twin) spans the end ones.
// Breakpoints are approximate Gaia class centres. Each chained mix only activates once 'bpRp'
// passes its low breakpoint, when the running value already equals that segment's start anchor:
// a piecewise-linear ramp with clamped flat ends and no branch.

import package::lib::math::saturate;

fn starTint(bpRp: f32) -> vec3<f32> {
  // Spectral-class anchors, linear RGB.
  let classOB = vec3<f32>(0.6, 0.7, 1.0);   // O/B blue-white
  let classAF = vec3<f32>(1.0, 1.0, 0.98);  // A/F white
  let classG = vec3<f32>(1.0, 0.97, 0.85);  // G yellow-white
  let classK = vec3<f32>(1.0, 0.85, 0.65);  // K orange
  let classM = vec3<f32>(1.0, 0.6, 0.4);    // M red

  var tint = classOB;
  tint = mix(tint, classAF, saturate((bpRp - (-0.30)) / (0.30 - (-0.30))));
  tint = mix(tint, classG,  saturate((bpRp -   0.30 ) / (0.85 -   0.30 )));
  tint = mix(tint, classK,  saturate((bpRp -   0.85 ) / (1.25 -   0.85 )));
  tint = mix(tint, classM,  saturate((bpRp -   1.25 ) / (2.20 -   1.25 )));
  return tint;
}
