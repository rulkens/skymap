// structureMarker/halo.wesl — additive radial-gradient billboard for
// structure halos (clusters / superclusters; voids opt out).
//
// One instance per structure marker.  The vertex stage expands a unit
// quad into a WORLD-space disc facing the eye ('expandBillboardWorld'
// from lib/billboard.wesl) and projects each corner individually — see
// ring.wesl's header for why that, not a screen-aligned expansion, is
// what makes a multi-view rig (five dome faces, a VR eye pair) draw one
// consistent world curve instead of a seam.
//
// The fragment stage emits an additive radial gradient: centre alpha
// full, edge alpha zero, smoothstep falloff across the quad.

import package::lib::camera::CameraUniforms;
import package::structureMarker::io::VsIn;
import package::structureMarker::io::VsOut;
import package::lib::camera::worldToClip;
import package::structureMarker::io::MARKER_RADIUS_RETUNE;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardWorld;

@group(0) @binding(0) var<uniform> u: CameraUniforms;
// No @group(1): visibility rides each instance's alpha. The renderer's pipeline
// layout still lists the shared fade slot so it matches the other HDR passes.

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  input: VsIn,
) -> VsOut {
  let worldPos = input.positionAndRadius.xyz;
  let radiusMpc = input.positionAndRadius.w;

  // Eye-facing world disc — see lib/billboard.wesl's expandBillboardWorld.
  let half = radiusMpc * MARKER_RADIUS_RETUNE;
  let corner = quadCorner(vi);
  let offset = expandBillboardWorld(vec3<f32>(0.0), worldPos, corner, half);

  var out: VsOut;
  out.pos = worldToClip(u, worldPos + offset);
  out.uv = corner;
  out.color = input.haloColorAndAlpha.xyz;
  out.alpha = input.haloColorAndAlpha.w;
  out.radiusMpc = radiusMpc;
  // structureIndex is consumed only by the ringPick fragment.  Halo doesn't
  // need it but WGSL requires every field of a returned struct to be
  // initialised, so we pass 0u.  All six vertices of one instance share
  // the same value (flat-interpolated in io.wesl); never read here.
  out.structureIndex = 0u;
  out.pickable = 0.0;
  return out;
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  // Faded-out instances arrive at alpha 0.  produceMarkers now emits one
  // instance per marker-bearing structure regardless of fade (to keep the ring
  // pick instance_index aligned with the CPU getStructuresForCategory list), so
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
  let a = g * input.alpha;
  return vec4<f32>(input.color * a, a);
}
