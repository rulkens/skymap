// milkyWayPick/vertex.wesl — screen-aligned billboard at the galactic
// centre for the Milky-Way pick path.
//
// One instance, six vertices.  The billboard is SCREEN-aligned and sized
// by 'mw.halfExtentPx' — the apparent on-screen radius of the Milky Way's
// disc at the current camera distance, floored at the galaxy point-size
// minimum.  The CPU computes that px via the shared 'selectionRingRadiusPx'
// helper (the SAME value the visible selection ring uses), so the
// invisible hit target tracks the ring the user sees as they approach the
// disk.  The floor is the same 'never shrink below a pixel' guarantee a
// galaxy point holds via 'u.pointSizePx' (see points/vertex.wesl's
// 'max(u.pointSizePx, apparentPxRadius)').
//
// The packed pick identity is composed in the vertex stage (mirroring
// points/vertex.wesl's 'packSelection(source.sourceCode, ii)') and
// forwarded flat-interpolated to the fragment.  The MW carries no
// per-record localIdx, so it is always 0; the fragment adds
// PICK_SENTINEL_OFFSET before writing so the cleared-to-zero pick
// texture stays distinguishable from a real (code, 0) hit.

import package::milkyWayPick::io::Uniforms;
import package::milkyWayPick::io::MilkyWayPickUniforms;
import package::milkyWayPick::io::VsOut;
import package::lib::camera::worldToClip;
import package::lib::billboard::quadCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::selectionEncoding::packSelection;
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;

// @group(0) CameraUniforms — reused from the caller's bound group (the
// galaxy pick draws set it).  Reads stay within the points pick buffer's
// 80-byte prefix.
@group(0) @binding(0) var<uniform> u: Uniforms;

// @group(2) MilkyWayPickUniforms — world centre + source code (written
// once at construction) + halfExtentPx (rewritten per pick by the engine
// to track the disc's apparent on-screen radius).
@group(2) @binding(0) var<uniform> mw: MilkyWayPickUniforms;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  let centerClip = worldToClip(u.cam, mw.centerWorld);
  let corner = quadCorner(vi);
  let offset = expandBillboardScreen(u.cam, centerClip, mw.halfExtentPx, corner);

  var out: VsOut;
  // Only X/Y move — depth + w pass through so the shared depth test
  // resolves a foreground galaxy over the MW billboard.
  out.pos = vec4<f32>(centerClip.xy + offset, centerClip.zw);
  out.uv = corner;
  // MW localIdx is always 0; the fragment adds PICK_SENTINEL_OFFSET.
  out.packedPick = packSelection(mw.sourceCode, 0u) + PICK_SENTINEL_OFFSET;
  return out;
}
