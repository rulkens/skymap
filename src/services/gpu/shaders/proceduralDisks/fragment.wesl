// proceduralDisks/fragment.wesl — procedural galaxy fragment stage.
//
// Reads the disk-local uv (in [-1, 1]² where r=1 is the impostor's
// apparent edge) and shades a two-component galaxy brightness
// profile:
//
//   - Gaussian bulge (σ = 0.4): bright inner core.
//   - Exponential disk (scale = 0.5): softer halo.
//
// Hue comes entirely from the per-galaxy colour-index ramp — the
// same ramp the points pass uses, so a galaxy's procedural-disk
// colour matches its companion point exactly. Earlier versions
// added warm-bulge / cool-disk tint shifts on top of the ramp
// colour; that made the procedural disk visibly diverge from the
// points pass (warmer at the centre, cooler at the rim) so it's
// been removed. Only the brightness profile remains.
//
// Final alpha is the combined brightness × crossfadeAlpha so the
// impostor fades in cleanly across the 8-14 px transition band.
//
// ## Why no uniform binding declared here
//
// The fragment stage doesn't read 'u' — every per-fragment quantity
// it needs is either an interpolated VsOut field or a module-scope
// const. The vertex stage in 'proceduralDisks/vertex.wesl' is the
// sole consumer of the @group(0) @binding(0) uniform buffer.
// Skipping the redeclaration here keeps the fragment module's
// linked WGSL output minimal — only the symbols the entry point
// actually references end up emitted.

import package::proceduralDisks::io::VsOut;
import package::lib::colorIndex::ramp;
// Shared fragment-stage mask shapes — see 'lib/masks.wesl' for the
// rationale (three smoothstep patterns recurred across four shaders,
// naming the shapes makes the intent visible at the call site). The
// previous inline form here was 'smoothstep(1.0, 0.6, r)' which
// relies on smoothstep's symmetry under edge inversion to produce
// the high-inside-low-outside shape; 'circularMask(r, 0.6, 1.0)'
// produces the same output and makes the inner/outer ordering
// explicit.
import package::lib::masks::circularMask;

const BULGE_SIGMA = 0.4;
const DISK_SCALE = 0.5;
const BULGE_WEIGHT = 0.6;
const DISK_WEIGHT = 0.4;

// 'ramp(t)' lives in 'lib/colorIndex.wesl' — imported above. Sharing
// the function with the points pass guarantees procedural-disk
// colour matches points colour exactly at any colour-index value, so
// the disk impostor fade-in doesn't introduce a visible cross-LOD
// hue shift.

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  if (r > 1.0) { discard; }

  let bulge = exp(-(r * r) / (2.0 * BULGE_SIGMA * BULGE_SIGMA));
  let disk  = exp(-r / DISK_SCALE);
  let intensity = bulge * BULGE_WEIGHT + disk * DISK_WEIGHT;

  // Colour: ramp hue only, no per-component tint shifts.  See the
  // fragment-stage header comment above for why the warm-bulge / cool-
  // disk tints were removed (they made this pass visibly diverge from
  // the points pass at the crossfade boundary).
  let base = ramp(in.colourIndex);
  let tinted = base;

  // Soft edge fade.  We're outputting LINEAR colour into an rgba16float
  // HDR target; the tone-map pass converts to sRGB later (see
  // toneMap/fragment.wesl).  The disk's exponential decay leaves a
  // residual 'exp(-2) ≈ 0.135' at r = 1.0 in LINEAR space, which the
  // gamma curve brightens to ~42% display brightness — that's the hard
  // edge the user sees right before the discard.
  //
  // Apply a smoothstep edge fade from r = 0.6 (full disk) to r = 1.0
  // (zero alpha), and SQUARE it to compensate for the ~2.2-power gamma:
  // a value 'x' in linear space becomes 'x^(1/2.2) ≈ x^0.45' in display.
  // To get display brightness that fades roughly linearly with r, the
  // linear intensity must fade as '(1-r')^2.2 ≈ (1-r')^2' (where r' is
  // the smoothstep parameter).  Squaring 'edgeFade' yields exactly that
  // '(smoothed)^2' shape — perceptually smooth in display space.
  //
  // We multiply the alpha (not the rgb separately) because we use
  // premultiplied alpha additive blending; alpha is the brightness
  // gate, and fading it to 0 at r = 1.0 is what removes the hard edge.
  let edgeFade = circularMask(r, 0.6, 1.0);
  let edgeFadeLinear = edgeFade * edgeFade;
  // 'procFadeOut' is the famous-WebP crossfade against the textured-disk
  // pass. 1.0 (the default for ~every galaxy) is a no-op; ramped toward
  // 0.0 only for Famous-source galaxies with a loaded curated WebP, so
  // the procedural pattern stops competing with the photo. See the
  // override site in 'proceduralDiskSubsystem.ts' and the io.wesl
  // VsOut.procFadeOut field comment.
  let alpha = intensity * in.crossfadeAlpha * edgeFadeLinear * in.procFadeOut;
  // Premultiplied alpha — matches the project's blend mode (see
  // device.ts 'alphaMode: 'premultiplied'').
  return vec4<f32>(tinted * alpha, alpha);
}
