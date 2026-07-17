// starCatalog/tint.wesl — Gaia BP−RP colour → linear-RGB stellar tint.
//
// The survey-star renderer tints each point by its dequantized BP−RP colour
// (Gaia blue-band minus red-band magnitude, a stellar temperature proxy:
// small/negative = hot blue, large = cool red). This is the stellar sibling
// of lib/colorIndex.wesl's galaxy g−r ramp — a piecewise-linear
// interpolation over five spectral-class anchors.
//
// ## Why the anchors live here (and match palette.ts)
//
// The anchor colours are the star spectral-class palette authored in
// src/data/bodies/palette.ts (A_F_WHITE … M_RED, plus the O/B blue-white
// that palette.ts documents as 'unused' on the CPU side — no O/B star sits
// within 10 pc of the hand-seeded neighbourhood). The Gaia survey bin DOES
// carry hot early-type stars, so the blue end of the ramp is live here. The
// CPU side has no BP−RP → RGB helper by design (palette.ts: 'the colour ramp
// lives only in WGSL'), so this shader function is the single home of the
// star tint — no CPU twin to drift against.
//
// ## Why chained saturating mixes
//
// Each 'mix(running, anchor, saturate((t - lo)/(hi - lo)))' step only
// activates once 't' passes that segment's low breakpoint, and by then the
// running value already equals the segment's start anchor (every earlier
// segment saturated its interpolant to 1). So the sequence evaluates the
// correct piecewise-linear ramp with clamped flat ends — bluest anchor below
// the first breakpoint, reddest above the last — without a switch or a
// per-segment branch. The rejected alternative (a select-chain like
// lib/colorIndex.wesl) needs one comparison and one lerp per segment; the
// chained-mix form is the same op count with no branch and reads top-to-
// bottom along the spectral sequence.
//
// ## Breakpoints
//
// BP−RP breakpoints track the Gaia spectral sequence (approximate class
// centres): O/B ≈ -0.30, A/F ≈ 0.30, G ≈ 0.85, K ≈ 1.25, M ≈ 2.20. These
// are legibility anchors, not photometric calibration — Task 13 tunes them
// against the real fetched distribution.

import package::lib::math::saturate;

fn starTint(bpRp: f32) -> vec3<f32> {
  // Spectral-class anchors (linear RGB) — see src/data/bodies/palette.ts.
  let ob = vec3<f32>(0.6, 0.7, 1.0);   // O/B blue-white
  let af = vec3<f32>(1.0, 1.0, 0.98);  // A/F white
  let gc = vec3<f32>(1.0, 0.97, 0.85); // G yellow-white
  let kc = vec3<f32>(1.0, 0.85, 0.65); // K orange
  let mc = vec3<f32>(1.0, 0.6, 0.4);   // M red

  var c = ob;
  c = mix(c, af, saturate((bpRp - (-0.30)) / (0.30 - (-0.30))));
  c = mix(c, gc, saturate((bpRp -   0.30 ) / (0.85 -   0.30 )));
  c = mix(c, kc, saturate((bpRp -   0.85 ) / (1.25 -   0.85 )));
  c = mix(c, mc, saturate((bpRp -   1.25 ) / (2.20 -   1.25 )));
  return c;
}
