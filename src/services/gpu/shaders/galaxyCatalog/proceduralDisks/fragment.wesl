// proceduralDisks/fragment.wesl — procedural galaxy fragment stage (shader
// derivation exempt from the comment budget).
//
// Brightness is a Gaussian bulge (sigma 0.18) plus an exponential disk (scale
// 0.5) over disk-local uv, r = 1 at the impostor edge. The weights (0.85 / 0.15)
// sum to 1.0 so the centre peak stays 1.0 x sbAmp, the value that matches the
// companion point sprite at the crossfade; contrast comes from draining weight
// out of the halo, so the core clears the bloom threshold and the disk does not.
//
// 'in.sbAmp' comes from the SAME 'galaxySbAmp' helper as the point bake, so both
// passes agree on brightness across the 8-14 px crossfade. Hue comes from the
// SHARED 'rampRadial' ('lib/colorIndex.wesl'), the points pass's function: an
// independent tint would visibly shift hue as the impostor fades in.
//
// No uniform is declared: the fragment reads only interpolated VsOut fields and
// consts, and skipping the declaration keeps the linked WGSL minimal.

import package::galaxyCatalog::proceduralDisks::io::VsOut;
import package::lib::colorIndex::rampRadial;
import package::lib::masks::circularMask;

const BULGE_SIGMA = 0.18;
const DISK_SCALE = 0.5;
const BULGE_WEIGHT = 0.85;
const DISK_WEIGHT = 0.15;

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let r = length(in.uv);
  if (r > 1.0) { discard; }

  let bulge = exp(-(r * r) / (2.0 * BULGE_SIGMA * BULGE_SIGMA));
  let disk  = exp(-r / DISK_SCALE);
  let intensity = (bulge * BULGE_WEIGHT + disk * DISK_WEIGHT) * in.sbAmp;

  let tinted = rampRadial(in.colourIndex, r);

  // Linear HDR output: the disk's exp(-2) = 0.135 residual at r = 1 gamma-
  // brightens to ~42% display, a hard edge before the discard. The smoothstep
  // fade is squared because display brightness ~ x^0.45, so (1-r')^2 reads as
  // a roughly linear fade. Alpha carries it: blending is premultiplied additive.
  let edgeFade = circularMask(r, 0.6, 1.0);
  let edgeFadeLinear = edgeFade * edgeFade;
  // procFadeOut is 1.0 except for Famous galaxies with a loaded WebP.
  let alpha = intensity * in.crossfadeAlpha * edgeFadeLinear * in.procFadeOut * in.focusDim;
  return vec4<f32>(tinted * alpha, alpha);
}
