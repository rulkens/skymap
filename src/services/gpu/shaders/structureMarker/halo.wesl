// structureMarker/halo.wesl — additive radial-gradient billboard for
// structure halos (clusters / superclusters; voids opt out).
//
// One instance per structure marker.  The vertex stage projects the
// marker's world-space centre to clip space, then expands a unit quad
// whose world-space half-extent equals physicalRadiusMpc using the
// shared 'expandBillboardWorld' helper in lib/billboard.wesl —
// screen-axis-aligned (no shear under orbit), world-sized (grows
// naturally as the camera approaches), zero extra uniforms.  See
// lib/billboard.wesl's "Screen-aligned vs view-aligned" subsection.
//
// The fragment stage emits an additive radial gradient: centre alpha
// full, edge alpha zero, smoothstep falloff across the quad.

import package::structureMarker::io::Uniforms;
import package::structureMarker::io::VsIn;
import package::structureMarker::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardWorld;
import package::lib::fadeUniforms::FadeUniforms;
import package::lib::fadeUniforms::applyFade;

@group(0) @binding(0) var<uniform> u: Uniforms;
// @group(1) FadeUniforms — the shared per-renderer opacity uniform
// every HDR pass uses.  See lib/fadeUniforms.wesl for the contract
// and filaments/fragment.wesl for the canonical consumer pattern.
@group(1) @binding(0) var<uniform> fade: FadeUniforms;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  input: VsIn,
) -> VsOut {
  let worldPos = input.positionAndRadius.xyz;
  let radiusMpc = input.positionAndRadius.w;

  // Project the centre, expand the unit quad's corner into a
  // screen-aligned, world-sized clip-space offset.  See
  // lib/billboard.wesl for the derivation.
  let centerClip = worldToClip(u.cam, worldPos);
  let corner = quadCorner(vi);
  let offset = expandBillboardWorld(u.cam, centerClip, radiusMpc, corner);

  var out: VsOut;
  out.pos = vec4<f32>(centerClip.xy + offset, centerClip.zw);
  out.uv = corner;
  out.color = input.haloColorAndAlpha.xyz;
  out.alpha = input.haloColorAndAlpha.w;
  out.radiusMpc = radiusMpc;
  // camDistMpc unused by halo; just pass through 0.  Ring fragment
  // computes its own distance because halo and ring share the VsOut
  // struct.
  out.camDistMpc = 0.0;
  // poiIndex is consumed only by the ringPick fragment.  Halo doesn't
  // need it but WGSL requires every field of a returned struct to be
  // initialised, so we pass 0u.  All six vertices of one instance share
  // the same value (flat-interpolated in io.wesl); never read here.
  out.poiIndex = 0u;
  return out;
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  // Faded-out instances arrive at alpha 0.  produceMarkers now emits one
  // instance per marker-bearing POI regardless of fade (to keep the ring
  // pick instance_index aligned with the CPU getPoisForCategory list), so
  // most of the ~hundreds of per-frame instances may be alpha 0.  An
  // alpha-0 halo already adds nothing under the additive (one, one) blend;
  // discarding early skips the gradient math for those fragments.
  if (input.alpha <= 0.0) { discard; }

  // Radial gradient: centre alpha full, edge zero.
  // length(input.uv) is 0 at centre, ~1.414 at corner; we clamp to 1.0
  // so the diagonal corner of the quad still gets faded to zero
  // smoothly.
  let r = length(input.uv);
  let g = 1.0 - smoothstep(0.0, 1.0, r);
  // Premultiplied alpha output for additive blend.  The pipeline's
  // blend state is (one, one) so we don't need the destination factor
  // to read alpha; emitting color * (g * input.alpha) and alpha = 0 (or
  // 1, doesn't matter for additive) both work.  We emit alpha = g *
  // input.alpha so a future blend-state change (e.g. additive-with-
  // alpha-cap) sees a coherent vec4.
  //
  // applyFade folds in the per-renderer FadeUniforms.opacity (always
  // alpha-only — never let opacity attenuate RGB).  Mirror of the
  // filaments-fragment pattern.
  let a = applyFade(g * input.alpha, fade.opacity);
  return vec4<f32>(input.color * a, a);
}
