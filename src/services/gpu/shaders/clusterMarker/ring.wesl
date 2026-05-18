// clusterMarker/ring.wesl — screen-anti-aliased ring at world radius.
//
// One instance per POI.  Vertex stage: identical to halo.wesl's
// world-sized billboard expansion (same axis-aligned basis dodge —
// see that file's module header).  The quad's half-extent is the same
// radiusMpc so the ring (drawn at exactly 'uv == 1.0' in the
// fragment, i.e. the unit circle on the quad) lands at world radius
// 'radiusMpc' from the centre.
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
//   ringPxWidth (constant, e.g. 1.5)
//   halfQuadPx  = halfNdcExtent * viewportPx.y * 0.5   (per axis)
//   uvWidth     = ringPxWidth / halfQuadPx             (so 1 UV unit
//                                                       maps to one
//                                                       half-extent
//                                                       of the quad)
//
// We approximate halfQuadPx using a single axis (Y) — close enough
// because the quad is roughly square in screen space at typical
// orientations, and the AA band is symmetric anyway.

import package::clusterMarker::io::Uniforms;
import package::clusterMarker::io::VsIn;
import package::clusterMarker::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
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

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  input: VsIn,
) -> VsOut {
  let worldPos = input.positionAndRadius.xyz;
  let radiusMpc = input.positionAndRadius.w;

  // Same world-sized billboard expansion as halo.wesl.
  let centerClip = worldToClip(u.cam, worldPos);
  let rightClip = worldToClip(u.cam, worldPos + vec3<f32>(radiusMpc, 0.0, 0.0));
  let upClip    = worldToClip(u.cam, worldPos + vec3<f32>(0.0, radiusMpc, 0.0));
  let centerNdc = centerClip.xy / centerClip.w;
  let rightNdc  = rightClip.xy  / rightClip.w;
  let upNdc     = upClip.xy     / upClip.w;
  let halfX = max(abs(rightNdc.x - centerNdc.x), abs(upNdc.x - centerNdc.x));
  let halfY = max(abs(rightNdc.y - centerNdc.y), abs(upNdc.y - centerNdc.y));

  let corner = quadCorner(vi);
  let offsetNdc = vec2<f32>(corner.x * halfX, corner.y * halfY);

  var out: VsOut;
  out.pos = vec4<f32>(
    centerClip.xy + offsetNdc * centerClip.w,
    centerClip.zw,
  );
  out.uv = corner;
  // For the ring we use the same colour slot as the halo (see io.wesl
  // module header — voids skip the halo draw entirely, and clusters /
  // SCs use the same warm tint for both passes; ringColor split is a
  // follow-up).
  out.color = input.haloColorAndAlpha.xyz;
  out.alpha = input.ringAlpha;
  out.radiusMpc = radiusMpc;
  // Pass halfY through camDistMpc — repurposing the slot as the
  // per-instance NDC half-extent the fragment needs to convert
  // pixels → UV.  Cheaper than adding another VsOut slot for one
  // scalar.  We rename when we add a second use.
  out.camDistMpc = halfY;
  return out;
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let d = length(input.uv);

  // halfY (smuggled in camDistMpc) is the quad's NDC half-extent in Y.
  // Convert to pixels: halfPx = halfY * viewportPx.y * 0.5.
  let halfPx = input.camDistMpc * u.cam.viewportPx.y * 0.5;
  // UV per pixel = 1.0 / halfPx (1 uv unit spans halfPx pixels).
  let uvPerPx = 1.0 / max(halfPx, 1.0);
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
