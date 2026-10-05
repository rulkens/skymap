// structureMarker/ring.wesl — anti-aliased ring on an eye-facing world disc.
//
// One instance per structure marker.  Vertex stage: expands a unit quad
// into a WORLD-space disc facing the eye ('expandBillboardWorld' in
// lib/billboard.wesl) and projects each corner with 'worldToClip'
// individually — no shared-centre-depth shortcut, so a corner behind the
// eye clips correctly in homogeneous space.  That basis depends only on
// '(eye, centre)', never on a view/projection matrix, so the SAME world
// curve rasterises in every view of a multi-view rig (five dome faces,
// a VR eye pair) — the property a screen-aligned expansion lacks at a
// 90-degree seam between two of those views.
//
// Fragment: compute the distance from the billboard centre in UV
// space.  At |uv| == 1 we're exactly at the marker's radius (the quad's
// half-extent IS that radius, in world units now).  Emit a 1-2 px-wide
// AA band centred on |uv| == 1, alpha = ringAlpha inside the band,
// smoothstep AA on each edge — see "Computing the band width" below.

import package::structureMarker::io::Uniforms;
import package::structureMarker::io::VsIn;
import package::structureMarker::io::VsOut;
import package::lib::camera::worldToClip;
import package::structureMarker::io::MARKER_RADIUS_RETUNE;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardWorld;
import package::lib::fadeUniforms::FadeUniforms;
import package::lib::fadeUniforms::applyFade;

@group(0) @binding(0) var<uniform> u: Uniforms;
// @group(1) FadeUniforms — see halo.wesl for the contract.
@group(1) @binding(0) var<uniform> fade: FadeUniforms;

// Ring width in CSS pixels (full visible band, halved for the AA
// smoothstep on each side).
const RING_PX_WIDTH: f32 = 1.5;
// AA falloff width, in CSS pixels.
const RING_AA_WIDTH: f32 = 1.0;
// Quad margin past the ring's |uv| == 1 line.  The ring is the unit
// circle inscribed in the [-1, 1]² quad; at the cardinal points
// (uv = (±1, 0), (0, ±1)) the band's outer edge would fall outside
// the quad and get clipped.  10% margin gives the AA band breathing
// room at every angle.  Bumps quad area by ~21%, negligible at the
// dozens-of-instances scale this renderer runs at.
const RING_QUAD_MARGIN: f32 = 1.1;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  // ii (instance_index) is forwarded into VsOut.structureIndex so the
  // companion ringPick.wesl pick fragment can pack it into the pick
  // texture identity.  The visual ring fragment ignores the field;
  // it costs one flat-interpolated u32 per vertex output and lets
  // both pipelines share one VsOut struct (see io.wesl's docstring
  // on the structureIndex slot).
  @builtin(instance_index) ii: u32,
  input: VsIn,
) -> VsOut {
  let worldPos = input.positionAndRadius.xyz;
  let radiusMpc = input.positionAndRadius.w;

  // Eye-facing world disc, widened by RING_QUAD_MARGIN so the AA band at
  // |uv| == 1 doesn't clip at the cardinal points (see constant above).
  // The 'uv' varying scales to match (corner * MARGIN), so the ring's
  // d == 1 line still lands on the marker's radius — the MARGIN scale on
  // both the geometry and the varying cancels.  Each corner is projected
  // individually with 'worldToClip': the hardware clips a corner behind
  // the eye correctly in homogeneous space, which is what makes two
  // dome faces rasterise the same world curve at their shared seam.
  let half = radiusMpc * MARKER_RADIUS_RETUNE * RING_QUAD_MARGIN;
  let corner = quadCorner(vi);
  let offset = expandBillboardWorld(u.camPosMpc.xyz, worldPos, corner, half);

  var out: VsOut;
  out.pos = worldToClip(u.cam, worldPos + offset);
  // d == 1 is still the marker radius: RING_QUAD_MARGIN scales the
  // geometry (above) and the uv (here) together, so they cancel.
  out.uv = corner * RING_QUAD_MARGIN;
  // Ring uses its own dedicated colour slot (separate from the halo)
  // so voids — which opt out of the additive halo — still get the
  // right cyan ring tint instead of falling back to halo's (0, 0, 0).
  out.color = input.ringColorAndAlpha.xyz;
  out.alpha = input.ringColorAndAlpha.w;
  out.radiusMpc = radiusMpc;
  // Per-instance structure index forwarded for the ringPick fragment.  The
  // visual fragment doesn't read it; the cost is one flat-interpolated
  // u32 per vertex output.
  out.structureIndex = ii;
  return out;
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  // Faded-out instances arrive at alpha 0.  produceMarkers now emits one
  // instance per marker-bearing structure regardless of fade (to keep the ring
  // pick instance_index aligned with the CPU getStructuresForCategory list), so
  // most of the ~hundreds of per-frame instances may be alpha 0.  An
  // alpha-0 ring already contributes nothing under the premultiplied OVER
  // blend; discarding early skips the band + AA math for those fragments.
  if (input.alpha <= 0.0) { discard; }

  let d = length(input.uv);

  // UV units per screen pixel at this fragment, from the rasteriser's own
  // derivatives — exact for any projection, so the band is RING_PX_WIDTH
  // wide in whichever view draws it. Capped at 1: a sub-pixel ring fills
  // its quad instead of aliasing to one fragment.
  let uvPerPx = min(length(vec2<f32>(dpdx(d), dpdy(d))), 1.0);
  let bandHalfUv = RING_PX_WIDTH * 0.5 * uvPerPx;
  let aaUv = RING_AA_WIDTH * uvPerPx;

  // Distance from the |uv| == 1 ring centre line.
  let distFromRing = abs(d - 1.0);

  // 1.0 inside the band, smoothly to 0 at (band edge + AA width).
  let bandInner = bandHalfUv;
  let bandOuter = bandHalfUv + aaUv;
  let bandAlpha = 1.0 - smoothstep(bandInner, bandOuter, distFromRing);

  // applyFade folds in the per-renderer FadeUniforms.opacity
  // (alpha-only; never attenuates RGB).  Mirrors filaments/fragment.wesl.
  let a = applyFade(bandAlpha * input.alpha, fade.opacity);
  // Premultiplied alpha — pipeline blend state is OVER:
  //   (src.color * 1, dst.color * (1 - src.alpha)).
  return vec4<f32>(input.color * a, a);
}
