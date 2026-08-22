// structureMarker/ring.wesl — screen-anti-aliased ring at world radius.
//
// One instance per structure marker.  Vertex stage: identical to halo.wesl's
// world-sized billboard expansion — same shared 'expandBillboardWorld'
// helper from lib/billboard.wesl (screen-aligned, no shear under
// orbit, see that file's "Screen-aligned vs view-aligned" subsection
// for the derivation).  The quad's half-extent is the same radiusMpc
// so the ring (drawn at exactly 'uv == 1.0' in the fragment, i.e. the
// unit circle on the quad) lands at world radius 'radiusMpc' from the
// centre.
//
// Fragment: compute the distance from the billboard centre in UV
// space.  At |uv| == 1 we're exactly at the world-space radiusMpc
// from centre (because the quad's half-extent IS radiusMpc).  Emit a
// 1-2 px-wide AA band centred on |uv| == 1, alpha = ringAlpha inside
// the band, smoothstep AA on each edge.
//
// ### Computing the band width in UV space
//
// The visible ring should be ~1-2 px wide regardless of how big the
// halo is on screen.  Convert pixel width → UV width:
//
//   sizePx  = worldLenToPx(cam, radiusMpc, centerClip.w)  — the
//             screen-pixel half-extent of the billboard, exactly the
//             same value 'expandBillboardWorld' uses internally to
//             expand the corners.
//   uvWidth = pxWidth / sizePx                            — 1 UV unit
//             spans sizePx pixels on screen.
//
// We smuggle 'sizePx' through the VsOut.camDistMpc slot rather than
// adding a dedicated varying — see the slot comment below.

import package::structureMarker::io::Uniforms;
import package::structureMarker::io::VsIn;
import package::structureMarker::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardWorld;
import package::lib::billboard::worldLenToPx;
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

  // Same world-sized, screen-aligned billboard expansion as halo.wesl,
  // but the quad is widened by RING_QUAD_MARGIN so the AA band at
  // |uv| == 1 doesn't clip at the cardinal points (see constant above).
  // The 'uv' varying scales to match (corner * MARGIN), so the ring's
  // d == 1 line still lands at world radius 'radiusMpc' — the MARGIN
  // scale on both the geometry and the varying cancels.
  let centerClip = worldToClip(u.cam, worldPos);
  let corner = quadCorner(vi);
  let offset = expandBillboardWorld(u.cam, centerClip, radiusMpc * RING_QUAD_MARGIN, corner);

  // Pixel half-extent of the billboard — the fragment needs this to
  // convert RING_PX_WIDTH / RING_AA_WIDTH into UV-space band widths.
  // Recomputed (not extracted from 'expandBillboardWorld') because
  // returning a tuple from the helper would force every caller to
  // accept a pair.  Identical cost to the work the helper does
  // internally; the WGSL compiler is free to CSE the duplicate
  // multiply.
  let sizePx = worldLenToPx(u.cam, radiusMpc, centerClip.w);

  var out: VsOut;
  out.pos = vec4<f32>(centerClip.xy + offset, centerClip.zw);
  // uv scales with MARGIN so the ring's d == 1 line lands at world
  // radius 'radiusMpc' (not MARGIN * radiusMpc): at uv = (1, 0) we're
  // at corner = (1/MARGIN, 0), pixel offset (1/MARGIN) * MARGIN *
  // sizePx = sizePx = radiusMpc.  The quad's actual cardinal edges
  // are at uv = ±MARGIN, giving the AA band room outside the ring.
  out.uv = corner * RING_QUAD_MARGIN;
  // Ring uses its own dedicated colour slot (separate from the halo)
  // so voids — which opt out of the additive halo — still get the
  // right cyan ring tint instead of falling back to halo's (0, 0, 0).
  out.color = input.ringColorAndAlpha.xyz;
  out.alpha = input.ringColorAndAlpha.w;
  out.radiusMpc = radiusMpc;
  // Smuggle 'sizePx' through the camDistMpc slot — repurposing it as
  // the per-instance pixel half-extent the fragment needs to convert
  // pixel widths to UV widths.  Cheaper than adding another VsOut
  // slot for one scalar.  Rename when a second use appears.
  out.camDistMpc = sizePx;
  // Per-instance structure index forwarded for the ringPick fragment.  The
  // visual fragment doesn't read it; the cost is one flat-interpolated
  // u32 per vertex output.
  out.structureIndex = ii;
  return out;
}

// THROWAWAY (vrSpike): 'vsFlat' is a VR-only sibling of 'vs' above, selected
// by structureMarkerRenderer.ts when 'vrOverride.active'. 'vs' expands the
// quad entirely in clip space around ONE projected centre — screen-aligned,
// so the ring always faces whichever eye is drawing it, with zero
// orientation change as the viewer's head turns. At cluster/void distances
// that's also true of translation (IPD is negligible next to Mpc), so the
// ring reads as a decal glued to the view rather than an object sitting in
// the scene. 'vsFlat' instead projects each CORNER as a real world-space
// point on a fixed XZ-plane disc (no camera-relative basis at all — the
// disc's orientation never depends on the eye), so turning your head
// reveals it edge-on like any other 3D object. Same UV/margin contract as
// 'vs' (see its comments); the fragment stage ('fs' below) is unchanged and
// shared by both entry points.
@vertex
fn vsFlat(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
  input: VsIn,
) -> VsOut {
  let worldPos = input.positionAndRadius.xyz;
  let radiusMpc = input.positionAndRadius.w;

  let corner = quadCorner(vi);
  // Fixed world-plane offset (XZ) instead of a screen-space expansion — the
  // one substantive difference from 'vs'.
  let cornerWorld = worldPos + vec3<f32>(corner.x, 0.0, corner.y) * (radiusMpc * RING_QUAD_MARGIN);
  let centerClip = worldToClip(u.cam, worldPos);
  let cornerClip = worldToClip(u.cam, cornerWorld);
  let sizePx = worldLenToPx(u.cam, radiusMpc, centerClip.w);

  var out: VsOut;
  out.pos = cornerClip;
  out.uv = corner * RING_QUAD_MARGIN;
  out.color = input.ringColorAndAlpha.xyz;
  out.alpha = input.ringColorAndAlpha.w;
  out.radiusMpc = radiusMpc;
  out.camDistMpc = sizePx;
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

  // sizePx (smuggled in camDistMpc) is the quad's pixel half-extent.
  // 1 UV unit spans sizePx pixels on screen, so 1 pixel == 1 / sizePx
  // UV units.  max(_, 1.0) guards against the sub-pixel limit where
  // the ring would otherwise alias to a single fragment.
  let uvPerPx = 1.0 / max(input.camDistMpc, 1.0);
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
