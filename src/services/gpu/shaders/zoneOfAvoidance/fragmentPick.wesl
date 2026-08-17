// zoneOfAvoidance/fragmentPick.wesl — analytic pick for the galactic-plane
// dust-band guide.
//
// Pick tail over the shared march in 'band.wesl', so a click only registers
// where the band's density is perceptible; on a hit it writes the band's
// constant singleton id and a fixed fallback depth (see PICK_FALLBACK_DEPTH
// — the camera sits INSIDE the shell throughout this layer's visibility
// window, so there is no real entry-point depth to project). group(0) is the
// caller-bound camera prefix, unread here; the wedge/camera-basis Uniforms
// this march needs is at group(1).

import package::zoneOfAvoidance::io::Uniforms;
import package::zoneOfAvoidance::io::VsOut;
import package::zoneOfAvoidance::band::bandDensityMask;
import package::lib::camera::CameraUniforms;
import package::lib::fadeUniforms::applyFade;

// Sentinel depth for a fragment with no real single-point distance (the
// band is a volume, not a surface): COSMO's pick pass is non-reversed-Z,
// 'less'-compares against a far-plane clear of 1.0 (zoneOfAvoidanceRenderer.ts's
// pickPipeline depthStencil), so this must be < 1.0 by more than an f32 ULP
// (~1.2e-7) to reliably beat the clear, while staying close enough to 1.0
// that it loses to every real pickable's (much nearer) depth.
const PICK_FALLBACK_DEPTH: f32 = 0.999999;
// Below this fraction of the (pre-intensity) density mask, the band has
// already faded past what the additive HDR target can show — floored here,
// not on the post-intensity alpha, so the pickable footprint tracks the
// PERCEPTIBLE band and doesn't shrink/grow with the intensity slider.
const DENSITY_MASK_FLOOR: f32 = 0.02;

@group(0) @binding(0) var<uniform> cam: CameraUniforms;
@group(1) @binding(0) var<uniform> u: Uniforms;

struct PickFSOut {
  @location(0) id: vec4<u32>,
  @builtin(frag_depth) depth: f32,
};

@fragment
fn fsPick(input: VsOut) -> PickFSOut {
  let densityMask = bandDensityMask(u, input.ndc, input.clipPos.xy);
  if (densityMask <= DENSITY_MASK_FLOOR) {
    discard;
  }
  let alpha = applyFade(u.intensity * densityMask, u.fadeAlpha);
  if (alpha <= 0.0) {
    discard;
  }

  var out: PickFSOut;
  out.id = vec4<u32>(u.packedId, 0u, 0u, 0u);
  // Last-resort hit: the band is an enveloping background haze, so it must
  // always lose to whatever real pickable drew here first.
  out.depth = PICK_FALLBACK_DEPTH;
  return out;
}
