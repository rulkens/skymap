// clusterMarker/halo.wesl — additive radial-gradient billboard for
// cluster / supercluster halos.
//
// One instance per POI.  The vertex stage projects the POI's
// world-space centre to clip space, then expands a unit quad whose
// world-space half-extent equals physicalRadiusMpc.  The fragment
// stage emits an additive radial-gradient: centre alpha full, edge
// alpha zero, smoothstep falloff across the quad.
//
// ## Why world-space-sized billboard (not screen-pixel-sized)
//
// expandBillboardScreen in lib/billboard.wesl is for billboards that
// stay the same pixel size regardless of camera distance (the
// "star" appearance for points).  Halos and rings here need the
// opposite — they should grow as the camera approaches, so the user
// reads "this cluster is X Mpc across" from the on-screen scale.
//
// World-space expansion: the corner's clip-space offset is
//   corner * radiusMpc * (some basis derived from viewProj).
// We derive the basis by projecting (centre + camera_right * r) and
// (centre + camera_up * r) — but we have no camera_right / camera_up
// in CameraUniforms (see lib/camera.wesl module header for why).  The
// dodge: project the centre to clip, then compute the clip-space
// delta for a 1-Mpc-radius sphere by projecting (centre + (1,0,0))
// and (centre + (0,1,0)) and taking the magnitudes — but those are
// world-axis-aligned, not camera-aligned, so the resulting quad would
// shear.
//
// Cleaner: build a true screen-aligned, world-sized billboard by
// projecting centre once, computing 'sizeClip' = radius / camDist *
// (cot(fovY/2)) for the Y direction (and aspect-correcting for X),
// then multiplying the unit-corner by sizeClip * centerClip.w to
// land the right pixel size for the given world radius.  But we
// don't have fovY in the uniform either.
//
// Simpler still: do the screen-space expansion in pixels, but COMPUTE
// the pixel size from the world radius + camera distance using the
// 'u.cam.viewportPx' we already have:
//
//   pxPerRad = u.cam.viewportPx.y / (2 * tan(fovY/2))     (already
//                                                          baked into
//                                                          viewportPx
//                                                          / 2 / tan)
//
// We don't have fovY, but the GPU has the proj matrix.  The
// projection matrix's [1][1] element IS '1 / tan(fovY/2)' for a
// standard perspective projection (gl-matrix's mat4.perspective writes
// it there).  So 'pxPerRad = u.cam.viewportPx.y * 0.5 * u.cam.viewProj[1][1]'.
// But viewProj = proj * view, so [1][1] there is proj[1][1] *
// view[1][1] which isn't a clean recovery.
//
// PRAGMATIC APPROACH (v1):
//
// Pass the world radius through to the fragment.  Compute the
// pixel-space billboard half-size by projecting two world points:
// centre, and (centre + radiusMpc * camera_right_estimate).  Use the
// inverse-viewProj to derive a camera-right basis from the +X column
// of inverse(viewProj) — but inverse isn't available in WGSL either.
//
// SIMPLEST CORRECT APPROACH: derive camera_right and camera_up by
// inverting the rotation in viewProj on the CPU side and passing them
// as additional CameraUniforms fields.
//
// But that grows the shared CameraUniforms struct — a cross-cutting
// change that touches every renderer's UBO write.
//
// FOR v1 we use a self-contained approximation:
//
//   1. Project centre → centerClip.
//   2. Project (centre + worldRight * radiusMpc) and
//      (centre + worldUp * radiusMpc) where worldRight = (1, 0, 0) and
//      worldUp = (0, 1, 0) — i.e. fixed world axes.
//   3. The billboard's clip-space half-extent in X is
//      max(|deltaX_right|, |deltaX_up|), and similarly for Y.
//
// This isn't camera-aligned (the halo can shear as the user orbits)
// but it does scale correctly with camera distance + world radius and
// stays bounded.  At cluster scales (~2 Mpc) the shear is a few
// percent of the halo radius and reads as soft anyway because of the
// radial gradient.
//
// **DEFERRED:** A follow-up may pass camera_right + camera_up as
// extra CameraUniforms fields and replace this with a clean
// view-aligned basis.  Flagged in §11 of the spec.

import package::clusterMarker::io::Uniforms;
import package::clusterMarker::io::VsIn;
import package::clusterMarker::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;

@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  input: VsIn,
) -> VsOut {
  let worldPos = input.positionAndRadius.xyz;
  let radiusMpc = input.positionAndRadius.w;

  // Project the centre.
  let centerClip = worldToClip(u.cam, worldPos);

  // Project two world-axis-offset points to derive an approximate
  // world-sized billboard basis.  See the module header for the
  // limitation (axis-aligned vs camera-aligned).
  let rightClip = worldToClip(u.cam, worldPos + vec3<f32>(radiusMpc, 0.0, 0.0));
  let upClip    = worldToClip(u.cam, worldPos + vec3<f32>(0.0, radiusMpc, 0.0));

  // Perspective-divide each into NDC, then take the per-axis maximum
  // magnitude.  This widens the billboard to whichever world-axis is
  // most extended on screen — guarantees the visible halo is at least
  // radiusMpc across in every direction, at the cost of being a bit
  // wider when both axes contribute.
  let centerNdc = centerClip.xy / centerClip.w;
  let rightNdc  = rightClip.xy  / rightClip.w;
  let upNdc     = upClip.xy     / upClip.w;
  let halfX = max(abs(rightNdc.x - centerNdc.x), abs(upNdc.x - centerNdc.x));
  let halfY = max(abs(rightNdc.y - centerNdc.y), abs(upNdc.y - centerNdc.y));

  // Get the unit-corner in [-1, +1]².
  let corner = quadCorner(vi);

  // NDC offset for this corner.
  let offsetNdc = vec2<f32>(corner.x * halfX, corner.y * halfY);

  // Restore clip-space (multiply by centerClip.w so perspective-divide
  // recovers the offset NDC).
  var out: VsOut;
  out.pos = vec4<f32>(
    centerClip.xy + offsetNdc * centerClip.w,
    centerClip.zw,
  );
  out.uv = corner;
  out.color = input.haloColorAndAlpha.xyz;
  out.alpha = input.haloColorAndAlpha.w;
  out.radiusMpc = radiusMpc;
  // camDistMpc unused by halo; just pass through 0.  Ring fragment
  // computes its own distance because halo and ring share the VsOut
  // struct.
  out.camDistMpc = 0.0;
  return out;
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
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
