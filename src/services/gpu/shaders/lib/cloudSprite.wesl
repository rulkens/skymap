// lib/cloudSprite.wesl — shading math for the generated-galaxy sprite passes
// (milkyWay/sprites/ star + dust billboards), which the galaxy-renderer tool
// also draws through a directory symlink.
//
// The tool reaches this module through a file symlink at
// tools/galaxy-renderer/src/engine/shaders/lib/cloudSprite.wesl — WESL
// package binding is root-driven, so the file must appear inside the tool's
// own shader root to be addressable as package::lib::cloudSprite (same
// mechanism as the milkyWay/sprites/ directory symlink; see the tool's wesl.toml).
//
// What deliberately STAYS per-pass:
//   - The screen-size clamp: the star pass clamps in PIXELS (the anti-sparkle
//     floor is a star-only calibration lever), the dust pass in NDC (0.16).
//   - The fade knob: stars multiply fadeAlpha into emission, dust mixes
//     transmittance toward identity.

// Result of the flux-conserving LOD decision for one sprite. A culled
// sprite should park its quad outside clip space (all corners on one point
// past the +w plane) so nothing rasterizes; a surviving sprite scales its
// emission (or dust opacity) by boost.
struct FluxLod {
  cull: bool,
  boost: f32,
}

// Flux-conserving level-of-detail. Rather than a hard 'draw if bigger than
// N pixels' cull (which pops), each sprite fades in over a band as its NDC
// apparent size grows past a per-sprite hashed threshold, and the survivors
// are brightened by 1/(fraction that faded in), capped at 3x, so the TOTAL
// light of the field holds roughly constant as you zoom.
//
// The band's lower edge is 'h * 0.6', NOT the constant-width 'h - 0.4': a
// constant width goes negative for h < 0.4, which kept ~40% of the field at
// a positive fade no matter how far away the galaxy was — hundreds of
// thousands of sub-pixel sprites rasterizing into a handful of screen
// tiles. A proportional edge stays strictly positive, so every sprite's
// fade reaches 0 (and its quad degenerates) as apparent size shrinks. The
// hash is floored away from 0 so the smoothstep edges can never coincide
// (equal edges are indeterminate in WGSL — a NaN there would stick under
// additive blend).
//
// The hash keys on 'seedPos' (the sprite's generated local-space position),
// so a sprite's threshold is stable across camera and model motion — no
// frame-to-frame shimmer. thr <= 0 disables the LOD entirely.
fn fluxConservingLod(seedPos: vec3<f32>, apparent: f32, thr: f32) -> FluxLod {
  var r: FluxLod;
  r.cull = false;
  r.boost = 1.0;
  if (thr <= 0.0) { return r; }
  let a = apparent / thr;
  let h = max(fract(sin(dot(seedPos, vec3<f32>(12.9898, 78.233, 37.719))) * 43758.5453), 1e-4);
  let fade = smoothstep(h * 0.6, h, a);
  if (fade <= 0.0) { r.cull = true; } else { r.boost = min(fade / min(1.0, a + 0.2), 3.0); }
  return r;
}

// Star radial falloff: a tight bright core plus a wider soft glow, with the
// value AT the sprite edge (r2 = 1) subtracted so alpha reaches 0 smoothly —
// no hard rim. Returns the un-exposed alpha; callers multiply their own
// exposure/intensity knob. Callers discard at r2 > 1 before calling.
fn starGlowAlpha(r2: f32) -> f32 {
  let core = exp(-r2 * 5.0);
  let glow = exp(-r2 * 1.6) * 0.35;
  return max(0.0, (core + glow) - 0.0774);
}

// Dust per-channel transmittance. Wavelength-dependent extinction: blue is
// absorbed most, red least — multiplied onto the light behind (src*dst
// blend at the pipeline), so dust darkens + reddens rather than painting a
// brown colour. No light behind => dust is invisible (correct: you only see
// dust silhouetted against the glow it is blocking). Callers discard at
// r2 > 1 before calling.
fn dustTransmittance(r2: f32, opacity: f32) -> vec3<f32> {
  let a = smoothstep(1.0, 0.0, sqrt(r2)) * opacity;
  return clamp(vec3<f32>(1.0) - a * vec3<f32>(0.55, 0.78, 1.0), vec3<f32>(0.0), vec3<f32>(1.0));
}
